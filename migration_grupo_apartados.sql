-- Agregar grupo_id a apartados
-- Permite agrupar múltiples prendas de un mismo pedido
ALTER TABLE apartados ADD COLUMN IF NOT EXISTS grupo_id bigint;

-- Para apartados existentes, grupo_id = su propio id (pedido individual)
UPDATE apartados SET grupo_id = id WHERE grupo_id IS NULL;

-- Actualizar vista para incluir grupo_id
DROP VIEW IF EXISTS v_apartados_pendientes CASCADE;
CREATE VIEW v_apartados_pendientes AS
SELECT
  a.id,
  a.fecha,
  a.grupo_id,
  a.estado,
  a.precio,
  a.en_tienda,
  a.observacion,
  c.nombre   AS cliente_nombre,
  c.telefono AS cliente_telefono,
  p.referencia,
  t.nombre   AS talla,
  COALESCE(SUM(ab.monto), 0)            AS total_abonado,
  a.precio - COALESCE(SUM(ab.monto), 0) AS saldo
FROM apartados a
JOIN clientes  c ON c.id = a.cliente_id
JOIN productos p ON p.id = a.producto_id
JOIN tallas    t ON t.id = a.talla_id
LEFT JOIN abonos ab ON ab.apartado_id = a.id
GROUP BY a.id, c.nombre, c.telefono, p.referencia, t.nombre;
