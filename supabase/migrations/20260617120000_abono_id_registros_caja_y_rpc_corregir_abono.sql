-- Fase 1 del fix de abonos (incidente: abono final con método equivocado).
--
-- Problema de raíz: el flujo "Registrar Abono" inserta el abono y su ingreso en
-- registros_caja por separado y SIN vínculo (solo el texto "Abono apartado #N").
-- No había forma de corregir el método desde la app, lo que llevó a editar datos
-- a mano en Supabase y a borrar el ingreso de caja, desincronizando abono <-> caja.
-- Ver DOCUMENTACION.md (secciones Apartados y Caja).
--
-- Esta migración:
--   1. Agrega un vínculo explícito abono -> registro de caja.
--   2. Crea una RPC transaccional para corregir el método de pago de un abono
--      y ajustar su ingreso de caja vinculado en la misma transacción.

-- ── 1. Vínculo explícito ─────────────────────────────────────────────────
ALTER TABLE public.registros_caja
  ADD COLUMN IF NOT EXISTS abono_id bigint REFERENCES public.abonos(id);

CREATE INDEX IF NOT EXISTS idx_registros_caja_abono_id
  ON public.registros_caja (abono_id);

-- ── 2. RPC transaccional de corrección ───────────────────────────────────
-- Corrige el método de pago de un abono y, si tiene un ingreso de caja
-- vinculado (abono_id), lo ajusta atómicamente. El desglose efectivo /
-- transferencia replica el flujo de registrarAbono: 'efectivo' suma a
-- monto_efectivo; cualquier otro método suma a monto_transferencia.
-- Devuelve si se ajustó caja, para que la UI informe al admin.
CREATE OR REPLACE FUNCTION public.corregir_metodo_abono(
  p_abono_id bigint,
  p_metodo   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_es_efectivo boolean;
  v_caja_filas  int;
BEGIN
  IF p_metodo NOT IN ('efectivo', 'nequi', 'transferencia', 'datafono') THEN
    RAISE EXCEPTION 'Método de pago inválido: %', p_metodo;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM abonos WHERE id = p_abono_id) THEN
    RAISE EXCEPTION 'Abono % no existe', p_abono_id;
  END IF;

  v_es_efectivo := (p_metodo = 'efectivo');

  UPDATE abonos
  SET metodo_pago = p_metodo
  WHERE id = p_abono_id;

  UPDATE registros_caja
  SET metodo_pago         = p_metodo,
      monto_efectivo      = CASE WHEN v_es_efectivo THEN valor ELSE 0 END,
      monto_transferencia = CASE WHEN v_es_efectivo THEN 0 ELSE valor END
  WHERE abono_id = p_abono_id;

  GET DIAGNOSTICS v_caja_filas = ROW_COUNT;

  RETURN jsonb_build_object(
    'abono_id',      p_abono_id,
    'metodo',        p_metodo,
    'caja_ajustada', v_caja_filas > 0
  );
END;
$$;

-- Solo el endpoint server-side (service role) puede invocarla.
REVOKE ALL ON FUNCTION public.corregir_metodo_abono(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corregir_metodo_abono(bigint, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corregir_metodo_abono(bigint, text) TO service_role;
