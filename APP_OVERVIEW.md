# Pasión Millonaria — Documentación Técnica Completa

POS e inventario interno para una tienda de ropa deportiva. Single-tenant, sin público.

---

## 1. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript (strict) |
| UI | React 18 + Tailwind CSS 3 |
| Base de datos | Supabase (Postgres gestionado) |
| Cliente DB | `@supabase/supabase-js` v2 + `@supabase/ssr` |
| Íconos | Lucide React |
| Notificaciones | react-hot-toast |
| Exportación | html2canvas (reportes/cierre a PNG) |
| Utilidades CSS | clsx + tailwind-merge → `cn()` en `src/lib/utils.ts` |
| Fuente tipográfica | Outfit (variable CSS `--font-outfit`) |
| Linting | ESLint con eslint-config-next |
| Despliegue | Vercel |

**No hay test suite configurada.**

---

## 2. Lenguajes

- **Frontend y backend**: TypeScript/JavaScript (Node.js).  
  Next.js unifica ambas capas — las páginas y componentes son React (frontend), las rutas `/api/*` corren en el Edge/Node de Vercel (backend).
- **Base de datos**: SQL (Postgres a través de Supabase). Triggers y funciones escritos en PL/pgSQL.

---

## 3. Despliegue

La app se despliega en **Vercel** conectado al repositorio Git. El proceso es:

1. Push a `main` → Vercel detecta el cambio y ejecuta `npm run build`.
2. Next.js compila a static + serverless functions.
3. Las páginas marcadas `force-dynamic` (el layout del dashboard) siempre se renderizan en el servidor para forzar la verificación del perfil.

### Variables de entorno requeridas en Vercel

| Variable | Propósito |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon (pública, expuesta al browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (solo servidor, bypassa RLS) |
| `ADMIN_PIN` | PIN de 4 dígitos para acceso admin |

En desarrollo se definen en `.env.local` (no versionado).

El cliente Supabase en `src/lib/supabase/client.ts` incluye un fallback a credenciales placeholder para que `next build` no falle si las vars no están disponibles en build-time.

---

## 4. Conexión con la base de datos

Hay **dos clientes** Supabase con permisos distintos:

### 4.1 Cliente anon (browser / componentes)
```ts
// src/lib/supabase/client.ts
import { createClient } from "@supabase/supabase-js";
createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
```
- Respeta las políticas RLS de Supabase.
- Puede `SELECT` e `INSERT` en `movimientos`, pero **no `UPDATE` ni `DELETE`** (bloqueados por RLS).
- Usado directamente en páginas y componentes React.

### 4.2 Cliente service role (rutas API del servidor)
```ts
// Dentro de /api/editar-movimiento y /api/eliminar-venta
import { createClient } from "@supabase/supabase-js";
createClient<Database>(url, SUPABASE_SERVICE_ROLE_KEY)
```
- Bypassa todas las políticas RLS.
- Solo se instancia dentro de rutas API (`/api/*`) que corren en el servidor — nunca en el browser.
- Necesario para `UPDATE` y `DELETE` en `movimientos`.

---

## 5. Diseño de la base de datos

### 5.1 Tablas principales

#### Catálogos
| Tabla | Descripción |
|---|---|
| `lineas` | Líneas de producto: Hombre, Dama, Niño, Accesorio |
| `categorias` | Categorías universales: Busos, Pantalones, Camisetas… |
| `tallas` | Tallas con sistema: `ropa_adulto`, `ropa_nino`, `calzado`, `unica` |
| `ubicaciones` | Lugares físicos: Tienda (id=1), Bodega (id=2) |
| `usuarios` | Perfiles internos (sin Supabase Auth): admin o empleado |

#### Inventario
| Tabla | Descripción |
|---|---|
| `productos` | Cada SKU: código, referencia, línea, categoría, sistema de talla, precio base |
| `stock` | Cantidad por `(producto_id, talla_id, ubicacion_id)` — único por combinación |
| `movimientos` | Log de todo movimiento de stock (entrada/salida/devolución) — **fuente de verdad** |

#### Ventas y caja
| Tabla | Descripción |
|---|---|
| `caja_diaria` | Un registro por día (`abierta`/`cerrada`), saldo inicial, conteo final |
| `registros_caja` | Transacciones del libro diario: `venta`, `gasto`, `ingreso`, `caja_fuerte` |
| `gastos` | Gastos por categoría, vinculados a `caja_diaria` |

#### Apartados
| Tabla | Descripción |
|---|---|
| `clientes` | Nombre, teléfono, notas |
| `apartados` | Una fila por unidad reservada. `grupo_id` agrupa las del mismo pedido |
| `abonos` | Pagos parciales contra un apartado — el saldo se calcula desde esta tabla |

### 5.2 Vistas

| Vista | Qué expone |
|---|---|
| `v_stock_total` | Stock tienda + bodega + total por producto/talla |
| `v_stock_bajo` | Ídem pero solo filas con `stock_total <= 3` |
| `v_ventas_hoy` | Movimientos de salida de hoy con datos de producto/talla |
| `v_apartados_pendientes` | Apartados con `total_abonado` y `saldo` calculados en tiempo real |
| `v_resumen_caja_hoy` | Totales del día actual agrupados por método de pago |
| `v_resumen_caja` | Resumen completo por `caja_diaria`: efectivo, transferencias, gastos, saldo final |

### 5.3 Trigger de stock (crítico)

```sql
-- Se dispara AFTER INSERT ON movimientos (nunca en UPDATE ni DELETE)
CREATE TRIGGER trg_actualizar_stock
  AFTER INSERT ON movimientos
  FOR EACH ROW EXECUTE FUNCTION actualizar_stock_tras_movimiento();
```

**Lógica:**
- `tipo = entrada` o `devolucion` → suma al stock origen (UPSERT).
- `tipo = salida` → resta del stock origen.
- `canal = traslado` + `ubicacion_destino_id` → además suma al destino.

**Consecuencias importantes:**
- Editar o borrar un movimiento **no cambia el stock**.
- Para revertir una venta se debe insertar un movimiento compensatorio (`tipo=devolucion, canal=ajuste`), que es lo que hace `/api/eliminar-venta`.

### 5.4 Row Level Security (RLS)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `lineas`, `categorias`, `tallas`, `ubicaciones` | ✅ anon | ✅ anon | ✅ anon | ✅ anon |
| `usuarios`, `productos`, `stock` | ✅ anon | ✅ anon | ✅ anon | ✅ anon |
| `movimientos` | ✅ anon | ✅ anon | ❌ solo service role | ❌ solo service role |
| `caja_diaria` | ✅ anon | ✅ anon | ✅ anon | ✅ anon |
| `registros_caja` | ✅ anon | ✅ anon | ❌ | ✅ anon |
| `gastos` | ✅ anon | ✅ anon | ❌ | ✅ anon |
| `clientes`, `apartados`, `abonos` | ✅ anon | ✅ anon | ✅ anon | ✅ anon |

### 5.5 Enums (definidos en `src/lib/types.ts`, reflejados en SQL)

```ts
TipoMovimiento   = "entrada" | "salida" | "devolucion"
CanalMovimiento  = "venta_tienda" | "domicilio" | "envio_nacional" | "traslado"
                 | "cambio" | "garantia" | "ajuste" | "compra_proveedor" | "retiro_dueño"
MetodoPago       = "efectivo" | "nequi" | "transferencia" | "datafono" | "mixto"
EstadoApartado   = "pendiente" | "entregado" | "cancelado"
EstadoCaja       = "abierta" | "cerrada"
SistemaTalla     = "ropa_adulto" | "ropa_nino" | "calzado" | "unica"
TipoRegistroCaja = "venta" | "gasto" | "ingreso" | "caja_fuerte"
CategoriaGasto   = "alimentacion" | "transporte" | "insumos" | "servicios" | "caja_fuerte" | "otro"
```

---

## 6. API Routes (endpoints del servidor)

Solo hay 3 rutas API. Todas aceptan `POST` y retornan JSON.

### `POST /api/verify-pin`
Valida el PIN de admin contra la variable de entorno `ADMIN_PIN`.

**Body:** `{ pin: string }`  
**Respuesta OK:** `{ valid: true }`  
**Respuesta fallo:** `{ valid: false }` con status 401

No usa Supabase. Solo compara strings.

---

### `POST /api/editar-movimiento`
Actualiza `canal`, `metodo_pago`, `precio_venta` y `descuento` de uno o más movimientos de venta. Requiere service role porque `UPDATE` en `movimientos` está bloqueado para anon.

**Body:**
```ts
{
  canal: CanalMovimiento,      // "venta_tienda" | "domicilio" | "envio_nacional"
  metodo_pago: MetodoPago | null,
  items: Array<{
    id: number,
    precio_venta: number,
    descuento: number | null
  }>
}
```

**Validaciones:**
- Canal debe ser un canal de venta válido.
- Todos los `id` deben apuntar a movimientos `tipo=salida` con canal de venta.
- Precios deben ser positivos.

**Respuesta OK:** `{ ok: true }`

---

### `POST /api/eliminar-venta`
Anula una venta completa: restaura el stock con movimientos compensatorios, limpia los registros de caja vinculados y borra los movimientos originales. Requiere service role.

**Body:** `{ movimientoIds: number[] }`

**Flujo interno:**
1. Carga los movimientos originales.
2. Valida que todos sean `tipo=salida` con canal de venta.
3. Inserta movimientos `tipo=devolucion, canal=ajuste` → trigger restaura el stock.
4. Borra `registros_caja` vinculados a esos IDs.
5. Borra los movimientos originales.

**Respuesta OK:** `{ ok: true }`

---

## 7. Arquitectura de la aplicación

### 7.1 Estructura de carpetas clave

```
src/
  app/
    page.tsx                      # Selector de perfil + PIN
    api/
      verify-pin/route.ts
      editar-movimiento/route.ts
      eliminar-venta/route.ts
    (dashboard)/
      layout.tsx                  # DashboardGuard + NavBar + Toaster
      inicio/                     # Dashboard (KPIs del día)
      inventario/                 # Vista de stock (tabla Excel desktop, cards mobile)
      venta/                      # Registrar venta
      venta/[ref]/                # Detalle de pedido — editar o eliminar
      entrada/                    # Ingreso de mercancía
      traslado/                   # Mover stock tienda ↔ bodega
      devolucion/                 # Devolución de cliente
      cambio/                     # Cambio de prenda (2 movimientos: salida + entrada)
      retiro/                     # Retiro de efectivo
      apartados/                  # Lista de apartados
      apartados/nuevo/            # Crear apartado
      apartados/[id]/             # Detalle: abonos, marcar recibida, entregar, cancelar
      caja/                       # Vista de caja del día
      caja/historial/             # Lista de días cerrados
      caja/historial/[id]/        # Detalle de cierre
      productos/                  # Catálogo de productos
      productos/nuevo/            # Crear producto
      productos/[id]/             # Editar producto
      reportes/                   # KPIs y exportación
  components/
    NavBar.tsx                    # Sidebar desktop + bottom nav mobile
    BuscadorProducto.tsx          # Búsqueda de producto con talla
    SelectorTalla.tsx
    ListaProductos.tsx
    ExcelRow.tsx
    GestionarCategoriasModal.tsx  # CRUD de categorías (reutilizable)
    CierreResumen.tsx             # Resumen de cierre exportable a PNG
    ui/
      Button.tsx  Input.tsx  Modal.tsx  Badge.tsx
      Spinner.tsx  EmptyState.tsx  InputDinero.tsx
  lib/
    supabase/client.ts            # Fábrica del cliente anon
    context/ProfileContext.tsx    # Estado global del perfil activo
    types.ts                      # Tipos TypeScript + interfaz Database
    utils.ts                      # cn() (clsx + tailwind-merge)
    pedidos-venta.ts              # buildPedidosVenta() — agrupa movimientos en pedidos
```

### 7.2 Autenticación y roles

**No hay autenticación real.** El control de acceso es client-side:

- `/` muestra un selector de perfiles: **Admin** (requiere PIN) y **Empleados**.
- El PIN se verifica via `POST /api/verify-pin`.
- El perfil seleccionado se guarda en memoria con `useState` en `ProfileContext`. Recargar la página borra la sesión.
- El layout del dashboard (`DashboardGuard`) redirige a `/` si `profile === null`.
- Dentro de cada página se usa `useProfile()` para ramificar según `isAdmin`.

**Empleado:** solo lectura. No ve montos en Apartados ni en Historial de Caja.  
**Admin:** acceso completo a venta, caja, apartados CRUD, productos CRUD.

Esta capa es bypassable en el cliente. La seguridad real está en RLS y en las rutas API con service role.

### 7.3 Responsive design

- **Mobile:** navegación inferior (`bottom nav`), paneles de filtro como slide-up.
- **Desktop (md+):** sidebar izquierdo de 60px de ancho (`md:ml-60`), filtros inline.
- Inventario: tabla Excel en desktop, cards en mobile.
- Color primario brand: `#1C3A8C` (azul). Fuente: Outfit.

### 7.4 Flujo de pedidos de venta

Los movimientos de venta se agrupan en "pedidos" mediante `buildPedidosVenta()` en `src/lib/pedidos-venta.ts`:

- Los movimientos que comparten el mismo `movimiento_ref` forman un pedido.
- Un movimiento sin `movimiento_ref` forma su propio pedido sintético con key `SINREF-{id}`.
- La página `venta/[ref]` muestra el detalle del pedido y permite editarlo o eliminarlo.

### 7.5 Ventas offline en Caja

Las ventas registradas desde `/caja` se persisten en `localStorage` con badge "pendiente" cuando no hay conexión. Al recuperar la conexión se sincronizan con Supabase.

### 7.6 Regla de comisión

$1.000 por unidad en prendas con `precio_venta >= $30.000`. Se muestra en KPIs de Caja y Reportes, calculado en el frontend.

---

## 8. Lógica de negocio por módulo

### Inventario
Toda la actualización de stock ocurre **solo por trigger en INSERT** de `movimientos`. Nunca se escribe directamente en la tabla `stock` desde la app.

| Operación | Movimientos generados |
|---|---|
| Entrada de mercancía | 1 fila: `tipo=entrada` |
| Venta (tienda/domicilio/envío) | 1 fila por unidad: `tipo=salida, canal=venta_*` |
| Traslado tienda↔bodega | 1 fila: `tipo=salida` (origen) + trigger suma al destino |
| Devolución de cliente | 1 fila: `tipo=devolucion` |
| Cambio de prenda | 2 filas con mismo `movimiento_ref = CAM-{timestamp}`: salida de la prenda devuelta + entrada de la nueva |
| Anular venta | 1 fila compensatoria: `tipo=devolucion, canal=ajuste` por unidad |

### Apartados
- Una fila en `apartados` por unidad reservada.
- `grupo_id` agrupa todas las unidades del mismo pedido.
- `en_tienda=false` → prenda en camino del proveedor, no descuenta stock.
- `en_tienda=true` → prenda en tienda, descuenta stock inmediatamente.
- "Marcar recibida" cambia `en_tienda: false → true`. Si hay stock disponible lo descuenta; si no (llegó directo al cliente del proveedor), solo cambia el flag.
- Cancelar un apartado con `en_tienda=true` devuelve la unidad al stock.
- Los abonos solo se guardan en `abonos` — **no van a `registros_caja`**.

### Caja
- `caja_diaria` es day-scoped: una fila por día.
- Las ventas desde `/caja` generan un movimiento en `movimientos` **y** un registro en `registros_caja`.
- Las ventas desde `/venta` generan solo movimiento; no caen en caja automáticamente.
- `cerrar_caja` registra `efectivo_contado` y `diferencia_caja`.
- Los gastos e ingresos extra se registran como `registros_caja` de tipo `gasto`/`ingreso`.
- El guardado a caja fuerte se registra como `caja_fuerte`.
- Los totales (saldo final, total efectivo, etc.) son calculados por la vista `v_resumen_caja` — no se almacenan en la tabla.

---

## 9. Archivos SQL del repositorio

| Archivo | Propósito |
|---|---|
| `schema_nuevo.sql` | Schema completo: tablas, trigger, vistas, RLS, datos iniciales |
| `migration_linea_en_productos.sql` | Agrega `linea_id` directamente a `productos` |
| `migration_grupo_apartados.sql` | Agrega `grupo_id` a `apartados` y actualiza vista |
| `supabase_migration_caja.sql` | Crea `registros_caja` y columnas de cierre en `caja_diaria` |

Todos están aplicados en producción. El schema actual es `schema_nuevo.sql` + las tres migraciones.

---

## 10. Comandos de desarrollo

```bash
npm run dev      # Servidor de desarrollo en http://localhost:3000
npm run build    # Build de producción
npm run start    # Sirve el build de producción
npm run lint     # ESLint
```
