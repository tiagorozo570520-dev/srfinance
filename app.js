const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// PostgreSQL connection pool — SSL required in production, disabled in dev
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {};
const pool = new Pool(poolConfig);

// Helper: run a parameterized query and return rows
async function query(sql, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// ── Password hashing ────────────────────────────────────────────────────────
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ── AUTH ────────────────────────────────────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
  const { email, password, nombre } = req.body;
  if (!email || !password || !nombre) {
    return res.status(400).json({ error: 'Campos requeridos: email, password, nombre' });
  }
  const emailLower = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailLower)) {
    return res.status(400).json({ error: 'El correo electrónico no es válido' });
  }
  const id_usuario = 'usr_' + Date.now() + Math.random().toString(36).substr(2, 5);
  const hashedPassword = hashPassword(password);
  try {
    await query(
      'INSERT INTO Usuarios (id_usuario, email, password, nombre) VALUES ($1, $2, $3, $4)',
      [id_usuario, emailLower, hashedPassword, nombre]
    );
    res.status(201).json({ message: 'Usuario registrado exitosamente', user: { id_usuario, email: emailLower, nombre } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Este correo ya está registrado. Intenta iniciar sesión.' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Campos requeridos: email, password' });
  }
  const hashedPassword = hashPassword(password);
  try {
    const result = await query(
      'SELECT id_usuario, email, nombre FROM Usuarios WHERE email = $1 AND password = $2',
      [email.toLowerCase().trim(), hashedPassword]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    res.json({ message: 'Inicio de sesión exitoso', user: result.rows[0] });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function checkAuth(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'No autorizado. Se requiere x-user-id header' });
  req.userId = userId;
  next();
}

// ── MOVIMIENTOS ──────────────────────────────────────────────────────────────

app.get(['/movimientos', '/api/movimientos'], checkAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM Movimientos WHERE user_id = $1', [req.userId]);
    res.json({ movimientos: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/movimientos', '/api/movimientos'], checkAuth, async (req, res) => {
  const { id_movimiento, monto, tipo, subtipo, estado, fecha_registro, audio_efecto, divisa } = req.body;
  if (!id_movimiento || monto === undefined || !tipo || !fecha_registro || !divisa) {
    return res.status(400).json({ error: 'Campos requeridos: id_movimiento, monto, tipo, fecha_registro, divisa' });
  }
  if (divisa !== 'USD' && divisa !== 'COP') {
    return res.status(400).json({ error: 'La divisa debe ser USD o COP' });
  }
  const finalAudio = audio_efecto || 'coin_click.mp3';
  try {
    await query(
      `INSERT INTO Movimientos (id_movimiento, user_id, monto, tipo, subtipo, estado, fecha_registro, audio_efecto, divisa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id_movimiento, req.userId, monto, tipo, subtipo || null, estado || null, fecha_registro, finalAudio, divisa]
    );
    res.status(201).json({ message: 'Movimiento registrado exitosamente', id_movimiento, monto, tipo, divisa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch(['/movimientos/:id', '/api/movimientos/:id'], checkAuth, async (req, res) => {
  const id_movimiento = req.params.id;
  const { monto } = req.body;
  if (monto === undefined || isNaN(parseFloat(monto)) || parseFloat(monto) <= 0) {
    return res.status(400).json({ error: 'Monto inválido' });
  }
  try {
    const result = await query(
      'UPDATE Movimientos SET monto = $1 WHERE id_movimiento = $2 AND user_id = $3',
      [parseFloat(monto), id_movimiento, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Movimiento no encontrado o no autorizado' });
    res.json({ message: 'Monto actualizado', monto: parseFloat(monto) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(['/movimientos/:id', '/api/movimientos/:id'], checkAuth, async (req, res) => {
  const id_movimiento = req.params.id;
  try {
    const result = await query(
      'DELETE FROM Movimientos WHERE id_movimiento = $1 AND user_id = $2',
      [id_movimiento, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Movimiento no encontrado o no autorizado' });
    res.json({ message: 'Movimiento eliminado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── METAS ────────────────────────────────────────────────────────────────────

app.get(['/metas', '/api/metas'], checkAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM Metas WHERE user_id = $1', [req.userId]);
    res.json({ metas: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/metas', '/api/metas'], checkAuth, async (req, res) => {
  const { id_meta, nombre_meta, monto_objetivo, monto_actual, divisa, emoji, fecha_limite, color } = req.body;
  if (!id_meta || !nombre_meta || monto_objetivo === undefined || !divisa) {
    return res.status(400).json({ error: 'Campos requeridos: id_meta, nombre_meta, monto_objetivo, divisa' });
  }
  if (divisa !== 'USD' && divisa !== 'COP') {
    return res.status(400).json({ error: 'La divisa debe ser USD o COP' });
  }
  const finalMontoActual = monto_actual !== undefined ? monto_actual : 0.0;
  try {
    await query(
      `INSERT INTO Metas (id_meta, user_id, nombre_meta, monto_objetivo, monto_actual, divisa, emoji, fecha_limite, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id_meta, req.userId, nombre_meta, monto_objetivo, finalMontoActual, divisa, emoji || null, fecha_limite || null, color || null]
    );
    res.status(201).json({ message: 'Meta registrada exitosamente', id_meta, nombre_meta, monto_objetivo, divisa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(['/metas/:id', '/api/metas/:id'], checkAuth, async (req, res) => {
  const id_meta = req.params.id;
  const { nombre_meta, monto_objetivo, divisa, emoji, fecha_limite, color } = req.body;
  if (!nombre_meta || monto_objetivo === undefined || !divisa) {
    return res.status(400).json({ error: 'Campos requeridos: nombre_meta, monto_objetivo, divisa' });
  }
  try {
    const result = await query(
      `UPDATE Metas SET nombre_meta=$1, monto_objetivo=$2, divisa=$3, emoji=$4, fecha_limite=$5, color=$6
       WHERE id_meta=$7 AND user_id=$8`,
      [nombre_meta, monto_objetivo, divisa, emoji || null, fecha_limite || null, color || null, id_meta, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Meta no encontrada o no autorizada' });
    res.json({ message: 'Meta actualizada exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(['/metas/:id', '/api/metas/:id'], checkAuth, async (req, res) => {
  const id_meta = req.params.id;
  try {
    const result = await query(
      'DELETE FROM Metas WHERE id_meta = $1 AND user_id = $2',
      [id_meta, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Meta no encontrada o no autorizada' });
    res.json({ message: 'Meta eliminada exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/metas/:id/movimiento', '/api/metas/:id/movimiento'], checkAuth, async (req, res) => {
  const id_meta = req.params.id;
  const { tipo, monto } = req.body;
  if (!tipo || monto === undefined || monto <= 0) {
    return res.status(400).json({ error: 'Campos requeridos: tipo (ahorro/retiro), monto (>0)' });
  }
  if (tipo !== 'ahorro' && tipo !== 'retiro') {
    return res.status(400).json({ error: 'Tipo debe ser ahorro o retiro' });
  }
  const client = await pool.connect();
  try {
    const metaResult = await client.query(
      'SELECT nombre_meta, divisa, monto_actual, monto_objetivo FROM Metas WHERE id_meta = $1 AND user_id = $2',
      [id_meta, req.userId]
    );
    if (metaResult.rows.length === 0) return res.status(404).json({ error: 'Meta no encontrada o no autorizada' });
    const meta = metaResult.rows[0];
    const today = new Date().toISOString().split('T')[0];
    const delta = tipo === 'ahorro' ? monto : -monto;
    const nuevoMonto = meta.monto_actual + delta;
    if (nuevoMonto < 0) return res.status(400).json({ error: 'No puedes retirar más de lo ahorrado actualmente' });

    await client.query('BEGIN');
    await client.query('UPDATE Metas SET monto_actual = $1 WHERE id_meta = $2', [nuevoMonto, id_meta]);

    const id_movimiento_meta = 'mvmt_' + Date.now() + Math.random().toString(36).substr(2, 5);
    await client.query(
      'INSERT INTO MovimientosMetas (id_movimiento_meta, meta_id, tipo, monto, fecha) VALUES ($1,$2,$3,$4,$5)',
      [id_movimiento_meta, id_meta, tipo, monto, today]
    );

    const id_movimiento = 'mov_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const ledgerTipo = tipo === 'ahorro' ? 'gasto' : 'ingreso';
    const ledgerSubtipo = tipo === 'ahorro' ? `Ahorro: ${meta.nombre_meta}` : `Retiro: ${meta.nombre_meta}`;
    await client.query(
      `INSERT INTO Movimientos (id_movimiento, user_id, monto, tipo, subtipo, estado, fecha_registro, audio_efecto, divisa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id_movimiento, req.userId, monto, ledgerTipo, ledgerSubtipo, 'completado', today, 'coin_click.mp3', meta.divisa]
    );
    await client.query('COMMIT');
    res.json({ message: 'Movimiento de meta registrado con éxito', monto_actual: nuevoMonto, alcanzado: nuevoMonto >= meta.monto_objetivo });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get(['/metas/:id/historial', '/api/metas/:id/historial'], checkAuth, async (req, res) => {
  const id_meta = req.params.id;
  try {
    const metaCheck = await query('SELECT id_meta FROM Metas WHERE id_meta = $1 AND user_id = $2', [id_meta, req.userId]);
    if (metaCheck.rows.length === 0) return res.status(404).json({ error: 'Meta no encontrada o no autorizada' });
    const result = await query(
      'SELECT * FROM MovimientosMetas WHERE meta_id = $1 ORDER BY fecha DESC, id_movimiento_meta DESC',
      [id_meta]
    );
    res.json({ historial: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SR AI ENGINE ─────────────────────────────────────────────────────────────
app.post('/api/ai/consejo', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'No autorizado' });
  const { pregunta, contexto } = req.body;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'API key de Gemini no configurada.' });

  try {
    const totalsRes = await query(
      'SELECT tipo, divisa, SUM(monto) as total FROM Movimientos WHERE user_id=$1 GROUP BY tipo, divisa',
      [userId]
    );
    const recentRes = await query(
      'SELECT subtipo, tipo, divisa, monto, fecha_registro FROM Movimientos WHERE user_id=$1 ORDER BY fecha_registro DESC LIMIT 20',
      [userId]
    );
    const metasRes = await query(
      'SELECT nombre_meta, monto_objetivo, monto_actual, divisa, fecha_limite FROM Metas WHERE user_id=$1',
      [userId]
    );

    const resumenTotales = totalsRes.rows.map(t => `${t.tipo} ${t.divisa}: ${t.total}`).join(' | ');
    const resumenRecientes = recentRes.rows.slice(0,10).map(m =>
      `${m.tipo} ${m.divisa} $${m.monto} - ${m.subtipo} (${m.fecha_registro})`
    ).join('; ');
    const resumenMetas = metasRes.rows.length
      ? metasRes.rows.map(m => `${m.nombre_meta}: ${m.monto_actual}/${m.monto_objetivo} ${m.divisa}`).join(', ')
      : 'Sin metas.';

    const systemPrompt = `Eres SR AI, consejero financiero experto de SR Finance (app colombiana).
Analiza los datos REALES y da máximo 4 consejos concretos y accionables en español. Sin saludos largos.
Fecha: ${new Date().toLocaleDateString('es-CO')}
Totales: ${resumenTotales || 'Sin movimientos'}
Últimos movimientos: ${resumenRecientes || 'Ninguno'}
Metas: ${resumenMetas}${contexto ? ' | Extra: ' + contexto : ''}
Pregunta: ${pregunta || 'Dame tus mejores consejos para mejorar mis finanzas.'}`;

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    let respuesta = null;

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }], generationConfig: { maxOutputTokens: 1024, temperature: 0.7 } }) }
      );
      if (geminiRes.ok) {
        const data = await geminiRes.json();
        respuesta = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }
    } catch (e) { console.error('Gemini error:', e.message); }

    if (!respuesta && GROQ_API_KEY) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [
            { role: 'system', content: 'Eres SR AI, consejero financiero experto. Responde en español, máximo 4 consejos.' },
            { role: 'user', content: systemPrompt }
          ], max_tokens: 800, temperature: 0.7 })
        });
        if (groqRes.ok) {
          const data = await groqRes.json();
          respuesta = data.choices?.[0]?.message?.content || null;
        }
      } catch (e) { console.error('Groq error:', e.message); }
    }

    if (!respuesta) {
      return res.status(503).json({ error: '⏳ La cuota de IA gratuita se agotó por hoy. Vuelve mañana.' });
    }
    res.json({ respuesta });
  } catch (e) {
    console.error('SR AI error:', e);
    res.status(500).json({ error: 'Error interno del SR AI Engine' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor de SR Finance corriendo en http://localhost:${PORT}`);
});
