-- Registra un cambio completo (inventario + diferencia de caja) en una sola transaccion.
CREATE OR REPLACE FUNCTION public.registrar_cambio(
  p_entradas jsonb,
  p_salidas jsonb,
  p_metodo_pago text,
  p_referencia text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_caja_id bigint;
  v_movimiento_caja_id bigint;
  v_total_entrada numeric(12,2) := 0;
  v_total_salida numeric(12,2) := 0;
  v_diferencia numeric(12,2);
  v_disponible integer;
  v_es_libre boolean;
BEGIN
  IF jsonb_typeof(p_entradas) <> 'array' OR jsonb_array_length(p_entradas) = 0 OR
     jsonb_typeof(p_salidas) <> 'array' OR jsonb_array_length(p_salidas) = 0 THEN
    RAISE EXCEPTION 'El cambio requiere al menos una prenda en cada lado';
  END IF;

  IF NULLIF(trim(p_referencia), '') IS NULL THEN
    RAISE EXCEPTION 'La referencia del cambio es obligatoria';
  END IF;

  -- Valida todas las lineas antes de insertar. Las filas de stock se bloquean
  -- para evitar que dos operaciones consuman las mismas unidades.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_entradas)
  LOOP
    IF COALESCE((v_item->>'cantidad')::integer, 0) <= 0 OR
       COALESCE((v_item->>'precio_unitario')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Cantidad y precio de devolucion deben ser mayores a cero';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM productos p
      JOIN tallas t ON t.id = (v_item->>'talla_id')::bigint
      WHERE p.id = (v_item->>'producto_id')::bigint
        AND p.activo AND p.codigo <> 'LIBRE' AND t.sistema = p.sistema_talla
    ) THEN
      RAISE EXCEPTION 'Producto o talla devuelta no validos';
    END IF;
    v_total_entrada := v_total_entrada +
      (v_item->>'cantidad')::integer * (v_item->>'precio_unitario')::numeric;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_salidas)
  LOOP
    IF COALESCE((v_item->>'cantidad')::integer, 0) <= 0 OR
       COALESCE((v_item->>'precio_unitario')::numeric, 0) <= 0 OR
       COALESCE((v_item->>'ubicacion_id')::integer, 0) NOT IN (1, 2) THEN
      RAISE EXCEPTION 'Cantidad, precio o ubicacion de salida no validos';
    END IF;

    SELECT codigo = 'LIBRE' INTO v_es_libre
    FROM productos WHERE id = (v_item->>'producto_id')::bigint;
    IF v_es_libre IS NULL THEN
      RAISE EXCEPTION 'Producto de salida no valido';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM tallas t JOIN productos p ON p.id = (v_item->>'producto_id')::bigint
      WHERE t.id = (v_item->>'talla_id')::bigint
        AND (p.codigo = 'LIBRE' OR (p.activo AND t.sistema = p.sistema_talla))
    ) THEN
      RAISE EXCEPTION 'Talla de salida no valida';
    END IF;
    IF v_es_libre AND NULLIF(trim(v_item->>'descripcion'), '') IS NULL THEN
      RAISE EXCEPTION 'El articulo libre requiere descripcion';
    END IF;

    IF NOT v_es_libre THEN
      SELECT cantidad INTO v_disponible
      FROM stock
      WHERE producto_id = (v_item->>'producto_id')::bigint
        AND talla_id = (v_item->>'talla_id')::bigint
        AND ubicacion_id = (v_item->>'ubicacion_id')::bigint
      FOR UPDATE;
      IF COALESCE(v_disponible, 0) < (
        SELECT sum((linea->>'cantidad')::integer)
        FROM jsonb_array_elements(p_salidas) linea
        WHERE (linea->>'producto_id')::bigint = (v_item->>'producto_id')::bigint
          AND (linea->>'talla_id')::bigint = (v_item->>'talla_id')::bigint
          AND (linea->>'ubicacion_id')::bigint = (v_item->>'ubicacion_id')::bigint
      ) THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto %', v_item->>'producto_id';
      END IF;
    END IF;
    v_total_salida := v_total_salida +
      (v_item->>'cantidad')::integer * (v_item->>'precio_unitario')::numeric;
  END LOOP;

  v_diferencia := v_total_salida - v_total_entrada;
  IF v_diferencia <> 0 THEN
    IF p_metodo_pago NOT IN ('efectivo', 'nequi', 'transferencia', 'datafono') THEN
      RAISE EXCEPTION 'Metodo de pago no valido';
    END IF;
    SELECT id INTO v_caja_id FROM caja_diaria
    WHERE fecha = CURRENT_DATE AND estado = 'abierta'
    FOR UPDATE;
    IF v_caja_id IS NULL THEN
      RAISE EXCEPTION 'No hay una caja abierta para registrar la diferencia';
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_entradas)
  LOOP
    INSERT INTO movimientos (
      producto_id, talla_id, ubicacion_id, cantidad, tipo, canal,
      precio_venta, movimiento_ref, caja_diaria_id
    ) VALUES (
      (v_item->>'producto_id')::bigint, (v_item->>'talla_id')::bigint, 1,
      (v_item->>'cantidad')::integer, 'devolucion', 'cambio',
      (v_item->>'precio_unitario')::numeric, p_referencia, v_caja_id
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_salidas)
  LOOP
    INSERT INTO movimientos (
      producto_id, talla_id, ubicacion_id, cantidad, tipo, canal,
      precio_venta, metodo_pago, movimiento_ref, nota, caja_diaria_id
    ) VALUES (
      (v_item->>'producto_id')::bigint, (v_item->>'talla_id')::bigint,
      (v_item->>'ubicacion_id')::bigint, (v_item->>'cantidad')::integer,
      'salida', 'cambio', (v_item->>'precio_unitario')::numeric,
      CASE WHEN v_diferencia <> 0 THEN p_metodo_pago ELSE NULL END,
      p_referencia, NULLIF(trim(v_item->>'descripcion'), ''), v_caja_id
    ) RETURNING id INTO v_movimiento_caja_id;
  END LOOP;

  IF v_diferencia <> 0 THEN
    INSERT INTO registros_caja (
      caja_diaria_id, movimiento_id, fecha, tipo, descripcion, valor,
      metodo_pago, monto_efectivo, monto_transferencia
    ) VALUES (
      v_caja_id, NULL, CURRENT_DATE,
      CASE WHEN v_diferencia > 0 THEN 'venta' ELSE 'gasto' END,
      CASE WHEN v_diferencia > 0 THEN 'Diferencia por cambio ' ELSE 'Reembolso por cambio ' END || p_referencia,
      abs(v_diferencia), p_metodo_pago,
      CASE WHEN p_metodo_pago = 'efectivo' THEN abs(v_diferencia) ELSE 0 END,
      CASE WHEN p_metodo_pago <> 'efectivo' THEN abs(v_diferencia) ELSE 0 END
    );
  END IF;

  RETURN jsonb_build_object(
    'referencia', p_referencia,
    'total_entrada', v_total_entrada,
    'total_salida', v_total_salida,
    'diferencia', v_diferencia,
    'caja_diaria_id', v_caja_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_cambio(jsonb, jsonb, text, text) TO anon, authenticated;
