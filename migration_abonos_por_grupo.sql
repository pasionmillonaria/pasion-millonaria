-- Guardar abonos por grupo de apartado, no por fila individual
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS grupo_id bigint;

UPDATE abonos ab
SET grupo_id = COALESCE(ap.grupo_id, ap.id)
FROM apartados ap
WHERE ap.id = ab.apartado_id
  AND ab.grupo_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'abonos_grupo_id_fkey'
  ) THEN
    ALTER TABLE abonos
      ADD CONSTRAINT abonos_grupo_id_fkey
      FOREIGN KEY (grupo_id) REFERENCES apartados(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_abonos_grupo_id ON abonos(grupo_id);

ALTER TABLE abonos ALTER COLUMN grupo_id SET NOT NULL;

DROP VIEW IF EXISTS v_apartados_pendientes CASCADE;
CREATE VIEW v_apartados_pendientes AS
WITH totales_apartado AS (
  SELECT
    COALESCE(grupo_id, id) AS grupo_id,
    SUM(CASE WHEN estado <> 'cancelado' THEN precio ELSE 0 END) AS total_precio_activo
  FROM apartados
  GROUP BY COALESCE(grupo_id, id)
),
totales_abonos AS (
  SELECT grupo_id, SUM(monto) AS total_abonado
  FROM abonos
  GROUP BY grupo_id
)
SELECT
  a.id,
  a.fecha,
  COALESCE(a.grupo_id, a.id) AS grupo_id,
  a.estado,
  a.precio,
  a.en_tienda,
  a.observacion,
  c.nombre   AS cliente_nombre,
  c.telefono AS cliente_telefono,
  p.referencia,
  t.nombre   AS talla,
  COALESCE(tab.total_abonado, 0) AS total_abonado,
  GREATEST(COALESCE(ta.total_precio_activo, 0) - COALESCE(tab.total_abonado, 0), 0) AS saldo
FROM apartados a
JOIN clientes  c ON c.id = a.cliente_id
JOIN productos p ON p.id = a.producto_id
JOIN tallas    t ON t.id = a.talla_id
LEFT JOIN totales_apartado ta ON ta.grupo_id = COALESCE(a.grupo_id, a.id)
LEFT JOIN totales_abonos tab ON tab.grupo_id = COALESCE(a.grupo_id, a.id);
