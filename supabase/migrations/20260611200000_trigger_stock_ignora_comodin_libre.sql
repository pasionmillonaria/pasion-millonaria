-- El comodín "Artículo Libre" (productos.codigo = 'LIBRE') NO mueve inventario.
-- Ver DOCUMENTACION.md §venta: "Artículo libre ... No mueve inventario".
--
-- Antes, el trigger ejecutaba el UPDATE de salida sobre las filas de stock del
-- comodín y, con el CHECK (cantidad >= 0) activo, fallaba con
-- "stock_cantidad_check" al vender un artículo libre cuya talla tuviera una
-- fila de stock en 0. Este guard evita que el comodín toque stock de raíz.
--
-- Cuerpo idéntico al baseline salvo el bloque de guard al inicio.

CREATE OR REPLACE FUNCTION "public"."actualizar_stock_tras_movimiento"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- El comodín "Artículo Libre" no mueve inventario.
  IF EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND codigo = 'LIBRE') THEN
    RETURN NEW;
  END IF;

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
$$;
