-- Datos de prueba (Seed Data) con contraseñas encriptadas en SHA256 para Santiago y Familia
-- Nota: La contraseña de santiago es 'santiago123' (hash: b1d084be4c201eea5ea31cd2caa2ee55c65e2e1741972da185fad560f2be757a)
-- La contraseña de familia es 'familia123' (hash: 1c6b63c27f17bd26c34028a13a5704687c465bed17c7b5c71b4c9f0179ca58ef)

-- 1. Insertar Usuarios
INSERT INTO Usuarios (id_usuario, username, password, nombre, moneda) VALUES
('usr_santiago', 'santiago', 'b1d084be4c201eea5ea31cd2caa2ee55c65e2e1741972da185fad560f2be757a', 'Santiago', 'COP'),
('usr_familia', 'familia', '1c6b63c27f17bd26c34028a13a5704687c465bed17c7b5c71b4c9f0179ca58ef', 'Familia', 'USD')
ON CONFLICT(id_usuario) DO NOTHING;

-- 2. Insertar Movimientos
INSERT INTO Movimientos (id_movimiento, user_id, monto, tipo, subtipo, estado, fecha_registro, audio_efecto, divisa) VALUES
('mov_s001', 'usr_santiago', 1200000.0, 'ingreso', 'Salario Freelance', 'completado', '2026-06-25', 'coin_click.mp3', 'COP'),
('mov_s002', 'usr_santiago', 45000.0, 'gasto', 'Almuerzo ejecutivo', 'completado', '2026-06-25', 'coin_click.mp3', 'COP'),
('mov_s003', 'usr_santiago', 150.0, 'ingreso', 'Ahorro personal', 'completado', '2026-06-25', 'coin_click.mp3', 'USD'),
('mov_s004', 'usr_santiago', 12.5, 'gasto', 'Suscripción streaming', 'completado', '2026-06-25', 'coin_click.mp3', 'USD'),
('mov_f001', 'usr_familia', 3500000.0, 'ingreso', 'Fondo común mensual', 'completado', '2026-06-25', 'coin_click.mp3', 'COP'),
('mov_f002', 'usr_familia', 500.0, 'ingreso', 'Ahorro familiar', 'completado', '2026-06-25', 'coin_click.mp3', 'USD'),
('mov_f003', 'usr_familia', 95000.0, 'gasto', 'Supermercado semanal', 'completado', '2026-06-25', 'coin_click.mp3', 'COP'),
('mov_f004', 'usr_familia', 45.0, 'gasto', 'Cena familiar', 'completado', '2026-06-25', 'coin_click.mp3', 'USD')
ON CONFLICT(id_movimiento) DO NOTHING;

-- 3. Insertar Metas de Ahorro
INSERT INTO Metas (id_meta, user_id, nombre_meta, monto_objetivo, monto_actual, divisa) VALUES
('meta_s1', 'usr_santiago', 'Fondo de Emergencias', 5000000.0, 1500000.0, 'COP'),
('meta_s2', 'usr_santiago', 'Viaje a Miami', 3000.0, 450.0, 'USD'),
('meta_f1', 'usr_familia', 'Vacaciones Familiares', 8000000.0, 2000000.0, 'COP'),
('meta_f2', 'usr_familia', 'Reserva de Emergencia', 5000.0, 1000.0, 'USD')
ON CONFLICT(id_meta) DO NOTHING;
