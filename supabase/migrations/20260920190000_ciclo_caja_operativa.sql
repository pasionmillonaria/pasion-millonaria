-- Ciclo diario de caja basado en la hora de Colombia, con corte a las 23:00.
ALTER TABLE public.caja_diaria
  ADD COLUMN IF NOT EXISTS cerrada_automaticamente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cerrada_en timestamptz;

ALTER TABLE public.registros_caja
  ADD COLUMN IF NOT EXISTS ocurrio_en timestamptz,
  ADD COLUMN IF NOT EXISTS sincronizado_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cliente_operacion_id text;

CREATE UNIQUE INDEX IF NOT EXISTS registros_caja_cliente_operacion_uidx
  ON public.registros_caja (cliente_operacion_id)
  WHERE cliente_operacion_id IS NOT NULL;

UPDATE public.registros_caja
SET ocurrio_en = (fecha::text || ' ' || hora::text)::timestamp AT TIME ZONE 'America/Bogota'
WHERE ocurrio_en IS NULL;

ALTER TABLE public.registros_caja ALTER COLUMN ocurrio_en SET NOT NULL;

CREATE OR REPLACE FUNCTION public.fecha_operativa(p_instante timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN (p_instante AT TIME ZONE 'America/Bogota')::time >= time '23:00'
      THEN (p_instante AT TIME ZONE 'America/Bogota')::date + 1
    ELSE (p_instante AT TIME ZONE 'America/Bogota')::date
  END;
$$;

CREATE OR REPLACE FUNCTION public.saldo_final_caja(p_caja_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT cd.saldo_inicial
    + COALESCE(sum(CASE WHEN rc.tipo = 'venta' THEN rc.monto_efectivo ELSE 0 END), 0)
    + COALESCE(sum(CASE WHEN rc.tipo = 'ingreso' AND rc.metodo_pago = 'efectivo' THEN rc.valor ELSE 0 END), 0)
    - COALESCE(sum(CASE WHEN rc.tipo = 'gasto' AND rc.metodo_pago = 'efectivo' THEN rc.valor ELSE 0 END), 0)
    - cd.guardado_caja_fuerte
  FROM caja_diaria cd
  LEFT JOIN registros_caja rc ON rc.caja_diaria_id = cd.id
  WHERE cd.id = p_caja_id
  GROUP BY cd.id;
$$;

CREATE OR REPLACE FUNCTION public.cerrar_cajas_vencidas(p_ahora timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fecha_actual date := public.fecha_operativa(p_ahora);
  v_caja record;
  v_saldo numeric;
  v_total integer := 0;
BEGIN
  FOR v_caja IN
    SELECT id FROM caja_diaria
    WHERE estado = 'abierta' AND fecha < v_fecha_actual
    ORDER BY fecha
    FOR UPDATE
  LOOP
    v_saldo := public.saldo_final_caja(v_caja.id);
    UPDATE caja_diaria
    SET estado = 'cerrada',
        efectivo_contado = v_saldo,
        diferencia_caja = 0,
        cerrada_automaticamente = true,
        cerrada_en = p_ahora,
        notas = concat_ws(E'\n', NULLIF(notas, ''), 'Cierre automático 23:00 America/Bogota')
    WHERE id = v_caja.id;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.asegurar_caja_operativa(
  p_ocurrio_en timestamptz DEFAULT now(),
  p_permitir_historica_cerrada boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fecha date := public.fecha_operativa(p_ocurrio_en);
  v_fecha_actual date := public.fecha_operativa(now());
  v_caja caja_diaria%ROWTYPE;
  v_saldo numeric := 0;
BEGIN
  PERFORM public.cerrar_cajas_vencidas(now());

  SELECT * INTO v_caja FROM caja_diaria WHERE fecha = v_fecha FOR UPDATE;
  IF FOUND THEN
    IF v_caja.estado = 'cerrada' AND NOT (p_permitir_historica_cerrada AND v_fecha < v_fecha_actual) THEN
      RAISE EXCEPTION 'La caja del % está cerrada', v_fecha;
    END IF;
    RETURN v_caja.id;
  END IF;

  SELECT public.saldo_final_caja(id) INTO v_saldo
  FROM caja_diaria WHERE fecha < v_fecha ORDER BY fecha DESC LIMIT 1;

  INSERT INTO caja_diaria (fecha, saldo_inicial, guardado_caja_fuerte, estado)
  VALUES (v_fecha, COALESCE(v_saldo, 0), 0, 'abierta')
  RETURNING id INTO v_caja.id;
  RETURN v_caja.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_saldos_desde(p_fecha date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anterior numeric;
  v_caja record;
  v_saldo numeric;
BEGIN
  SELECT public.saldo_final_caja(id) INTO v_anterior
  FROM caja_diaria WHERE fecha = p_fecha;

  FOR v_caja IN
    SELECT id, estado, cerrada_automaticamente, efectivo_contado
    FROM caja_diaria WHERE fecha > p_fecha ORDER BY fecha FOR UPDATE
  LOOP
    UPDATE caja_diaria SET saldo_inicial = COALESCE(v_anterior, 0) WHERE id = v_caja.id;
    v_saldo := public.saldo_final_caja(v_caja.id);
    IF v_caja.estado = 'cerrada' THEN
      IF v_caja.cerrada_automaticamente THEN
        UPDATE caja_diaria SET efectivo_contado = v_saldo, diferencia_caja = 0 WHERE id = v_caja.id;
      ELSIF v_caja.efectivo_contado IS NOT NULL THEN
        UPDATE caja_diaria SET diferencia_caja = v_caja.efectivo_contado - v_saldo WHERE id = v_caja.id;
      END IF;
    END IF;
    v_anterior := v_saldo;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_operacion_caja(
  p_cliente_operacion_id text,
  p_ocurrio_en timestamptz,
  p_tipo text,
  p_descripcion text,
  p_valor numeric,
  p_metodo_pago text,
  p_monto_efectivo numeric,
  p_monto_transferencia numeric,
  p_producto_id bigint DEFAULT NULL,
  p_talla_id bigint DEFAULT NULL,
  p_cantidad integer DEFAULT 1,
  p_abono_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existente registros_caja%ROWTYPE;
  v_caja_id bigint;
  v_movimiento_id bigint;
  v_fecha date := public.fecha_operativa(p_ocurrio_en);
  v_hora time := (p_ocurrio_en AT TIME ZONE 'America/Bogota')::time;
  v_ubicacion_id bigint;
BEGIN
  IF p_cliente_operacion_id IS NULL OR trim(p_cliente_operacion_id) = '' THEN
    RAISE EXCEPTION 'Identificador de operación obligatorio';
  END IF;
  SELECT * INTO v_existente FROM registros_caja
  WHERE cliente_operacion_id = p_cliente_operacion_id;
  IF FOUND THEN
    RETURN jsonb_build_object('registro_id', v_existente.id, 'movimiento_id', v_existente.movimiento_id, 'caja_diaria_id', v_existente.caja_diaria_id, 'duplicado', true);
  END IF;
  IF p_tipo NOT IN ('venta','gasto','ingreso','caja_fuerte') OR p_valor = 0 THEN
    RAISE EXCEPTION 'Tipo o valor de caja no válido';
  END IF;

  v_caja_id := public.asegurar_caja_operativa(p_ocurrio_en, true);

  IF p_tipo = 'venta' AND p_producto_id IS NOT NULL AND p_talla_id IS NOT NULL THEN
    SELECT ubicacion_id INTO v_ubicacion_id FROM stock
    WHERE producto_id = p_producto_id AND talla_id = p_talla_id AND cantidad >= p_cantidad
    ORDER BY cantidad DESC LIMIT 1 FOR UPDATE;
    IF v_ubicacion_id IS NULL THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;
    INSERT INTO movimientos (fecha, producto_id, talla_id, ubicacion_id, cantidad, tipo, canal, precio_venta, metodo_pago, caja_diaria_id)
    VALUES (p_ocurrio_en, p_producto_id, p_talla_id, v_ubicacion_id, p_cantidad, 'salida', 'venta_tienda', p_valor / p_cantidad, p_metodo_pago, v_caja_id)
    RETURNING id INTO v_movimiento_id;
  END IF;

  INSERT INTO registros_caja (
    caja_diaria_id, movimiento_id, abono_id, fecha, hora, tipo, descripcion, valor, metodo_pago,
    monto_efectivo, monto_transferencia, ocurrio_en, sincronizado_en, cliente_operacion_id
  ) VALUES (
    v_caja_id, v_movimiento_id, p_abono_id, v_fecha, v_hora, p_tipo, p_descripcion, p_valor, p_metodo_pago,
    p_monto_efectivo, p_monto_transferencia, p_ocurrio_en, now(), p_cliente_operacion_id
  ) RETURNING id INTO v_existente.id;

  IF v_fecha < public.fecha_operativa(now()) THEN
    PERFORM public.recalcular_saldos_desde(v_fecha);
  END IF;
  RETURN jsonb_build_object('registro_id', v_existente.id, 'movimiento_id', v_movimiento_id, 'caja_diaria_id', v_caja_id, 'duplicado', false);
END;
$$;

-- El cambio abre automáticamente la caja si es el primer movimiento monetario del día.
CREATE OR REPLACE FUNCTION public.registrar_cambio(
  p_entradas jsonb, p_salidas jsonb, p_metodo_pago text, p_referencia text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb; v_caja_id bigint; v_total_entrada numeric := 0; v_total_salida numeric := 0;
  v_diferencia numeric; v_disponible integer; v_es_libre boolean; v_fecha date := public.fecha_operativa(now());
BEGIN
  IF jsonb_typeof(p_entradas) <> 'array' OR jsonb_array_length(p_entradas) = 0 OR jsonb_typeof(p_salidas) <> 'array' OR jsonb_array_length(p_salidas) = 0 THEN RAISE EXCEPTION 'El cambio requiere prendas en ambos lados'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_entradas) LOOP
    IF COALESCE((v_item->>'cantidad')::int,0) <= 0 OR COALESCE((v_item->>'precio_unitario')::numeric,0) <= 0 THEN RAISE EXCEPTION 'Cantidad o precio inválido'; END IF;
    IF NOT EXISTS (SELECT 1 FROM productos p JOIN tallas t ON t.id=(v_item->>'talla_id')::bigint WHERE p.id=(v_item->>'producto_id')::bigint AND p.activo AND p.codigo<>'LIBRE' AND t.sistema=p.sistema_talla) THEN RAISE EXCEPTION 'Producto o talla devuelta no válidos'; END IF;
    v_total_entrada := v_total_entrada + (v_item->>'cantidad')::int * (v_item->>'precio_unitario')::numeric;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_salidas) LOOP
    IF COALESCE((v_item->>'cantidad')::int,0)<=0 OR COALESCE((v_item->>'precio_unitario')::numeric,0)<=0 OR COALESCE((v_item->>'ubicacion_id')::int,0) NOT IN (1,2) THEN RAISE EXCEPTION 'Salida inválida'; END IF;
    SELECT codigo='LIBRE' INTO v_es_libre FROM productos WHERE id=(v_item->>'producto_id')::bigint;
    IF v_es_libre IS NULL OR (v_es_libre AND NULLIF(trim(v_item->>'descripcion'),'') IS NULL) THEN RAISE EXCEPTION 'Producto de salida inválido'; END IF;
    IF NOT v_es_libre THEN
      SELECT cantidad INTO v_disponible FROM stock WHERE producto_id=(v_item->>'producto_id')::bigint AND talla_id=(v_item->>'talla_id')::bigint AND ubicacion_id=(v_item->>'ubicacion_id')::bigint FOR UPDATE;
      IF COALESCE(v_disponible,0) < (SELECT sum((x->>'cantidad')::int) FROM jsonb_array_elements(p_salidas) x WHERE (x->>'producto_id')::bigint=(v_item->>'producto_id')::bigint AND (x->>'talla_id')::bigint=(v_item->>'talla_id')::bigint AND (x->>'ubicacion_id')::bigint=(v_item->>'ubicacion_id')::bigint) THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;
    END IF;
    v_total_salida := v_total_salida + (v_item->>'cantidad')::int * (v_item->>'precio_unitario')::numeric;
  END LOOP;
  v_diferencia := v_total_salida-v_total_entrada;
  IF v_diferencia<>0 THEN v_caja_id:=public.asegurar_caja_operativa(now(),false); END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_entradas) LOOP
    INSERT INTO movimientos(producto_id,talla_id,ubicacion_id,cantidad,tipo,canal,precio_venta,movimiento_ref,caja_diaria_id) VALUES((v_item->>'producto_id')::bigint,(v_item->>'talla_id')::bigint,1,(v_item->>'cantidad')::int,'devolucion','cambio',(v_item->>'precio_unitario')::numeric,p_referencia,v_caja_id);
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_salidas) LOOP
    INSERT INTO movimientos(producto_id,talla_id,ubicacion_id,cantidad,tipo,canal,precio_venta,metodo_pago,movimiento_ref,nota,caja_diaria_id) VALUES((v_item->>'producto_id')::bigint,(v_item->>'talla_id')::bigint,(v_item->>'ubicacion_id')::bigint,(v_item->>'cantidad')::int,'salida','cambio',(v_item->>'precio_unitario')::numeric,CASE WHEN v_diferencia<>0 THEN p_metodo_pago END,p_referencia,NULLIF(trim(v_item->>'descripcion'),''),v_caja_id);
  END LOOP;
  IF v_diferencia<>0 THEN
    INSERT INTO registros_caja(caja_diaria_id,fecha,hora,tipo,descripcion,valor,metodo_pago,monto_efectivo,monto_transferencia,ocurrio_en,cliente_operacion_id)
    VALUES(v_caja_id,v_fecha,(now() AT TIME ZONE 'America/Bogota')::time,CASE WHEN v_diferencia>0 THEN 'venta' ELSE 'gasto' END,CASE WHEN v_diferencia>0 THEN 'Diferencia por cambio ' ELSE 'Reembolso por cambio ' END||p_referencia,abs(v_diferencia),p_metodo_pago,CASE WHEN p_metodo_pago='efectivo' THEN abs(v_diferencia) ELSE 0 END,CASE WHEN p_metodo_pago<>'efectivo' THEN abs(v_diferencia) ELSE 0 END,now(),p_referencia);
  END IF;
  RETURN jsonb_build_object('referencia',p_referencia,'total_entrada',v_total_entrada,'total_salida',v_total_salida,'diferencia',v_diferencia,'caja_diaria_id',v_caja_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fecha_operativa(timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_cajas_vencidas(timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asegurar_caja_operativa(timestamptz, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_operacion_caja(text,timestamptz,text,text,numeric,text,numeric,numeric,bigint,bigint,integer,bigint) TO anon, authenticated;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cierre-caja-23-bogota';
  PERFORM cron.schedule('cierre-caja-23-bogota', '0 4 * * *', 'SELECT public.cerrar_cajas_vencidas(now())');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo programar pg_cron; el cierre oportunista seguirá activo: %', SQLERRM;
END $$;
