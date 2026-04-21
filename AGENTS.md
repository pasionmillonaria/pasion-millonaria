# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

Route group structure mirrors the feature list in [DOCUMENTACION.md](DOCUMENTACION.md):

```
src/app/
  page.tsx                    # profile selection + PIN
  api/verify-pin/route.ts     # PIN check
  (dashboard)/
    layout.tsx                # guard + NavBar + Toaster
    inicio/                   # dashboard (admin/empleado variants)
    inventario/               # read-only stock view
    venta/ entrada/ traslado/ devolucion/ cambio/   # movimientos
    apartados/  apartados/[id]  apartados/nuevo
    caja/  caja/historial  caja/historial/[id]
    productos/  productos/[id]  productos/nuevo
    reportes/
```

### Data model (Supabase)

Schema is authored in SQL files at the repo root — treat them as the source of truth when you need to understand or extend the DB:

- [schema_nuevo.sql](schema_nuevo.sql) — base schema (tables + views).
- [migration_linea_en_productos.sql](migration_linea_en_productos.sql), [migration_grupo_apartados.sql](migration_grupo_apartados.sql), [supabase_migration_caja.sql](supabase_migration_caja.sql) — incremental migrations already applied.

Key tables: `productos`, `lineas`, `categorias`, `tallas`, `ubicaciones` (id=1 tienda, id=2 bodega), `stock`, `movimientos`, `clientes`, `apartados`, `abonos`, `caja_diaria`, `registros_caja`, `gastos`. Key views: `v_stock_total`, `v_stock_bajo`, `v_apartados_pendientes`, `v_resumen_caja_hoy`, `v_resumen_caja`. Enum-like unions live in [src/lib/types.ts](src/lib/types.ts) (`TipoMovimiento`, `CanalMovimiento`, `MetodoPago`, `EstadoApartado`, `SistemaTalla`, …) and must stay in sync with the SQL.

### Cross-cutting invariants

- **Inventory is driven by `movimientos`.** Venta/entrada/traslado/devolucion/cambio each insert one or more rows whose `tipo` + `canal` encode the operation; stock updates follow. A **cambio** writes two rows linked by `referencia = CAM-{timestamp}`.
- **Apartados use one row per unit.** All rows of the same pedido share a `grupo_id`. Adding/removing a prenda can touch `stock` + `movimientos` depending on whether it was "en tienda" vs "pedir al proveedor".
- **Caja is day-scoped.** Each `caja_diaria` row represents a day (`abierta`/`cerrada`); transactions go into `registros_caja` (`venta`/`gasto`/`ingreso`/`caja_fuerte`). Ventas desde `/venta` **no** caen automáticamente en caja — para que cuenten en el cierre, la venta se registra desde `/caja`. Abonos hacia apartados sí crean un registro en caja si hay caja abierta.
- **Commission rule:** $1.000 per unit on items with unit price ≥ $30.000 (shown in Caja/Reportes KPIs).
- **Offline ventas en Caja** se persisten en `localStorage` con badge "pendiente" y se sincronizan cuando vuelve la conexión — ten esto en cuenta si tocas el flujo de venta desde caja.

### UI conventions

- Primary brand color `#1C3A8C`. Outfit is the app font.
- Global client components live in [src/components/](src/components/); primitives (Button, Input, Modal, Badge, Spinner, EmptyState, InputDinero) under [src/components/ui/](src/components/ui/). Use `cn()` from [src/lib/utils.ts](src/lib/utils.ts) (clsx + tailwind-merge).
- Toasts via `react-hot-toast` (Toaster is mounted once in the dashboard layout).
- Mobile: bottom nav + slide-up filter panels. Desktop: left sidebar (`md:ml-60`) + inline dropdown filters. Inventario uses an Excel-style table on desktop and cards on mobile.
- Reportes/cierre de caja export to PNG via `html2canvas`.
- Path alias `@/*` → `./src/*`.

### Language

UI copy, comments, commit messages, and most variable names are in Spanish. Match that style when editing user-facing strings or naming domain concepts (apartado, abono, traslado, etc.).

## Further reading

[DOCUMENTACION.md](DOCUMENTACION.md) is the functional spec — per-screen flows, role permissions, and exactly which `movimientos` / `registros_caja` rows each action produces. Consult it before changing business logic. [TAREAS_PENDIENTES.md](TAREAS_PENDIENTES.md) tracks ops chores (rotating the PIN in Vercel, wiring product photos via Supabase Storage).
