-- Script para insertar el producto "Artículo Libre" en Pasión Millonaria
-- Ejecutar en el SQL Editor de Supabase

DO $$
DECLARE
    v_linea_id bigint;
    v_categoria_id bigint;
BEGIN
    -- Intentar buscar por nombre, si no, tomar el primero disponible
    SELECT id INTO v_linea_id FROM lineas WHERE nombre = 'Accesorio' LIMIT 1;
    IF v_linea_id IS NULL THEN SELECT id INTO v_linea_id FROM lineas LIMIT 1; END IF;

    SELECT id INTO v_categoria_id FROM categorias WHERE nombre = 'Otro' LIMIT 1;
    IF v_categoria_id IS NULL THEN SELECT id INTO v_categoria_id FROM categorias LIMIT 1; END IF;

    IF v_linea_id IS NULL OR v_categoria_id IS NULL THEN
        RAISE EXCEPTION 'No se encontraron registros en las tablas lineas o categorias. Por favor verifica que la base de datos esté inicializada.';
    END IF;

    INSERT INTO productos (codigo, referencia, linea_id, categoria_id, sistema_talla, precio_base, activo)
    VALUES ('LIBRE', 'Artículo Libre', v_linea_id, v_categoria_id, 'unica', 0, false)
    ON CONFLICT (codigo) DO NOTHING;
END $$;
