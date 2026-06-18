-- Fase 2 del fix de abonos.
--
-- Contexto: borrar un ingreso de abono desde la pantalla de caja solo hacía
-- DELETE en registros_caja (con anon key), dejando el abono y el apartado
-- intactos -> desincronización (el incidente original). Además registros_caja
-- y gastos permitían DELETE con la anon key (hueco conocido de la Parte B).
--
-- Esta migración:
--   1. Cierra el DELETE anónimo en registros_caja y gastos.
--   2. Crea la RPC anular_abono: la forma correcta de deshacer un abono
--      (borra el abono y su ingreso de caja vinculado, atómicamente).
-- El borrado de registros de caja pasa a ir por API route con service role,
-- que además bloquea el borrado de ingresos vinculados a un abono.

-- ── 1. Cerrar el DELETE anónimo ──────────────────────────────────────────
DROP POLICY IF EXISTS "borrar_registro_caja" ON public.registros_caja;
DROP POLICY IF EXISTS "borrar_gasto"         ON public.gastos;

-- ── 2. RPC anular_abono ──────────────────────────────────────────────────
-- Borra el abono y su ingreso de caja vinculado. Bloquea si el apartado ya
-- fue entregado (revertir una entrega implica devolver stock: es otra
-- operación). El saldo del apartado se recalcula solo (v_apartados_pendientes).
CREATE OR REPLACE FUNCTION public.anular_abono(p_abono_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo_id   bigint;
  v_caja_filas int;
BEGIN
  SELECT grupo_id INTO v_grupo_id FROM abonos WHERE id = p_abono_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abono % no existe', p_abono_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM apartados
    WHERE grupo_id = v_grupo_id AND estado = 'entregado'
  ) THEN
    RAISE EXCEPTION 'No se puede anular: el apartado ya fue entregado. Revierte la entrega primero.';
  END IF;

  -- Primero el ingreso de caja (FK abono_id), luego el abono.
  DELETE FROM registros_caja WHERE abono_id = p_abono_id;
  GET DIAGNOSTICS v_caja_filas = ROW_COUNT;

  DELETE FROM abonos WHERE id = p_abono_id;

  RETURN jsonb_build_object(
    'abono_id',      p_abono_id,
    'caja_ajustada', v_caja_filas > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.anular_abono(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anular_abono(bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_abono(bigint) TO service_role;
