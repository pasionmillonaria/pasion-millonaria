


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."actualizar_stock_tras_movimiento"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
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


ALTER FUNCTION "public"."actualizar_stock_tras_movimiento"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_actualizar_abono"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE apartados
    SET total_abonado = total_abonado + NEW.monto,
        actualizado_en = NOW()
    WHERE id = NEW.apartado_id;

    -- Si ya pago todo, marcar como entregado automaticamente
    UPDATE apartados
    SET estado = 'entregado'
    WHERE id = NEW.apartado_id
      AND total_abonado >= precio
      AND estado = 'pendiente';

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_actualizar_abono"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_actualizar_abono"() IS 'Suma abono al apartado y marca entregado si ya pago todo';



CREATE OR REPLACE FUNCTION "public"."fn_actualizar_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.tipo = 'entrada' THEN
        INSERT INTO stock (producto_id, talla_id, ubicacion_id, cantidad)
        VALUES (NEW.producto_id, NEW.talla_id, NEW.ubicacion_id, NEW.cantidad)
        ON CONFLICT (producto_id, talla_id, ubicacion_id)
        DO UPDATE SET
            cantidad = stock.cantidad + NEW.cantidad,
            actualizado_en = NOW();

    ELSIF NEW.tipo = 'salida' THEN
        UPDATE stock
        SET cantidad = cantidad - NEW.cantidad,
            actualizado_en = NOW()
        WHERE producto_id = NEW.producto_id
          AND talla_id = NEW.talla_id
          AND ubicacion_id = NEW.ubicacion_id;

    ELSIF NEW.tipo = 'devolucion' THEN
        INSERT INTO stock (producto_id, talla_id, ubicacion_id, cantidad)
        VALUES (NEW.producto_id, NEW.talla_id, NEW.ubicacion_id, NEW.cantidad)
        ON CONFLICT (producto_id, talla_id, ubicacion_id)
        DO UPDATE SET
            cantidad = stock.cantidad + NEW.cantidad,
            actualizado_en = NOW();
    END IF;

    -- Si es traslado, tambien dar entrada en destino
    IF NEW.canal = 'traslado' AND NEW.ubicacion_destino_id IS NOT NULL THEN
        INSERT INTO stock (producto_id, talla_id, ubicacion_id, cantidad)
        VALUES (NEW.producto_id, NEW.talla_id, NEW.ubicacion_destino_id, NEW.cantidad)
        ON CONFLICT (producto_id, talla_id, ubicacion_id)
        DO UPDATE SET
            cantidad = stock.cantidad + NEW.cantidad,
            actualizado_en = NOW();
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_actualizar_stock"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_actualizar_stock"() IS 'Actualiza stock automaticamente al registrar cualquier movimiento';



CREATE OR REPLACE FUNCTION "public"."generar_ref_movimiento"("prefijo" character varying DEFAULT 'MOV'::character varying) RETURNS character varying
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    nuevo_ref VARCHAR;
    seq_num INT;
BEGIN
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(movimiento_ref FROM LENGTH(prefijo) + 2) AS INT)
    ), 0) + 1
    INTO seq_num
    FROM movimientos
    WHERE movimiento_ref LIKE prefijo || '-%';

    nuevo_ref := prefijo || '-' || LPAD(seq_num::TEXT, 4, '0');
    RETURN nuevo_ref;
END;
$$;


ALTER FUNCTION "public"."generar_ref_movimiento"("prefijo" character varying) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generar_ref_movimiento"("prefijo" character varying) IS 'Genera CAM-0001, DEV-0001, etc.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."abonos" (
    "id" bigint NOT NULL,
    "apartado_id" bigint NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "metodo_pago" character varying(20) NOT NULL,
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL,
    "registrado_por" "uuid",
    "grupo_id" bigint NOT NULL,
    CONSTRAINT "abonos_monto_check" CHECK (("monto" > (0)::numeric))
);


ALTER TABLE "public"."abonos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."abonos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."abonos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."abonos_id_seq" OWNED BY "public"."abonos"."id";



CREATE TABLE IF NOT EXISTS "public"."apartados" (
    "id" bigint NOT NULL,
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cliente_id" bigint NOT NULL,
    "producto_id" bigint NOT NULL,
    "talla_id" bigint NOT NULL,
    "precio" numeric(12,2) NOT NULL,
    "estado" character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "en_tienda" boolean DEFAULT false NOT NULL,
    "observacion" "text",
    "usuario_id" "uuid",
    "grupo_id" bigint,
    "canal" character varying(20) DEFAULT 'venta_tienda'::character varying,
    CONSTRAINT "apartados_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['pendiente'::character varying, 'entregado'::character varying, 'cancelado'::character varying])::"text"[]))),
    CONSTRAINT "apartados_precio_check" CHECK (("precio" > (0)::numeric))
);


ALTER TABLE "public"."apartados" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."apartados_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."apartados_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."apartados_id_seq" OWNED BY "public"."apartados"."id";



CREATE TABLE IF NOT EXISTS "public"."caja_diaria" (
    "id" bigint NOT NULL,
    "fecha" "date" NOT NULL,
    "saldo_inicial" numeric(12,2) DEFAULT 0 NOT NULL,
    "guardado_caja_fuerte" numeric(12,2) DEFAULT 0 NOT NULL,
    "efectivo_contado" numeric(12,2),
    "diferencia_caja" numeric(12,2),
    "estado" character varying(20) DEFAULT 'abierta'::character varying NOT NULL,
    "usuario_apertura" "uuid",
    "usuario_cierre" "uuid",
    "notas" "text",
    CONSTRAINT "caja_diaria_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['abierta'::character varying, 'cerrada'::character varying])::"text"[])))
);


ALTER TABLE "public"."caja_diaria" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."caja_diaria_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."caja_diaria_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."caja_diaria_id_seq" OWNED BY "public"."caja_diaria"."id";



CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" bigint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categorias_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categorias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categorias_id_seq" OWNED BY "public"."categorias"."id";



CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" bigint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "telefono" character varying(20),
    "notas" "text"
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."clientes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."clientes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."clientes_id_seq" OWNED BY "public"."clientes"."id";



CREATE TABLE IF NOT EXISTS "public"."gastos" (
    "id" bigint NOT NULL,
    "caja_diaria_id" bigint,
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL,
    "concepto" character varying(200) NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "categoria" character varying(30) NOT NULL,
    "metodo_pago" character varying(20) NOT NULL,
    "registrado_por" "uuid",
    CONSTRAINT "gastos_categoria_check" CHECK ((("categoria")::"text" = ANY ((ARRAY['alimentacion'::character varying, 'transporte'::character varying, 'insumos'::character varying, 'servicios'::character varying, 'caja_fuerte'::character varying, 'otro'::character varying])::"text"[]))),
    CONSTRAINT "gastos_monto_check" CHECK (("monto" > (0)::numeric))
);


ALTER TABLE "public"."gastos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."gastos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."gastos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."gastos_id_seq" OWNED BY "public"."gastos"."id";



CREATE TABLE IF NOT EXISTS "public"."lineas" (
    "id" bigint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."lineas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lineas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lineas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lineas_id_seq" OWNED BY "public"."lineas"."id";



CREATE TABLE IF NOT EXISTS "public"."movimientos" (
    "id" bigint NOT NULL,
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL,
    "producto_id" bigint NOT NULL,
    "talla_id" bigint NOT NULL,
    "ubicacion_id" bigint NOT NULL,
    "ubicacion_destino_id" bigint,
    "cantidad" integer NOT NULL,
    "tipo" character varying(20) NOT NULL,
    "canal" character varying(30) NOT NULL,
    "precio_venta" numeric(12,2),
    "descuento" numeric(12,2),
    "metodo_pago" character varying(20),
    "movimiento_ref" character varying(100),
    "nota" "text",
    "usuario_id" "uuid",
    "caja_diaria_id" bigint,
    CONSTRAINT "movimientos_cantidad_check" CHECK (("cantidad" > 0)),
    CONSTRAINT "movimientos_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['entrada'::character varying, 'salida'::character varying, 'devolucion'::character varying])::"text"[])))
);


ALTER TABLE "public"."movimientos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."movimientos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."movimientos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."movimientos_id_seq" OWNED BY "public"."movimientos"."id";



CREATE TABLE IF NOT EXISTS "public"."productos" (
    "id" bigint NOT NULL,
    "codigo" character varying(50) NOT NULL,
    "referencia" character varying(200) NOT NULL,
    "linea_id" bigint NOT NULL,
    "categoria_id" bigint NOT NULL,
    "sistema_talla" character varying(20) NOT NULL,
    "precio_base" numeric(12,2) NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    CONSTRAINT "productos_precio_base_check" CHECK (("precio_base" >= (0)::numeric)),
    CONSTRAINT "productos_sistema_talla_check" CHECK ((("sistema_talla")::"text" = ANY ((ARRAY['ropa_adulto'::character varying, 'ropa_nino'::character varying, 'calzado'::character varying, 'unica'::character varying])::"text"[])))
);


ALTER TABLE "public"."productos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."productos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."productos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."productos_id_seq" OWNED BY "public"."productos"."id";



CREATE TABLE IF NOT EXISTS "public"."registros_caja" (
    "id" bigint NOT NULL,
    "caja_diaria_id" bigint NOT NULL,
    "movimiento_id" bigint,
    "fecha" "date" NOT NULL,
    "hora" time without time zone DEFAULT ("now"())::time without time zone NOT NULL,
    "tipo" character varying(20) NOT NULL,
    "descripcion" "text",
    "valor" numeric(12,2) NOT NULL,
    "metodo_pago" character varying(20),
    "monto_efectivo" numeric(12,2) DEFAULT 0 NOT NULL,
    "monto_transferencia" numeric(12,2) DEFAULT 0 NOT NULL,
    "usuario_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "registros_caja_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['venta'::character varying, 'gasto'::character varying, 'ingreso'::character varying, 'caja_fuerte'::character varying])::"text"[])))
);


ALTER TABLE "public"."registros_caja" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."registros_caja_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."registros_caja_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."registros_caja_id_seq" OWNED BY "public"."registros_caja"."id";



CREATE TABLE IF NOT EXISTS "public"."stock" (
    "id" bigint NOT NULL,
    "producto_id" bigint NOT NULL,
    "talla_id" bigint NOT NULL,
    "ubicacion_id" bigint NOT NULL,
    "cantidad" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "stock_cantidad_check" CHECK (("cantidad" >= 0))
);


ALTER TABLE "public"."stock" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."stock_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stock_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stock_id_seq" OWNED BY "public"."stock"."id";



CREATE TABLE IF NOT EXISTS "public"."tallas" (
    "id" bigint NOT NULL,
    "nombre" character varying(20) NOT NULL,
    "sistema" character varying(20) NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "tallas_sistema_check" CHECK ((("sistema")::"text" = ANY ((ARRAY['ropa_adulto'::character varying, 'ropa_nino'::character varying, 'calzado'::character varying, 'unica'::character varying])::"text"[])))
);


ALTER TABLE "public"."tallas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tallas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tallas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tallas_id_seq" OWNED BY "public"."tallas"."id";



CREATE TABLE IF NOT EXISTS "public"."ubicaciones" (
    "id" bigint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "tipo" character varying(20) NOT NULL,
    CONSTRAINT "ubicaciones_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['tienda'::character varying, 'bodega'::character varying])::"text"[])))
);


ALTER TABLE "public"."ubicaciones" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ubicaciones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ubicaciones_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ubicaciones_id_seq" OWNED BY "public"."ubicaciones"."id";



CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "pin" character varying(10),
    "rol" character varying(20) DEFAULT 'empleado'::character varying NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    CONSTRAINT "usuarios_rol_check" CHECK ((("rol")::"text" = ANY ((ARRAY['admin'::character varying, 'empleado'::character varying])::"text"[])))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_apartados_pendientes" AS
SELECT
    NULL::bigint AS "id",
    NULL::timestamp with time zone AS "fecha",
    NULL::bigint AS "grupo_id",
    NULL::character varying(20) AS "estado",
    NULL::numeric(12,2) AS "precio",
    NULL::boolean AS "en_tienda",
    NULL::"text" AS "observacion",
    NULL::character varying(20) AS "canal",
    NULL::character varying(100) AS "cliente_nombre",
    NULL::character varying(20) AS "cliente_telefono",
    NULL::character varying(200) AS "referencia",
    NULL::character varying(20) AS "talla",
    NULL::numeric AS "total_abonado",
    NULL::numeric AS "saldo";


ALTER VIEW "public"."v_apartados_pendientes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_resumen_caja" AS
 SELECT "cd"."id",
    "cd"."fecha",
    "cd"."saldo_inicial",
    "cd"."guardado_caja_fuerte",
    "cd"."efectivo_contado",
    "cd"."diferencia_caja",
    "cd"."estado",
    "cd"."notas",
    COALESCE("sum"(
        CASE
            WHEN (("rc"."tipo")::"text" = 'venta'::"text") THEN "rc"."monto_efectivo"
            ELSE (0)::numeric
        END), (0)::numeric) AS "total_efectivo",
    COALESCE("sum"(
        CASE
            WHEN (("rc"."tipo")::"text" = 'venta'::"text") THEN "rc"."monto_transferencia"
            ELSE (0)::numeric
        END), (0)::numeric) AS "total_transferencias",
    COALESCE("sum"(
        CASE
            WHEN (("rc"."tipo")::"text" = 'gasto'::"text") THEN "rc"."valor"
            ELSE (0)::numeric
        END), (0)::numeric) AS "total_gastos",
    COALESCE("sum"(
        CASE
            WHEN (("rc"."tipo")::"text" = 'ingreso'::"text") THEN "rc"."valor"
            ELSE (0)::numeric
        END), (0)::numeric) AS "total_ingresos",
    ("count"(
        CASE
            WHEN (("rc"."tipo")::"text" = 'venta'::"text") THEN 1
            ELSE NULL::integer
        END))::integer AS "cantidad_ventas",
    (((("cd"."saldo_inicial" + COALESCE("sum"(
        CASE
            WHEN (("rc"."tipo")::"text" = 'venta'::"text") THEN "rc"."monto_efectivo"
            ELSE (0)::numeric
        END), (0)::numeric)) + COALESCE("sum"(
        CASE
            WHEN ((("rc"."tipo")::"text" = 'ingreso'::"text") AND (("rc"."metodo_pago")::"text" = 'efectivo'::"text")) THEN "rc"."valor"
            ELSE (0)::numeric
        END), (0)::numeric)) - COALESCE("sum"(
        CASE
            WHEN ((("rc"."tipo")::"text" = 'gasto'::"text") AND (("rc"."metodo_pago")::"text" = 'efectivo'::"text")) THEN "rc"."valor"
            ELSE (0)::numeric
        END), (0)::numeric)) - "cd"."guardado_caja_fuerte") AS "saldo_final"
   FROM ("public"."caja_diaria" "cd"
     LEFT JOIN "public"."registros_caja" "rc" ON (("rc"."caja_diaria_id" = "cd"."id")))
  GROUP BY "cd"."id", "cd"."fecha", "cd"."saldo_inicial", "cd"."guardado_caja_fuerte", "cd"."efectivo_contado", "cd"."diferencia_caja", "cd"."estado", "cd"."notas";


ALTER VIEW "public"."v_resumen_caja" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_resumen_caja_hoy" AS
 SELECT "metodo_pago",
    "sum"("valor") AS "total",
    "count"(*) AS "cantidad"
   FROM "public"."registros_caja"
  WHERE (("fecha" = CURRENT_DATE) AND (("tipo")::"text" = 'venta'::"text"))
  GROUP BY "metodo_pago";


ALTER VIEW "public"."v_resumen_caja_hoy" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_stock_total" AS
 SELECT "p"."id" AS "producto_id",
    "p"."codigo",
    "p"."referencia",
    "p"."linea_id",
    "li"."nombre" AS "linea",
    "ca"."nombre" AS "categoria",
    "t"."nombre" AS "talla",
    "t"."id" AS "talla_id",
    "p"."sistema_talla",
    COALESCE("sum"(
        CASE
            WHEN (("u"."tipo")::"text" = 'tienda'::"text") THEN "s"."cantidad"
            ELSE 0
        END), (0)::bigint) AS "stock_tienda",
    COALESCE("sum"(
        CASE
            WHEN (("u"."tipo")::"text" = 'bodega'::"text") THEN "s"."cantidad"
            ELSE 0
        END), (0)::bigint) AS "stock_bodega",
    COALESCE("sum"("s"."cantidad"), (0)::bigint) AS "stock_total"
   FROM ((((("public"."productos" "p"
     JOIN "public"."lineas" "li" ON (("li"."id" = "p"."linea_id")))
     JOIN "public"."categorias" "ca" ON (("ca"."id" = "p"."categoria_id")))
     JOIN "public"."stock" "s" ON (("s"."producto_id" = "p"."id")))
     JOIN "public"."tallas" "t" ON (("t"."id" = "s"."talla_id")))
     JOIN "public"."ubicaciones" "u" ON (("u"."id" = "s"."ubicacion_id")))
  WHERE ("p"."activo" = true)
  GROUP BY "p"."id", "p"."codigo", "p"."referencia", "p"."linea_id", "li"."nombre", "ca"."nombre", "t"."nombre", "t"."id", "p"."sistema_talla";


ALTER VIEW "public"."v_stock_total" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_stock_bajo" AS
 SELECT "producto_id",
    "codigo",
    "referencia",
    "linea_id",
    "linea",
    "categoria",
    "talla",
    "talla_id",
    "sistema_talla",
    "stock_tienda",
    "stock_bodega",
    "stock_total"
   FROM "public"."v_stock_total"
  WHERE ("stock_total" <= 3);


ALTER VIEW "public"."v_stock_bajo" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_ventas_hoy" AS
 SELECT "m"."id",
    "m"."fecha",
    "m"."producto_id",
    "p"."referencia",
    "t"."nombre" AS "talla",
    "m"."cantidad",
    "m"."canal",
    "m"."precio_venta",
    "m"."descuento",
    "m"."metodo_pago",
    "m"."usuario_id"
   FROM (("public"."movimientos" "m"
     JOIN "public"."productos" "p" ON (("p"."id" = "m"."producto_id")))
     JOIN "public"."tallas" "t" ON (("t"."id" = "m"."talla_id")))
  WHERE ((("m"."tipo")::"text" = 'salida'::"text") AND (("m"."fecha")::"date" = CURRENT_DATE));


ALTER VIEW "public"."v_ventas_hoy" OWNER TO "postgres";


ALTER TABLE ONLY "public"."abonos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."abonos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."apartados" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."apartados_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."caja_diaria" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."caja_diaria_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."categorias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categorias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."clientes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."clientes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."gastos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."gastos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lineas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lineas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."movimientos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."movimientos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."productos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."productos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."registros_caja" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."registros_caja_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stock" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stock_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tallas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tallas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ubicaciones" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ubicaciones_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."abonos"
    ADD CONSTRAINT "abonos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apartados"
    ADD CONSTRAINT "apartados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caja_diaria"
    ADD CONSTRAINT "caja_diaria_fecha_key" UNIQUE ("fecha");



ALTER TABLE ONLY "public"."caja_diaria"
    ADD CONSTRAINT "caja_diaria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lineas"
    ADD CONSTRAINT "lineas_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."lineas"
    ADD CONSTRAINT "lineas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registros_caja"
    ADD CONSTRAINT "registros_caja_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock"
    ADD CONSTRAINT "stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock"
    ADD CONSTRAINT "stock_producto_id_talla_id_ubicacion_id_key" UNIQUE ("producto_id", "talla_id", "ubicacion_id");



ALTER TABLE ONLY "public"."tallas"
    ADD CONSTRAINT "tallas_nombre_sistema_key" UNIQUE ("nombre", "sistema");



ALTER TABLE ONLY "public"."tallas"
    ADD CONSTRAINT "tallas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_abonos_grupo_id" ON "public"."abonos" USING "btree" ("grupo_id");



CREATE OR REPLACE VIEW "public"."v_apartados_pendientes" AS
 SELECT "a"."id",
    "a"."fecha",
    "a"."grupo_id",
    "a"."estado",
    "a"."precio",
    "a"."en_tienda",
    "a"."observacion",
    "a"."canal",
    "c"."nombre" AS "cliente_nombre",
    "c"."telefono" AS "cliente_telefono",
    "p"."referencia",
    "t"."nombre" AS "talla",
    COALESCE("sum"("ab"."monto"), (0)::numeric) AS "total_abonado",
    ("a"."precio" - COALESCE("sum"("ab"."monto"), (0)::numeric)) AS "saldo"
   FROM (((("public"."apartados" "a"
     JOIN "public"."clientes" "c" ON (("c"."id" = "a"."cliente_id")))
     JOIN "public"."productos" "p" ON (("p"."id" = "a"."producto_id")))
     JOIN "public"."tallas" "t" ON (("t"."id" = "a"."talla_id")))
     LEFT JOIN "public"."abonos" "ab" ON (("ab"."apartado_id" = "a"."id")))
  GROUP BY "a"."id", "c"."nombre", "c"."telefono", "p"."referencia", "t"."nombre";



CREATE OR REPLACE TRIGGER "trg_actualizar_stock" AFTER INSERT ON "public"."movimientos" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_stock_tras_movimiento"();



ALTER TABLE ONLY "public"."abonos"
    ADD CONSTRAINT "abonos_apartado_id_fkey" FOREIGN KEY ("apartado_id") REFERENCES "public"."apartados"("id");



ALTER TABLE ONLY "public"."abonos"
    ADD CONSTRAINT "abonos_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."apartados"("id");



ALTER TABLE ONLY "public"."abonos"
    ADD CONSTRAINT "abonos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."apartados"
    ADD CONSTRAINT "apartados_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."apartados"
    ADD CONSTRAINT "apartados_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."apartados"
    ADD CONSTRAINT "apartados_talla_id_fkey" FOREIGN KEY ("talla_id") REFERENCES "public"."tallas"("id");



ALTER TABLE ONLY "public"."apartados"
    ADD CONSTRAINT "apartados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."caja_diaria"
    ADD CONSTRAINT "caja_diaria_usuario_apertura_fkey" FOREIGN KEY ("usuario_apertura") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."caja_diaria"
    ADD CONSTRAINT "caja_diaria_usuario_cierre_fkey" FOREIGN KEY ("usuario_cierre") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_caja_diaria_id_fkey" FOREIGN KEY ("caja_diaria_id") REFERENCES "public"."caja_diaria"("id");



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_caja_diaria_id_fkey" FOREIGN KEY ("caja_diaria_id") REFERENCES "public"."caja_diaria"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_talla_id_fkey" FOREIGN KEY ("talla_id") REFERENCES "public"."tallas"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_ubicacion_destino_id_fkey" FOREIGN KEY ("ubicacion_destino_id") REFERENCES "public"."ubicaciones"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_linea_id_fkey" FOREIGN KEY ("linea_id") REFERENCES "public"."lineas"("id");



ALTER TABLE ONLY "public"."registros_caja"
    ADD CONSTRAINT "registros_caja_caja_diaria_id_fkey" FOREIGN KEY ("caja_diaria_id") REFERENCES "public"."caja_diaria"("id");



ALTER TABLE ONLY "public"."registros_caja"
    ADD CONSTRAINT "registros_caja_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id");



ALTER TABLE ONLY "public"."registros_caja"
    ADD CONSTRAINT "registros_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."stock"
    ADD CONSTRAINT "stock_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."stock"
    ADD CONSTRAINT "stock_talla_id_fkey" FOREIGN KEY ("talla_id") REFERENCES "public"."tallas"("id");



ALTER TABLE ONLY "public"."stock"
    ADD CONSTRAINT "stock_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id");



ALTER TABLE "public"."abonos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_abonos" ON "public"."abonos" USING (true) WITH CHECK (true);



CREATE POLICY "admin_apartados" ON "public"."apartados" USING (true) WITH CHECK (true);



CREATE POLICY "admin_caja" ON "public"."caja_diaria" USING (true) WITH CHECK (true);



CREATE POLICY "admin_categorias" ON "public"."categorias" USING (true) WITH CHECK (true);



CREATE POLICY "admin_clientes" ON "public"."clientes" USING (true) WITH CHECK (true);



CREATE POLICY "admin_lineas" ON "public"."lineas" USING (true) WITH CHECK (true);



CREATE POLICY "admin_productos" ON "public"."productos" USING (true) WITH CHECK (true);



CREATE POLICY "admin_stock" ON "public"."stock" USING (true) WITH CHECK (true);



CREATE POLICY "admin_tallas" ON "public"."tallas" USING (true) WITH CHECK (true);



CREATE POLICY "admin_ubicaciones" ON "public"."ubicaciones" USING (true) WITH CHECK (true);



CREATE POLICY "admin_usuarios" ON "public"."usuarios" USING (true) WITH CHECK (true);



ALTER TABLE "public"."apartados" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "borrar_gasto" ON "public"."gastos" FOR DELETE USING (true);



CREATE POLICY "borrar_registro_caja" ON "public"."registros_caja" FOR DELETE USING (true);



ALTER TABLE "public"."caja_diaria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gastos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insertar_gasto" ON "public"."gastos" FOR INSERT WITH CHECK (true);



CREATE POLICY "insertar_movimiento" ON "public"."movimientos" FOR INSERT WITH CHECK (true);



CREATE POLICY "insertar_registro_caja" ON "public"."registros_caja" FOR INSERT WITH CHECK (true);



CREATE POLICY "leer_abonos" ON "public"."abonos" FOR SELECT USING (true);



CREATE POLICY "leer_apartados" ON "public"."apartados" FOR SELECT USING (true);



CREATE POLICY "leer_caja" ON "public"."caja_diaria" FOR SELECT USING (true);



CREATE POLICY "leer_categorias" ON "public"."categorias" FOR SELECT USING (true);



CREATE POLICY "leer_clientes" ON "public"."clientes" FOR SELECT USING (true);



CREATE POLICY "leer_gastos" ON "public"."gastos" FOR SELECT USING (true);



CREATE POLICY "leer_lineas" ON "public"."lineas" FOR SELECT USING (true);



CREATE POLICY "leer_movimientos" ON "public"."movimientos" FOR SELECT USING (true);



CREATE POLICY "leer_productos" ON "public"."productos" FOR SELECT USING (true);



CREATE POLICY "leer_registros_caja" ON "public"."registros_caja" FOR SELECT USING (true);



CREATE POLICY "leer_stock" ON "public"."stock" FOR SELECT USING (true);



CREATE POLICY "leer_tallas" ON "public"."tallas" FOR SELECT USING (true);



CREATE POLICY "leer_ubicaciones" ON "public"."ubicaciones" FOR SELECT USING (true);



CREATE POLICY "leer_usuarios" ON "public"."usuarios" FOR SELECT USING (true);



ALTER TABLE "public"."lineas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movimientos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."productos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registros_caja" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tallas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ubicaciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."actualizar_stock_tras_movimiento"() TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_stock_tras_movimiento"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_stock_tras_movimiento"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_actualizar_abono"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_actualizar_abono"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_actualizar_abono"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_actualizar_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_actualizar_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_actualizar_stock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generar_ref_movimiento"("prefijo" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."generar_ref_movimiento"("prefijo" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generar_ref_movimiento"("prefijo" character varying) TO "service_role";


















GRANT ALL ON TABLE "public"."abonos" TO "anon";
GRANT ALL ON TABLE "public"."abonos" TO "authenticated";
GRANT ALL ON TABLE "public"."abonos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."abonos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."abonos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."abonos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."apartados" TO "anon";
GRANT ALL ON TABLE "public"."apartados" TO "authenticated";
GRANT ALL ON TABLE "public"."apartados" TO "service_role";



GRANT ALL ON SEQUENCE "public"."apartados_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."apartados_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."apartados_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."caja_diaria" TO "anon";
GRANT ALL ON TABLE "public"."caja_diaria" TO "authenticated";
GRANT ALL ON TABLE "public"."caja_diaria" TO "service_role";



GRANT ALL ON SEQUENCE "public"."caja_diaria_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."caja_diaria_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."caja_diaria_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gastos" TO "anon";
GRANT ALL ON TABLE "public"."gastos" TO "authenticated";
GRANT ALL ON TABLE "public"."gastos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gastos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gastos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gastos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lineas" TO "anon";
GRANT ALL ON TABLE "public"."lineas" TO "authenticated";
GRANT ALL ON TABLE "public"."lineas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lineas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lineas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lineas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."movimientos" TO "anon";
GRANT ALL ON TABLE "public"."movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."movimientos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."productos" TO "anon";
GRANT ALL ON TABLE "public"."productos" TO "authenticated";
GRANT ALL ON TABLE "public"."productos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."registros_caja" TO "anon";
GRANT ALL ON TABLE "public"."registros_caja" TO "authenticated";
GRANT ALL ON TABLE "public"."registros_caja" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registros_caja_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registros_caja_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registros_caja_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stock" TO "anon";
GRANT ALL ON TABLE "public"."stock" TO "authenticated";
GRANT ALL ON TABLE "public"."stock" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stock_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tallas" TO "anon";
GRANT ALL ON TABLE "public"."tallas" TO "authenticated";
GRANT ALL ON TABLE "public"."tallas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tallas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tallas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tallas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ubicaciones" TO "anon";
GRANT ALL ON TABLE "public"."ubicaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."ubicaciones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ubicaciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ubicaciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ubicaciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."v_apartados_pendientes" TO "anon";
GRANT ALL ON TABLE "public"."v_apartados_pendientes" TO "authenticated";
GRANT ALL ON TABLE "public"."v_apartados_pendientes" TO "service_role";



GRANT ALL ON TABLE "public"."v_resumen_caja" TO "anon";
GRANT ALL ON TABLE "public"."v_resumen_caja" TO "authenticated";
GRANT ALL ON TABLE "public"."v_resumen_caja" TO "service_role";



GRANT ALL ON TABLE "public"."v_resumen_caja_hoy" TO "anon";
GRANT ALL ON TABLE "public"."v_resumen_caja_hoy" TO "authenticated";
GRANT ALL ON TABLE "public"."v_resumen_caja_hoy" TO "service_role";



GRANT ALL ON TABLE "public"."v_stock_total" TO "anon";
GRANT ALL ON TABLE "public"."v_stock_total" TO "authenticated";
GRANT ALL ON TABLE "public"."v_stock_total" TO "service_role";



GRANT ALL ON TABLE "public"."v_stock_bajo" TO "anon";
GRANT ALL ON TABLE "public"."v_stock_bajo" TO "authenticated";
GRANT ALL ON TABLE "public"."v_stock_bajo" TO "service_role";



GRANT ALL ON TABLE "public"."v_ventas_hoy" TO "anon";
GRANT ALL ON TABLE "public"."v_ventas_hoy" TO "authenticated";
GRANT ALL ON TABLE "public"."v_ventas_hoy" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































