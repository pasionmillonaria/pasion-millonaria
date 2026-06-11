-- ============================================================
-- SEED — Datos sintéticos para desarrollo LOCAL únicamente.
-- Se aplica automáticamente con `supabase db reset` (ver config.toml
-- → [db.seed] sql_paths). NUNCA se ejecuta contra producción.
--
-- Requiere que el baseline 20260611035724_remote_schema.sql ya
-- esté aplicado (crea las tablas vacías; este archivo las puebla).
--
-- Todos los datos son ficticios y están marcados como "demo".
-- ============================================================

-- ── 1. Catálogo base ────────────────────────────────────────
-- (el baseline solo trae el esquema, sin datos; el catálogo es
--  prerequisito de productos/stock, así que va aquí)

INSERT INTO public.lineas (nombre, orden) VALUES
  ('Hombre',    1),
  ('Dama',      2),
  ('Niño',      3),
  ('Accesorio', 4);

INSERT INTO public.categorias (nombre, orden) VALUES
  ('Busos',      1),
  ('Camisetas',  3),
  ('Conjuntos',  5),
  ('Gorras',     9),
  ('Otro',      10);

INSERT INTO public.tallas (nombre, sistema, orden) VALUES
  ('XS', 'ropa_adulto', 1),
  ('S',  'ropa_adulto', 2),
  ('M',  'ropa_adulto', 3),
  ('L',  'ropa_adulto', 4),
  ('XL', 'ropa_adulto', 5),
  ('8',  'ropa_nino',   3),
  ('10', 'ropa_nino',   4),
  ('Única', 'unica',    1);

INSERT INTO public.ubicaciones (nombre, tipo) VALUES
  ('Tienda', 'tienda'),
  ('Bodega', 'bodega');

-- ── 2. Usuarios (sistema de perfiles legacy) ────────────────
INSERT INTO public.usuarios (nombre, pin, rol) VALUES
  ('Admin Demo',    '1234', 'admin'),
  ('Empleado Demo', NULL,   'empleado');

-- ── 3. Clientes (2) ─────────────────────────────────────────
INSERT INTO public.clientes (nombre, telefono, notas) VALUES
  ('María Gómez',  '3001112233', 'Cliente demo'),
  ('Carlos Ruiz',  '3014445566', 'Cliente demo');

-- ── 4. Productos (5) ────────────────────────────────────────
-- Se referencian línea y categoría por nombre para no depender
-- de IDs fijos.
INSERT INTO public.productos (codigo, referencia, linea_id, categoria_id, sistema_talla, precio_base, activo) VALUES
  ('DEMO-001', 'Buso Millonarios Azul',
     (SELECT id FROM public.lineas     WHERE nombre = 'Hombre'),
     (SELECT id FROM public.categorias WHERE nombre = 'Busos'),
     'ropa_adulto',  89000, true),
  ('DEMO-002', 'Camiseta Retro Verde',
     (SELECT id FROM public.lineas     WHERE nombre = 'Hombre'),
     (SELECT id FROM public.categorias WHERE nombre = 'Camisetas'),
     'ropa_adulto',  65000, true),
  ('DEMO-003', 'Conjunto Deportivo Dama',
     (SELECT id FROM public.lineas     WHERE nombre = 'Dama'),
     (SELECT id FROM public.categorias WHERE nombre = 'Conjuntos'),
     'ropa_adulto', 120000, true),
  ('DEMO-004', 'Buso Niño Azul',
     (SELECT id FROM public.lineas     WHERE nombre = 'Niño'),
     (SELECT id FROM public.categorias WHERE nombre = 'Busos'),
     'ropa_nino',    55000, true),
  ('DEMO-005', 'Gorra Clásica',
     (SELECT id FROM public.lineas     WHERE nombre = 'Accesorio'),
     (SELECT id FROM public.categorias WHERE nombre = 'Gorras'),
     'unica',        35000, true);

-- ── 5. Stock inicial (tienda + bodega) ──────────────────────
-- Insertado directo en `stock` (equivale a lo que haría el trigger
-- al registrar un movimiento de entrada). Las filas con cantidad <= 3
-- sirven para probar la vista v_stock_bajo.
INSERT INTO public.stock (producto_id, talla_id, ubicacion_id, cantidad)
SELECT p.id, t.id, u.id, v.cant
FROM (VALUES
  ('DEMO-001', 'M',     'Tienda', 10),
  ('DEMO-001', 'L',     'Tienda',  6),
  ('DEMO-001', 'M',     'Bodega', 20),
  ('DEMO-002', 'S',     'Tienda',  8),
  ('DEMO-002', 'M',     'Tienda',  2),   -- stock bajo
  ('DEMO-003', 'M',     'Tienda',  5),
  ('DEMO-003', 'L',     'Bodega', 12),
  ('DEMO-004', '8',     'Tienda',  7),
  ('DEMO-004', '10',    'Tienda',  1),   -- stock bajo
  ('DEMO-005', 'Única', 'Tienda', 15)
) AS v(codigo, talla, ubic, cant)
JOIN public.productos   p ON p.codigo  = v.codigo
JOIN public.tallas      t ON t.nombre  = v.talla AND t.sistema = p.sistema_talla
JOIN public.ubicaciones u ON u.nombre  = v.ubic;

-- ── 6. Caja del día ABIERTA ─────────────────────────────────
INSERT INTO public.caja_diaria (fecha, saldo_inicial, estado, usuario_apertura)
VALUES (
  CURRENT_DATE,
  200000,
  'abierta',
  (SELECT id FROM public.usuarios WHERE rol = 'admin' LIMIT 1)
);
