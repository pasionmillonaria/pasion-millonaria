-- ============================================================
-- MIGRACIÓN: Rediseño módulo de Caja
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Agregar columnas nuevas a caja_diaria
ALTER TABLE caja_diaria
  ADD COLUMN IF NOT EXISTS total_ingresos_extra numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS efectivo_contado numeric,
  ADD COLUMN IF NOT EXISTS diferencia_caja numeric DEFAULT 0;

-- 2. Crear tabla registros_caja
CREATE TABLE IF NOT EXISTS registros_caja (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora time NOT NULL DEFAULT CURRENT_TIME,
  tipo text NOT NULL CHECK (tipo IN ('venta', 'gasto', 'ingreso', 'caja_fuerte')),
  descripcion text,
  producto_id integer REFERENCES productos(id) ON DELETE SET NULL,
  talla_id integer REFERENCES tallas(id) ON DELETE SET NULL,
  cantidad integer NOT NULL DEFAULT 1,
  valor numeric NOT NULL DEFAULT 0,
  metodo_pago text CHECK (metodo_pago IN ('efectivo', 'transferencia', 'mixto')),
  monto_efectivo numeric NOT NULL DEFAULT 0,
  monto_transferencia numeric NOT NULL DEFAULT 0,
  caja_diaria_id integer REFERENCES caja_diaria(id) ON DELETE CASCADE,
  usuario_id text,
  created_at timestamptz DEFAULT now()
);

-- 3. Índice para búsquedas por fecha
CREATE INDEX IF NOT EXISTS idx_registros_caja_fecha ON registros_caja(fecha);
CREATE INDEX IF NOT EXISTS idx_registros_caja_caja_diaria ON registros_caja(caja_diaria_id);

-- 4. RLS: habilitar y crear política permisiva
ALTER TABLE registros_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "registros_caja_all"
  ON registros_caja FOR ALL
  USING (true) WITH CHECK (true);
