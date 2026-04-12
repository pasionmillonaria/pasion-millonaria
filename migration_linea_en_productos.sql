-- ============================================================
-- MIGRACIÓN: linea_id directo en productos
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- PASO 1: Agregar columna linea_id a productos (nullable primero)
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS linea_id uuid REFERENCES lineas(id);

-- PASO 2: Poblar linea_id desde la categoría actual del producto
UPDATE productos p
SET linea_id = c.linea_id
FROM categorias c
WHERE p.categoria_id = c.id;

-- PASO 3: Hacer NOT NULL (todos los productos ya tienen linea_id)
ALTER TABLE productos
  ALTER COLUMN linea_id SET NOT NULL;

-- PASO 4: Recrear v_stock_total usando productos.linea_id
DROP VIEW IF EXISTS v_stock_total CASCADE;
CREATE VIEW v_stock_total AS
SELECT
  p.id            AS producto_id,
  p.codigo,
  p.referencia,
  p.linea_id,
  li.nombre       AS linea,
  ca.nombre       AS categoria,
  t.nombre        AS talla,
  p.sistema_talla,
  COALESCE(SUM(CASE WHEN u.tipo = 'tienda' THEN s.cantidad ELSE 0 END), 0) AS stock_tienda,
  COALESCE(SUM(CASE WHEN u.tipo = 'bodega' THEN s.cantidad ELSE 0 END), 0) AS stock_bodega,
  COALESCE(SUM(s.cantidad), 0)                                              AS stock_total
FROM productos    p
JOIN lineas       li ON li.id  = p.linea_id
JOIN categorias   ca ON ca.id  = p.categoria_id
JOIN stock        s  ON s.producto_id  = p.id
JOIN tallas       t  ON t.id   = s.talla_id
JOIN ubicaciones  u  ON u.id   = s.ubicacion_id
WHERE p.activo = TRUE
GROUP BY
  p.id, p.codigo, p.referencia, p.linea_id,
  li.nombre, ca.nombre, t.nombre, p.sistema_talla;

-- PASO 5: Recrear v_stock_bajo usando productos.linea_id
DROP VIEW IF EXISTS v_stock_bajo;
CREATE VIEW v_stock_bajo AS
SELECT
  p.id            AS producto_id,
  p.codigo,
  p.referencia,
  p.linea_id,
  li.nombre       AS linea,
  ca.nombre       AS categoria,
  t.nombre        AS talla,
  COALESCE(SUM(s.cantidad), 0) AS stock_total
FROM productos    p
JOIN lineas       li ON li.id  = p.linea_id
JOIN categorias   ca ON ca.id  = p.categoria_id
JOIN stock        s  ON s.producto_id  = p.id
JOIN tallas       t  ON t.id   = s.talla_id
WHERE p.activo = TRUE
GROUP BY
  p.id, p.codigo, p.referencia, p.linea_id,
  li.nombre, ca.nombre, t.nombre
HAVING COALESCE(SUM(s.cantidad), 0) <= 3;

-- ============================================================
-- NOTA: La columna linea_id en 'categorias' se conserva para
-- organizar el desplegable en los formularios de producto.
-- Ya no es la fuente de verdad para filtrar inventario.
-- ============================================================
