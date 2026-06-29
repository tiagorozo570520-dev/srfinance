const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'sr_finance.db');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Conexión a la base de datos y migraciones
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error al conectar con la base de datos SQLite:', err.message);
  } else {
    console.log('Conectado exitosamente a la base de datos SQLite:', DB_PATH);
    
    // Inicializar tablas base si no existen
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schemaSql, (err) => {
          if (err) {
            console.error('Error al inicializar esquema con schema.sql:', err.message);
          } else {
            console.log('Esquema base de datos inicializado/verificado con éxito.');
            runMigrations();
          }
        });
      } else {
        console.warn('Advertencia: No se encontró schema.sql. Saltando inicialización base.');
        runMigrations();
      }
    } catch (e) {
      console.error('Error al procesar schema.sql:', e.message);
      runMigrations();
    }
  }
});

function runMigrations() {
  db.serialize(() => {
    db.run("ALTER TABLE Metas ADD COLUMN emoji TEXT", (err) => {
      if (err && !err.message.includes("duplicate column name")) {
        console.error("Error al agregar columna emoji:", err.message);
      }
    });
    db.run("ALTER TABLE Metas ADD COLUMN fecha_limite TEXT", (err) => {
      if (err && !err.message.includes("duplicate column name")) {
        console.error("Error al agregar columna fecha_limite:", err.message);
      }
    });
    db.run("ALTER TABLE Metas ADD COLUMN color TEXT", (err) => {
      if (err && !err.message.includes("duplicate column name")) {
        console.error("Error al agregar columna color:", err.message);
      }
    });
    
    db.run(`
      CREATE TABLE IF NOT EXISTS MovimientosMetas (
          id_movimiento_meta TEXT PRIMARY KEY,
          meta_id TEXT NOT NULL,
          tipo TEXT NOT NULL CHECK(tipo IN ('ahorro', 'retiro')),
          monto REAL NOT NULL,
          fecha TEXT NOT NULL,
          FOREIGN KEY(meta_id) REFERENCES Metas(id_meta) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error("Error al crear tabla MovimientosMetas:", err.message);
      }
    });
  });
}

// Función para encriptar contraseñas en SHA-256
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// --- ENDPOINTS DE AUTENTICACIÓN ---

// Registrar un nuevo usuario
app.post('/api/register', (req, res) => {
  const { username, password, nombre } = req.body;
  if (!username || !password || !nombre) {
    return res.status(400).json({ error: 'Campos requeridos: username, password, nombre' });
  }

  const id_usuario = 'usr_' + Date.now() + Math.random().toString(36).substr(2, 5);
  const hashedPassword = hashPassword(password);

  const query = 'INSERT INTO Usuarios (id_usuario, username, password, nombre) VALUES (?, ?, ?, ?)';
  db.run(query, [id_usuario, username.toLowerCase(), hashedPassword, nombre], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: { id_usuario, username, nombre }
    });
  });
});

// Iniciar sesión
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Campos requeridos: username, password' });
  }

  const hashedPassword = hashPassword(password);
  const query = 'SELECT id_usuario, username, nombre FROM Usuarios WHERE username = ? AND password = ?';
  db.get(query, [username.toLowerCase(), hashedPassword], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    res.json({
      message: 'Inicio de sesión exitoso',
      user: row
    });
  });
});

// --- MIDDLEWARE DE AUTORIZACIÓN ---
function checkAuth(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'No autorizado. Se requiere x-user-id header' });
  }
  req.userId = userId;
  next();
}

// --- ENDPOINTS PARA MOVIMIENTOS ---

// Obtener movimientos del usuario activo
app.get(['/movimientos', '/api/movimientos'], checkAuth, (req, res) => {
  const query = 'SELECT * FROM Movimientos WHERE user_id = ?';
  db.all(query, [req.userId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ movimientos: rows });
  });
});

// Registrar un movimiento asociado al usuario activo
app.post(['/movimientos', '/api/movimientos'], checkAuth, (req, res) => {
  const { id_movimiento, monto, tipo, subtipo, estado, fecha_registro, audio_efecto, divisa } = req.body;
  
  // Validaciones obligatorias
  if (!id_movimiento || monto === undefined || !tipo || !fecha_registro || !divisa) {
    return res.status(400).json({ 
      error: 'Campos requeridos: id_movimiento, monto, tipo, fecha_registro, divisa' 
    });
  }

  // Validación de divisa
  if (divisa !== 'USD' && divisa !== 'COP') {
    return res.status(400).json({ error: 'La divisa debe ser USD o COP' });
  }

  const finalAudio = audio_efecto || 'coin_click.mp3';

  const query = `
    INSERT INTO Movimientos (id_movimiento, user_id, monto, tipo, subtipo, estado, fecha_registro, audio_efecto, divisa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [id_movimiento, req.userId, monto, tipo, subtipo || null, estado || null, fecha_registro, finalAudio, divisa], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ 
      message: 'Movimiento registrado exitosamente', 
      id_movimiento,
      monto,
      tipo,
      divisa 
    });
  });
});

// Eliminar un movimiento asociado al usuario activo
app.delete(['/movimientos/:id', '/api/movimientos/:id'], checkAuth, (req, res) => {
  const id_movimiento = req.params.id;
  const query = 'DELETE FROM Movimientos WHERE id_movimiento = ? AND user_id = ?';
  
  db.run(query, [id_movimiento, req.userId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado o no autorizado' });
    }
    res.json({ message: 'Movimiento eliminado exitosamente' });
  });
});


// --- ENDPOINTS PARA METAS ---

// Obtener todas las metas del usuario activo
app.get(['/metas', '/api/metas'], checkAuth, (req, res) => {
  const query = 'SELECT * FROM Metas WHERE user_id = ?';
  db.all(query, [req.userId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ metas: rows });
  });
});

// Registrar una meta asociada al usuario activo
app.post(['/metas', '/api/metas'], checkAuth, (req, res) => {
  const { id_meta, nombre_meta, monto_objetivo, monto_actual, divisa, emoji, fecha_limite, color } = req.body;

  // Validaciones obligatorias
  if (!id_meta || !nombre_meta || monto_objetivo === undefined || !divisa) {
    return res.status(400).json({ 
      error: 'Campos requeridos: id_meta, nombre_meta, monto_objetivo, divisa' 
    });
  }

  // Validación de divisa
  if (divisa !== 'USD' && divisa !== 'COP') {
    return res.status(400).json({ error: 'La divisa debe ser USD o COP' });
  }

  const finalMontoActual = monto_actual !== undefined ? monto_actual : 0.0;

  const query = `
    INSERT INTO Metas (id_meta, user_id, nombre_meta, monto_objetivo, monto_actual, divisa, emoji, fecha_limite, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [id_meta, req.userId, nombre_meta, monto_objetivo, finalMontoActual, divisa, emoji || null, fecha_limite || null, color || null], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ 
      message: 'Meta registrada exitosamente', 
      id_meta,
      nombre_meta,
      monto_objetivo,
      divisa 
    });
  });
});

// Editar una meta asociada al usuario activo
app.put(['/metas/:id', '/api/metas/:id'], checkAuth, (req, res) => {
  const id_meta = req.params.id;
  const { nombre_meta, monto_objetivo, divisa, emoji, fecha_limite, color } = req.body;

  if (!nombre_meta || monto_objetivo === undefined || !divisa) {
    return res.status(400).json({ 
      error: 'Campos requeridos: nombre_meta, monto_objetivo, divisa' 
    });
  }

  const query = `
    UPDATE Metas 
    SET nombre_meta = ?, monto_objetivo = ?, divisa = ?, emoji = ?, fecha_limite = ?, color = ?
    WHERE id_meta = ? AND user_id = ?
  `;

  db.run(query, [nombre_meta, monto_objetivo, divisa, emoji || null, fecha_limite || null, color || null, id_meta, req.userId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Meta no encontrada o no autorizada' });
    }
    res.json({ message: 'Meta actualizada exitosamente' });
  });
});

// Eliminar una meta asociada al usuario activo
app.delete(['/metas/:id', '/api/metas/:id'], checkAuth, (req, res) => {
  const id_meta = req.params.id;
  const query = 'DELETE FROM Metas WHERE id_meta = ? AND user_id = ?';

  db.run(query, [id_meta, req.userId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Meta no encontrada o no autorizada' });
    }
    res.json({ message: 'Meta eliminada exitosamente' });
  });
});

// Registrar un movimiento de ahorro o retiro en una meta
app.post(['/metas/:id/movimiento', '/api/metas/:id/movimiento'], checkAuth, (req, res) => {
  const id_meta = req.params.id;
  const { tipo, monto } = req.body; // tipo: 'ahorro' o 'retiro', monto: number

  if (!tipo || monto === undefined || monto <= 0) {
    return res.status(400).json({ error: 'Campos requeridos: tipo (ahorro/retiro), monto (>0)' });
  }

  if (tipo !== 'ahorro' && tipo !== 'retiro') {
    return res.status(400).json({ error: 'Tipo debe ser ahorro o retiro' });
  }

  // Primero obtener la meta para validar y saber la divisa y el nombre
  const selectQuery = 'SELECT nombre_meta, divisa, monto_actual, monto_objetivo FROM Metas WHERE id_meta = ? AND user_id = ?';
  db.get(selectQuery, [id_meta, req.userId], (err, meta) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!meta) {
      return res.status(404).json({ error: 'Meta no encontrada o no autorizada' });
    }

    const today = new Date().toISOString().split('T')[0];
    const delta = tipo === 'ahorro' ? monto : -monto;
    const nuevoMonto = meta.monto_actual + delta;

    if (nuevoMonto < 0) {
      return res.status(400).json({ error: 'No puedes retirar más de lo ahorrado actualmente' });
    }

    db.serialize(() => {
      // 1. Actualizar el monto de la meta
      const updateMetaQuery = 'UPDATE Metas SET monto_actual = ? WHERE id_meta = ?';
      db.run(updateMetaQuery, [nuevoMonto, id_meta]);

      // 2. Insertar en el historial de la meta
      const id_movimiento_meta = 'mvmt_' + Date.now() + Math.random().toString(36).substr(2, 5);
      const insertHistQuery = 'INSERT INTO MovimientosMetas (id_movimiento_meta, meta_id, tipo, monto, fecha) VALUES (?, ?, ?, ?, ?)';
      db.run(insertHistQuery, [id_movimiento_meta, id_meta, tipo, monto, today]);

      // 3. Crear movimiento en el ledger general (para ajustar el balance general)
      const id_movimiento = 'mov_' + Date.now() + Math.random().toString(36).substr(2, 5);
      const ledgerTipo = tipo === 'ahorro' ? 'gasto' : 'ingreso';
      const ledgerSubtipo = tipo === 'ahorro' ? `Ahorro: ${meta.nombre_meta}` : `Retiro: ${meta.nombre_meta}`;
      
      const insertLedgerQuery = `
        INSERT INTO Movimientos (id_movimiento, user_id, monto, tipo, subtipo, estado, fecha_registro, audio_efecto, divisa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(insertLedgerQuery, [id_movimiento, req.userId, monto, ledgerTipo, ledgerSubtipo, 'completado', today, 'coin_click.mp3', meta.divisa], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({
          message: 'Movimiento de meta registrado con éxito',
          monto_actual: nuevoMonto,
          alcanzado: nuevoMonto >= meta.monto_objetivo
        });
      });
    });
  });
});

// Obtener el historial de movimientos de una meta
app.get(['/metas/:id/historial', '/api/metas/:id/historial'], checkAuth, (req, res) => {
  const id_meta = req.params.id;

  const checkMeta = 'SELECT id_meta FROM Metas WHERE id_meta = ? AND user_id = ?';
  db.get(checkMeta, [id_meta, req.userId], (err, meta) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!meta) {
      return res.status(404).json({ error: 'Meta no encontrada o no autorizada' });
    }

    const query = 'SELECT * FROM MovimientosMetas WHERE meta_id = ? ORDER BY fecha DESC, id_movimiento_meta DESC';
    db.all(query, [id_meta], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ historial: rows });
    });
  });
});

// Servir index.html en la raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- NOTA DE NAVEGACIÓN ---
// Los event listeners para la navegación flotante (Cubo, Gráfica y Diana) se gestionan 
// programáticamente en el lado del cliente (dentro de index.html) usando addEventListener
// para actualizar dinámicamente y con fluidez el DOM.

app.listen(PORT, () => {
  console.log(`Servidor de SR Finance corriendo en http://localhost:${PORT}`);
});
