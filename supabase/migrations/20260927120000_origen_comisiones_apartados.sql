-- Origen inmutable del apartado y comisiones generadas por prenda.
ALTER TABLE public.apartados
  ADD COLUMN IF NOT EXISTS origen varchar(20);

UPDATE public.apartados
SET origen = CASE WHEN canal = 'venta_tienda' THEN 'tienda' ELSE 'whatsapp' END
WHERE origen IS NULL;

ALTER TABLE public.apartados
  ALTER COLUMN origen SET DEFAULT 'tienda',
  ALTER COLUMN origen SET NOT NULL;

ALTER TABLE public.apartados
  DROP CONSTRAINT IF EXISTS apartados_origen_check;

ALTER TABLE public.apartados
  ADD CONSTRAINT apartados_origen_check CHECK (origen IN ('tienda', 'whatsapp'));

CREATE OR REPLACE FUNCTION public.impedir_cambio_origen_apartado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origen IS DISTINCT FROM OLD.origen THEN
    RAISE EXCEPTION 'El origen de un apartado es inmutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inmutable_origen_apartado ON public.apartados;
CREATE TRIGGER trg_inmutable_origen_apartado
BEFORE UPDATE OF origen ON public.apartados
FOR EACH ROW EXECUTE FUNCTION public.impedir_cambio_origen_apartado();

DROP VIEW IF EXISTS public.v_apartados_pendientes;
CREATE VIEW public.v_apartados_pendientes AS
SELECT
  a.id,
  a.fecha,
  a.grupo_id,
  a.estado,
  a.precio,
  a.en_tienda,
  a.observacion,
  a.canal,
  a.origen,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  p.referencia,
  t.nombre AS talla,
  COALESCE(SUM(ab.monto), 0) AS total_abonado,
  a.precio - COALESCE(SUM(ab.monto), 0) AS saldo
FROM public.apartados a
JOIN public.clientes c ON c.id = a.cliente_id
JOIN public.productos p ON p.id = a.producto_id
JOIN public.tallas t ON t.id = a.talla_id
LEFT JOIN public.abonos ab ON ab.apartado_id = a.id
GROUP BY a.id, c.nombre, c.telefono, p.referencia, t.nombre;

GRANT SELECT ON public.v_apartados_pendientes TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.comisiones_apartados (
  id               bigserial PRIMARY KEY,
  apartado_id      bigint NOT NULL UNIQUE REFERENCES public.apartados(id),
  grupo_id         bigint NOT NULL REFERENCES public.apartados(id),
  usuario_id       uuid REFERENCES public.usuarios(id),
  precio_unitario  numeric(12,2) NOT NULL,
  monto_comision   numeric(12,2) NOT NULL DEFAULT 1000,
  fecha_operativa  date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comisiones_apartados_fecha
  ON public.comisiones_apartados (fecha_operativa);

CREATE INDEX IF NOT EXISTS idx_comisiones_apartados_usuario
  ON public.comisiones_apartados (usuario_id);

CREATE OR REPLACE FUNCTION public.generar_comision_apartado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origen = 'tienda' AND NEW.precio >= 30000 THEN
    INSERT INTO public.comisiones_apartados (
      apartado_id, grupo_id, usuario_id, precio_unitario, monto_comision, fecha_operativa
    ) VALUES (
      NEW.id,
      COALESCE(NEW.grupo_id, NEW.id),
      NEW.usuario_id,
      NEW.precio,
      1000,
      public.fecha_operativa(COALESCE(NEW.fecha, now()))
    )
    ON CONFLICT (apartado_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generar_comision_apartado ON public.apartados;
CREATE TRIGGER trg_generar_comision_apartado
AFTER INSERT ON public.apartados
FOR EACH ROW EXECUTE FUNCTION public.generar_comision_apartado();

-- Comisiones históricas: el creador queda NULL porque los datos originales
-- no conservaron usuario_id, pero se conserva el cálculo económico.
INSERT INTO public.comisiones_apartados (
  apartado_id, grupo_id, usuario_id, precio_unitario, monto_comision, fecha_operativa, created_at
)
SELECT
  a.id,
  COALESCE(a.grupo_id, a.id),
  a.usuario_id,
  a.precio,
  1000,
  public.fecha_operativa(a.fecha),
  a.fecha
FROM public.apartados a
WHERE a.origen = 'tienda'
  AND a.precio >= 30000
ON CONFLICT (apartado_id) DO NOTHING;

ALTER TABLE public.comisiones_apartados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer_comisiones_apartados ON public.comisiones_apartados;
CREATE POLICY leer_comisiones_apartados
  ON public.comisiones_apartados FOR SELECT USING (true);

GRANT SELECT ON public.comisiones_apartados TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.comisiones_apartados_id_seq TO anon, authenticated, service_role;
