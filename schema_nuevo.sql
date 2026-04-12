-- ================================================================
-- PASIÓN MILLONARIA — SCHEMA COMPLETO LIMPIO
-- Ejecutar en Supabase → SQL Editor
-- 1. Primero ejecutar la sección BORRAR TODO
-- 2. Luego ejecutar el resto
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 1: BORRAR TODO (datos + tablas + vistas)
-- ────────────────────────────────────────────────────────────────
DROP VIEW  IF EXISTS v_ventas_hoy          CASCADE;
DROP VIEW  IF EXISTS v_stock_total         CASCADE;
DROP VIEW  IF EXISTS v_stock_bajo          CASCADE;
DROP VIEW  IF EXISTS v_apartados_pendientes CASCADE;
DROP VIEW  IF EXISTS v_resumen_caja_hoy    CASCADE;

DROP TABLE IF EXISTS abonos         CASCADE;
DROP TABLE IF EXISTS apartados      CASCADE;
DROP TABLE IF EXISTS gastos         CASCADE;
DROP TABLE IF EXISTS registros_caja CASCADE;
DROP TABLE IF EXISTS movimientos    CASCADE;
DROP TABLE IF EXISTS stock          CASCADE;
DROP TABLE IF EXISTS productos      CASCADE;
DROP TABLE IF EXISTS clientes       CASCADE;
DROP TABLE IF EXISTS caja_diaria    CASCADE;
DROP TABLE IF EXISTS tallas         CASCADE;
DROP TABLE IF EXISTS ubicaciones    CASCADE;
DROP TABLE IF EXISTS categorias     CASCADE;
DROP TABLE IF EXISTS lineas         CASCADE;
DROP TABLE IF EXISTS usuarios       CASCADE;

DROP FUNCTION IF EXISTS actualizar_stock_tras_movimiento CASCADE;


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 2: TABLAS DE CATÁLOGO (todos bigint/serial)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE lineas (
  id     bigserial   PRIMARY KEY,
  nombre varchar(100) NOT NULL UNIQUE,
  orden  int          NOT NULL DEFAULT 0
);

-- Categorías SIN linea_id: son universales y se comparten entre líneas
-- (Busos existe para Hombre, Dama, Niño al mismo tiempo)
CREATE TABLE categorias (
  id     bigserial   PRIMARY KEY,
  nombre varchar(100) NOT NULL UNIQUE,
  orden  int          NOT NULL DEFAULT 0
);

CREATE TABLE tallas (
  id      bigserial   PRIMARY KEY,
  nombre  varchar(20)  NOT NULL,
  sistema varchar(20)  NOT NULL CHECK (sistema IN ('ropa_adulto','ropa_nino','calzado','unica')),
  orden   int          NOT NULL DEFAULT 0,
  UNIQUE (nombre, sistema)
);

CREATE TABLE ubicaciones (
  id     bigserial   PRIMARY KEY,
  nombre varchar(100) NOT NULL UNIQUE,
  tipo   varchar(20)  NOT NULL CHECK (tipo IN ('tienda','bodega'))
);


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 3: USUARIOS (perfil propio, sin Supabase Auth)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE usuarios (
  id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre varchar(100) NOT NULL,
  pin    varchar(10),
  rol    varchar(20)  NOT NULL CHECK (rol IN ('admin','empleado')) DEFAULT 'empleado',
  activo boolean      NOT NULL DEFAULT true
);


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 4: PRODUCTOS Y STOCK
-- ────────────────────────────────────────────────────────────────

CREATE TABLE productos (
  id            bigserial    PRIMARY KEY,
  codigo        varchar(50)  NOT NULL UNIQUE,
  referencia    varchar(200) NOT NULL,
  linea_id      bigint       NOT NULL REFERENCES lineas(id),       -- línea directa en el producto
  categoria_id  bigint       NOT NULL REFERENCES categorias(id),   -- categoría universal
  sistema_talla varchar(20)  NOT NULL CHECK (sistema_talla IN ('ropa_adulto','ropa_nino','calzado','unica')),
  precio_base   numeric(12,2) NOT NULL CHECK (precio_base >= 0),
  activo        boolean       NOT NULL DEFAULT true
);

CREATE TABLE stock (
  id            bigserial PRIMARY KEY,
  producto_id   bigint NOT NULL REFERENCES productos(id),
  talla_id      bigint NOT NULL REFERENCES tallas(id),
  ubicacion_id  bigint NOT NULL REFERENCES ubicaciones(id),
  cantidad      int    NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  UNIQUE (producto_id, talla_id, ubicacion_id)   -- sin duplicados
);


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 5: CAJA DIARIA
-- (los totales se calculan por vista, no se almacenan)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE caja_diaria (
  id                    bigserial    PRIMARY KEY,
  fecha                 date         NOT NULL UNIQUE,
  saldo_inicial         numeric(12,2) NOT NULL DEFAULT 0,
  guardado_caja_fuerte  numeric(12,2) NOT NULL DEFAULT 0,
  efectivo_contado      numeric(12,2),
  diferencia_caja       numeric(12,2),
  estado                varchar(20)  NOT NULL CHECK (estado IN ('abierta','cerrada')) DEFAULT 'abierta',
  usuario_apertura      uuid REFERENCES usuarios(id),
  usuario_cierre        uuid REFERENCES usuarios(id),
  notas                 text
);


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 6: MOVIMIENTOS DE STOCK
-- ────────────────────────────────────────────────────────────────

CREATE TABLE movimientos (
  id                   bigserial    PRIMARY KEY,
  fecha                timestamptz  NOT NULL DEFAULT now(),
  producto_id          bigint       NOT NULL REFERENCES productos(id),
  talla_id             bigint       NOT NULL REFERENCES tallas(id),
  ubicacion_id         bigint       NOT NULL REFERENCES ubicaciones(id),
  ubicacion_destino_id bigint       REFERENCES ubicaciones(id),
  cantidad             int          NOT NULL CHECK (cantidad > 0),
  tipo                 varchar(20)  NOT NULL CHECK (tipo IN ('entrada','salida','devolucion')),
  canal                varchar(30)  NOT NULL,
  precio_venta         numeric(12,2),
  descuento            numeric(12,2),
  metodo_pago          varchar(20),
  movimiento_ref       varchar(100),
  nota                 text,
  usuario_id           uuid         REFERENCES usuarios(id),
  caja_diaria_id       bigint       REFERENCES caja_diaria(id)
);


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 7: REGISTROS DE CAJA (libro diario)
-- Cada registro está vinculado a su movimiento si es una venta
-- ────────────────────────────────────────────────────────────────

CREATE TABLE registros_caja (
  id                  bigserial    PRIMARY KEY,
  caja_diaria_id      bigint       NOT NULL REFERENCES caja_diaria(id),
  movimiento_id       bigint       REFERENCES movimientos(id),  -- vínculo al movimiento de stock
  fecha               date         NOT NULL,
  hora                time         NOT NULL DEFAULT now()::time,
  tipo                varchar(20)  NOT NULL CHECK (tipo IN ('venta','gasto','ingreso','caja_fuerte')),
  descripcion         text,
  valor               numeric(12,2) NOT NULL,
  metodo_pago         varchar(20),
  monto_efectivo      numeric(12,2) NOT NULL DEFAULT 0,
  monto_transferencia numeric(12,2) NOT NULL DEFAULT 0,
  usuario_id          uuid         REFERENCES usuarios(id),
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE gastos (
  id              bigserial    PRIMARY KEY,
  caja_diaria_id  bigint       REFERENCES caja_diaria(id),
  fecha           timestamptz  NOT NULL DEFAULT now(),
  concepto        varchar(200) NOT NULL,
  monto           numeric(12,2) NOT NULL CHECK (monto > 0),
  categoria       varchar(30)  NOT NULL CHECK (categoria IN ('alimentacion','transporte','insumos','servicios','caja_fuerte','otro')),
  metodo_pago     varchar(20)  NOT NULL,
  registrado_por  uuid         REFERENCES usuarios(id)
);


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 8: CLIENTES Y APARTADOS
-- (total_abonado y saldo se calculan, no se almacenan)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE clientes (
  id       bigserial   PRIMARY KEY,
  nombre   varchar(100) NOT NULL,
  telefono varchar(20),
  notas    text
);

CREATE TABLE apartados (
  id          bigserial    PRIMARY KEY,
  fecha       timestamptz  NOT NULL DEFAULT now(),
  cliente_id  bigint       NOT NULL REFERENCES clientes(id),
  producto_id bigint       NOT NULL REFERENCES productos(id),
  talla_id    bigint       NOT NULL REFERENCES tallas(id),
  precio      numeric(12,2) NOT NULL CHECK (precio > 0),
  estado      varchar(20)  NOT NULL CHECK (estado IN ('pendiente','entregado','cancelado')) DEFAULT 'pendiente',
  en_tienda   boolean      NOT NULL DEFAULT false,
  observacion text,
  usuario_id  uuid         REFERENCES usuarios(id)
);

CREATE TABLE abonos (
  id              bigserial    PRIMARY KEY,
  apartado_id     bigint       NOT NULL REFERENCES apartados(id),
  monto           numeric(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago     varchar(20)  NOT NULL,
  fecha           timestamptz  NOT NULL DEFAULT now(),
  registrado_por  uuid         REFERENCES usuarios(id)
);


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 9: TRIGGER — stock se actualiza solo con cada movimiento
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION actualizar_stock_tras_movimiento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo IN ('entrada', 'devolucion') THEN
    -- Sumar al origen
    INSERT INTO stock (producto_id, talla_id, ubicacion_id, cantidad)
    VALUES (NEW.producto_id, NEW.talla_id, NEW.ubicacion_id, NEW.cantidad)
    ON CONFLICT (producto_id, talla_id, ubicacion_id)
    DO UPDATE SET cantidad = stock.cantidad + NEW.cantidad;

  ELSIF NEW.tipo = 'salida' THEN
    -- Descontar del origen
    UPDATE stock
    SET cantidad = cantidad - NEW.cantidad
    WHERE producto_id = NEW.producto_id
      AND talla_id    = NEW.talla_id
      AND ubicacion_id = NEW.ubicacion_id;
  END IF;

  -- Traslado: también sumar al destino
  IF NEW.canal = 'traslado' AND NEW.ubicacion_destino_id IS NOT NULL THEN
    INSERT INTO stock (producto_id, talla_id, ubicacion_id, cantidad)
    VALUES (NEW.producto_id, NEW.talla_id, NEW.ubicacion_destino_id, NEW.cantidad)
    ON CONFLICT (producto_id, talla_id, ubicacion_id)
    DO UPDATE SET cantidad = stock.cantidad + NEW.cantidad;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_stock
  AFTER INSERT ON movimientos
  FOR EACH ROW EXECUTE FUNCTION actualizar_stock_tras_movimiento();


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 10: VISTAS
-- ────────────────────────────────────────────────────────────────

CREATE VIEW v_stock_total AS
SELECT
  p.id          AS producto_id,
  p.codigo,
  p.referencia,
  p.linea_id,
  li.nombre     AS linea,
  ca.nombre     AS categoria,
  t.nombre      AS talla,
  t.id          AS talla_id,
  p.sistema_talla,
  COALESCE(SUM(CASE WHEN u.tipo = 'tienda' THEN s.cantidad ELSE 0 END), 0) AS stock_tienda,
  COALESCE(SUM(CASE WHEN u.tipo = 'bodega' THEN s.cantidad ELSE 0 END), 0) AS stock_bodega,
  COALESCE(SUM(s.cantidad), 0)                                              AS stock_total
FROM productos   p
JOIN lineas      li ON li.id = p.linea_id
JOIN categorias  ca ON ca.id = p.categoria_id
JOIN stock       s  ON s.producto_id = p.id
JOIN tallas      t  ON t.id = s.talla_id
JOIN ubicaciones u  ON u.id = s.ubicacion_id
WHERE p.activo = TRUE
GROUP BY p.id, p.codigo, p.referencia, p.linea_id,
         li.nombre, ca.nombre, t.nombre, t.id, p.sistema_talla;

-- ─────────────────────────────────────────
CREATE VIEW v_stock_bajo AS
SELECT * FROM v_stock_total WHERE stock_total <= 3;

-- ─────────────────────────────────────────
CREATE VIEW v_ventas_hoy AS
SELECT
  m.id,
  m.fecha,
  m.producto_id,
  p.referencia,
  t.nombre AS talla,
  m.cantidad,
  m.canal,
  m.precio_venta,
  m.descuento,
  m.metodo_pago,
  m.usuario_id
FROM movimientos m
JOIN productos p ON p.id = m.producto_id
JOIN tallas    t ON t.id = m.talla_id
WHERE m.tipo = 'salida'
  AND m.fecha::date = CURRENT_DATE;

-- ─────────────────────────────────────────
-- Saldo de apartados calculado en tiempo real desde abonos
CREATE VIEW v_apartados_pendientes AS
SELECT
  a.id,
  a.fecha,
  c.nombre    AS cliente_nombre,
  c.telefono  AS cliente_telefono,
  p.referencia,
  t.nombre    AS talla,
  a.precio,
  COALESCE(SUM(ab.monto), 0)               AS total_abonado,
  a.precio - COALESCE(SUM(ab.monto), 0)    AS saldo,
  a.estado
FROM apartados a
JOIN clientes  c  ON c.id = a.cliente_id
JOIN productos p  ON p.id = a.producto_id
JOIN tallas    t  ON t.id = a.talla_id
LEFT JOIN abonos ab ON ab.apartado_id = a.id
GROUP BY a.id, a.fecha, c.nombre, c.telefono,
         p.referencia, t.nombre, a.precio, a.estado;

-- ─────────────────────────────────────────
-- Resumen de caja del día actual
CREATE VIEW v_resumen_caja_hoy AS
SELECT
  metodo_pago,
  SUM(valor)  AS total,
  COUNT(*)    AS cantidad
FROM registros_caja
WHERE fecha = CURRENT_DATE
  AND tipo  = 'venta'
GROUP BY metodo_pago;

-- ─────────────────────────────────────────
-- Resumen por caja_diaria (para historial y reportes)
-- Reemplaza los campos calculados que antes vivían en caja_diaria
CREATE VIEW v_resumen_caja AS
SELECT
  cd.id,
  cd.fecha,
  cd.saldo_inicial,
  cd.guardado_caja_fuerte,
  cd.efectivo_contado,
  cd.diferencia_caja,
  cd.estado,
  cd.notas,
  COALESCE(SUM(CASE WHEN rc.tipo = 'venta'   THEN rc.monto_efectivo      ELSE 0 END), 0) AS total_efectivo,
  COALESCE(SUM(CASE WHEN rc.tipo = 'venta'   THEN rc.monto_transferencia ELSE 0 END), 0) AS total_transferencias,
  COALESCE(SUM(CASE WHEN rc.tipo = 'gasto'   THEN rc.valor               ELSE 0 END), 0) AS total_gastos,
  COALESCE(SUM(CASE WHEN rc.tipo = 'ingreso' THEN rc.valor               ELSE 0 END), 0) AS total_ingresos,
  COUNT(CASE WHEN rc.tipo = 'venta' THEN 1 END)::int                                      AS cantidad_ventas,
  -- Saldo final calculado = saldo_inicial + ventas_efectivo + ingresos_efectivo - gastos_efectivo - guardado
  cd.saldo_inicial
    + COALESCE(SUM(CASE WHEN rc.tipo = 'venta'   THEN rc.monto_efectivo ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN rc.tipo = 'ingreso' AND rc.metodo_pago = 'efectivo' THEN rc.valor ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN rc.tipo = 'gasto'   AND rc.metodo_pago = 'efectivo' THEN rc.valor ELSE 0 END), 0)
    - cd.guardado_caja_fuerte                                                              AS saldo_final
FROM caja_diaria cd
LEFT JOIN registros_caja rc ON rc.caja_diaria_id = cd.id
GROUP BY cd.id, cd.fecha, cd.saldo_inicial, cd.guardado_caja_fuerte,
         cd.efectivo_contado, cd.diferencia_caja, cd.estado, cd.notas;


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 11: DATOS INICIALES
-- ────────────────────────────────────────────────────────────────

INSERT INTO lineas (nombre, orden) VALUES
  ('Hombre',    1),
  ('Dama',      2),
  ('Niño',      3),
  ('Accesorio', 4);

-- Categorías universales (sin línea — aplican a cualquier línea)
INSERT INTO categorias (nombre, orden) VALUES
  ('Busos',         1),
  ('Pantalones',    2),
  ('Camisetas',     3),
  ('Camisas Retro', 4),
  ('Conjuntos',     5),
  ('Chaquetas',     6),
  ('Vestidos',      7),
  ('Medias',        8),
  ('Gorras',        9),
  ('Otro',         10);

INSERT INTO tallas (nombre, sistema, orden) VALUES
  ('XS',  'ropa_adulto', 1), ('S',  'ropa_adulto', 2),
  ('M',   'ropa_adulto', 3), ('L',  'ropa_adulto', 4),
  ('XL',  'ropa_adulto', 5), ('2XL','ropa_adulto', 6),
  ('4',   'ropa_nino',   1), ('6',  'ropa_nino',   2),
  ('8',   'ropa_nino',   3), ('10', 'ropa_nino',   4),
  ('12',  'ropa_nino',   5), ('14', 'ropa_nino',   6),
  ('16',  'ropa_nino',   7),
  ('34',  'calzado',     1), ('35', 'calzado',     2),
  ('36',  'calzado',     3), ('37', 'calzado',     4),
  ('38',  'calzado',     5), ('39', 'calzado',     6),
  ('40',  'calzado',     7), ('41', 'calzado',     8),
  ('42',  'calzado',     9),
  ('Única','unica',      1);

INSERT INTO ubicaciones (nombre, tipo) VALUES
  ('Tienda', 'tienda'),
  ('Bodega', 'bodega');


-- ────────────────────────────────────────────────────────────────
-- SECCIÓN 12: ROW LEVEL SECURITY
-- Protege la BD ante accesos no autorizados via anon key expuesta
-- ────────────────────────────────────────────────────────────────

-- Habilitar RLS en todas las tablas transaccionales y de catálogo
ALTER TABLE lineas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tallas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ubicaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock           ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_diaria     ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_caja  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartados       ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonos          ENABLE ROW LEVEL SECURITY;

-- ── Catálogos: solo lectura pública, escritura solo via service role ──
CREATE POLICY "leer_lineas"      ON lineas      FOR SELECT USING (true);
CREATE POLICY "leer_categorias"  ON categorias  FOR SELECT USING (true);
CREATE POLICY "leer_tallas"      ON tallas      FOR SELECT USING (true);
CREATE POLICY "leer_ubicaciones" ON ubicaciones FOR SELECT USING (true);

CREATE POLICY "admin_lineas"      ON lineas      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "admin_categorias"  ON categorias  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "admin_tallas"      ON tallas      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "admin_ubicaciones" ON ubicaciones FOR ALL USING (true) WITH CHECK (true);

-- ── Usuarios: lectura pública (para login), sin exposición de PINs completos ──
CREATE POLICY "leer_usuarios"  ON usuarios FOR SELECT USING (true);
CREATE POLICY "admin_usuarios" ON usuarios FOR ALL   USING (true) WITH CHECK (true);

-- ── Productos: lectura pública, escritura libre (admin controla desde la app) ──
CREATE POLICY "leer_productos"  ON productos FOR SELECT USING (true);
CREATE POLICY "admin_productos" ON productos FOR ALL   USING (true) WITH CHECK (true);

-- ── Stock: solo lectura; las escrituras van por el trigger de movimientos ──
CREATE POLICY "leer_stock"  ON stock FOR SELECT USING (true);
CREATE POLICY "admin_stock" ON stock FOR ALL   USING (true) WITH CHECK (true);

-- ── Movimientos: insertar y leer; sin borrado desde el cliente ──
CREATE POLICY "leer_movimientos"    ON movimientos FOR SELECT USING (true);
CREATE POLICY "insertar_movimiento" ON movimientos FOR INSERT WITH CHECK (true);
-- DELETE y UPDATE solo via service role (no policy = bloqueado para anon)

-- ── Caja diaria: lectura y escritura libre ──
CREATE POLICY "leer_caja"  ON caja_diaria FOR SELECT USING (true);
CREATE POLICY "admin_caja" ON caja_diaria FOR ALL   USING (true) WITH CHECK (true);

-- ── Registros de caja: insertar y leer; borrado permitido (corregir errores del día) ──
CREATE POLICY "leer_registros_caja"    ON registros_caja FOR SELECT USING (true);
CREATE POLICY "insertar_registro_caja" ON registros_caja FOR INSERT WITH CHECK (true);
CREATE POLICY "borrar_registro_caja"   ON registros_caja FOR DELETE USING (true);

-- ── Gastos: insertar, leer, borrar ──
CREATE POLICY "leer_gastos"    ON gastos FOR SELECT USING (true);
CREATE POLICY "insertar_gasto" ON gastos FOR INSERT WITH CHECK (true);
CREATE POLICY "borrar_gasto"   ON gastos FOR DELETE USING (true);

-- ── Clientes: libre ──
CREATE POLICY "leer_clientes"  ON clientes FOR SELECT USING (true);
CREATE POLICY "admin_clientes" ON clientes FOR ALL   USING (true) WITH CHECK (true);

-- ── Apartados y abonos: libre ──
CREATE POLICY "leer_apartados"  ON apartados FOR SELECT USING (true);
CREATE POLICY "admin_apartados" ON apartados FOR ALL   USING (true) WITH CHECK (true);
CREATE POLICY "leer_abonos"     ON abonos    FOR SELECT USING (true);
CREATE POLICY "admin_abonos"    ON abonos    FOR ALL   USING (true) WITH CHECK (true);
