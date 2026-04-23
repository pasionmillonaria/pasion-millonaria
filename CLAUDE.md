# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Next.js dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Serve the production build
npm run lint     # next lint (eslint-config-next)
```

No test suite is configured. Deployment target is Vercel (see `TAREAS_PENDIENTES.md` for env-var workflow).

## Environment

`.env.local` must define:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project credentials.
- `ADMIN_PIN` — 4-digit PIN validated server-side by `/api/verify-pin`.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role secret (server-side only, never `NEXT_PUBLIC_`). Required by `/api/editar-movimiento` and `/api/eliminar-venta` to bypass RLS.

The Supabase client in [src/lib/supabase/client.ts](src/lib/supabase/client.ts) falls back to placeholder credentials when env vars are missing so static build steps don't crash; don't remove that guard.

## Architecture

Next.js 14 **App Router** + React 18 + TypeScript (strict) + Tailwind. Data layer is Supabase (Postgres + views). The app is a single-tenant internal tool for a sports-apparel store (POS + inventory).

### Auth & role gating (important)

There is **no real user auth**. Access control is client-side only:

- [src/lib/context/ProfileContext.tsx](src/lib/context/ProfileContext.tsx) holds the selected profile in memory (`useState`, not persisted). Refreshing loses the session and bounces back to `/`.
- `/` ([src/app/page.tsx](src/app/page.tsx)) is the profile picker. Admin requires a PIN, verified by POSTing to [src/app/api/verify-pin/route.ts](src/app/api/verify-pin/route.ts) which compares against `ADMIN_PIN`.
- The `(dashboard)` route group ([src/app/(dashboard)/layout.tsx](src/app/(dashboard)/layout.tsx)) wraps every protected page with a `DashboardGuard` that redirects to `/` when `profile === null`.
- Inside pages, use `useProfile()` and branch on `isAdmin` to hide admin-only actions (venta, apartados CRUD, caja, productos CRUD). Empleado is essentially read-only and must not see monetary amounts in Apartados / Historial de caja.

This gating is trivially bypassable on the client. Any security boundary belongs in Supabase RLS / service-role endpoints, not in this layer.

### Routing map

```
src/app/
  page.tsx                      # profile selection + PIN
  api/verify-pin/route.ts       # PIN check
  api/editar-movimiento/route.ts  # UPDATE movimientos bypassing RLS (service role)
  api/eliminar-venta/route.ts   # DELETE venta + restore stock (service role)
  (dashboard)/
    layout.tsx                  # guard + NavBar + Toaster
    inicio/                     # dashboard (admin/empleado variants)
    inventario/                 # read-only stock view
    venta/                      # registrar venta (admin)
    venta/[ref]/                # detalle de pedido — editar canal/precio/método, eliminar
    entrada/ traslado/ devolucion/ cambio/
    apartados/  apartados/[id]  apartados/nuevo
    caja/  caja/historial  caja/historial/[id]
    productos/  productos/[id]  productos/nuevo
    reportes/
```

### API routes que requieren service role

Dos rutas del servidor usan `SUPABASE_SERVICE_ROLE_KEY` para operaciones que el anon key no puede hacer:

- **`/api/editar-movimiento`** (POST) — actualiza `canal`, `metodo_pago`, `precio_venta`, `descuento` en movimientos de venta. Solo acepta `tipo=salida` con canal de venta.
- **`/api/eliminar-venta`** (POST) — recibe `{ movimientoIds: number[] }`, inserta movimientos de corrección (`tipo=devolucion, canal=ajuste`) para que el trigger restaure el stock, borra `registros_caja` vinculados y elimina los movimientos originales.

Ambas rutas validan que los movimientos sean ventas antes de actuar.

### Data model (Supabase)

Schema es la fuente de verdad en los SQL del repo raíz:

- [schema_nuevo.sql](schema_nuevo.sql) — schema base (tablas + vistas + trigger de stock).
- [migration_linea_en_productos.sql](migration_linea_en_productos.sql), [migration_grupo_apartados.sql](migration_grupo_apartados.sql), [supabase_migration_caja.sql](supabase_migration_caja.sql) — migraciones ya aplicadas.

Key tables: `productos`, `lineas`, `categorias`, `tallas`, `ubicaciones` (id=1 tienda, id=2 bodega), `stock`, `movimientos`, `clientes`, `apartados`, `abonos`, `caja_diaria`, `registros_caja`, `gastos`. Key views: `v_stock_total`, `v_stock_bajo`, `v_apartados_pendientes`, `v_resumen_caja_hoy`, `v_resumen_caja`. Enum-like unions live in [src/lib/types.ts](src/lib/types.ts) (`TipoMovimiento`, `CanalMovimiento`, `MetodoPago`, `EstadoApartado`, `SistemaTalla`, …) and must stay in sync with the SQL.

### RLS constraints (crítico)

La política RLS de `movimientos` con el anon key solo permite `SELECT` e `INSERT`. **`UPDATE` y `DELETE` están bloqueados** para el anon key — cualquier intento falla silenciosamente (sin error, 0 filas afectadas). Por eso toda escritura destructiva sobre `movimientos` va por las rutas API con service role.

`registros_caja` sí permite `DELETE` con anon key. `gastos` también.

### Stock trigger (crítico)

El trigger `actualizar_stock_tras_movimiento` **solo dispara en `INSERT`**, nunca en `UPDATE` ni `DELETE`. Consecuencias:

- Editar un movimiento existente **no cambia el stock**.
- Borrar un movimiento **no restaura el stock**.
- Para restaurar stock al anular una venta hay que insertar un movimiento compensatorio (`tipo=devolucion, canal=ajuste`) — que es lo que hace `/api/eliminar-venta`.

### Cross-cutting invariants

- **Inventory is driven by `movimientos`.** Venta/entrada/traslado/devolucion/cambio each insert one or more rows whose `tipo` + `canal` encode the operation; stock updates follow immediately via trigger. A **cambio** writes two rows linked by `referencia = CAM-{timestamp}`.
- **Ventas en Caja descuentan stock al instante** — el movimiento se inserta cuando se registra la venta, no al cerrar caja. Cerrar caja solo hace el cuadre financiero.
- **Apartados use one row per unit.** All rows of the same pedido share a `grupo_id`. Adding/removing a prenda can touch `stock` + `movimientos` depending on whether it was "en tienda" vs "pedir al proveedor".
- **Caja is day-scoped.** Each `caja_diaria` row represents a day (`abierta`/`cerrada`); transactions go into `registros_caja` (`venta`/`gasto`/`ingreso`/`caja_fuerte`). Ventas desde `/venta` **no** caen automáticamente en caja — para que cuenten en el cierre, la venta se registra desde `/caja`. **Los abonos de apartados no se registran en caja** (se guardan solo en la tabla `abonos`).
- **Commission rule:** $1.000 per unit on items with unit price ≥ $30.000 (shown in Caja/Reportes KPIs).
- **Offline ventas en Caja** se persisten en `localStorage` con badge "pendiente" y se sincronizan cuando vuelve la conexión — ten esto en cuenta si tocas el flujo de venta desde caja.

### Pedidos de venta (`src/lib/pedidos-venta.ts`)

Los movimientos de venta del día se agrupan en "pedidos" mediante `buildPedidosVenta()`. Un pedido es el conjunto de movimientos que comparten el mismo `movimiento_ref` (o un movimiento suelto con `SINREF-{id}`). La página `venta/[ref]` muestra el detalle de un pedido y permite editar (vía `/api/editar-movimiento`) o eliminar (vía `/api/eliminar-venta`).

### UI conventions

- Primary brand color `#1C3A8C`. Outfit is the app font.
- Global client components live in [src/components/](src/components/); primitives (Button, Input, Modal, Badge, Spinner, EmptyState, InputDinero) under [src/components/ui/](src/components/ui/). Use `cn()` from [src/lib/utils.ts](src/lib/utils.ts) (clsx + tailwind-merge).
- [src/components/GestionarCategoriasModal.tsx](src/components/GestionarCategoriasModal.tsx) — modal reutilizable para editar/eliminar categorías; recibe `categorias`, `onChange` y `onDeleted`. Usado en `/productos/[id]` y `/productos/nuevo`.
- Toasts via `react-hot-toast` (Toaster is mounted once in the dashboard layout).
- Mobile: bottom nav + slide-up filter panels. Desktop: left sidebar (`md:ml-60`) + inline dropdown filters. Inventario uses an Excel-style table on desktop and cards on mobile.
- Reportes/cierre de caja export to PNG via `html2canvas`.
- Path alias `@/*` → `./src/*`.

### Language

UI copy, comments, commit messages, and most variable names are in Spanish. Match that style when editing user-facing strings or naming domain concepts (apartado, abono, traslado, etc.).

## Further reading

[DOCUMENTACION.md](DOCUMENTACION.md) is the functional spec — per-screen flows, role permissions, and exactly which `movimientos` / `registros_caja` rows each action produces. Consult it before changing business logic. [TAREAS_PENDIENTES.md](TAREAS_PENDIENTES.md) tracks ops chores (rotating the PIN in Vercel, wiring product photos via Supabase Storage).
