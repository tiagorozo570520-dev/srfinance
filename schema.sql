-- Esquema de base de datos para SR Finance con Aislamiento de Usuarios

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS Usuarios (
    id_usuario TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nombre TEXT NOT NULL,
    moneda TEXT DEFAULT 'USD'
);

-- 2. Tabla de Movimientos
CREATE TABLE IF NOT EXISTS Movimientos (
    id_movimiento TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    monto REAL NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('ingreso', 'gasto')),
    subtipo TEXT,
    estado TEXT,
    fecha_registro TEXT NOT NULL,
    audio_efecto TEXT DEFAULT 'coin_click.mp3',
    divisa TEXT NOT NULL CHECK(divisa IN ('USD', 'COP')),
    FOREIGN KEY(user_id) REFERENCES Usuarios(id_usuario) ON DELETE CASCADE
);

-- 3. Tabla de Metas
CREATE TABLE IF NOT EXISTS Metas (
    id_meta TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    nombre_meta TEXT NOT NULL,
    monto_objetivo REAL NOT NULL,
    monto_actual REAL DEFAULT 0.0,
    divisa TEXT NOT NULL CHECK(divisa IN ('USD', 'COP')),
    FOREIGN KEY(user_id) REFERENCES Usuarios(id_usuario) ON DELETE CASCADE
);
