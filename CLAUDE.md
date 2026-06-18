# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

Sistema POS + inventario (single-tenant) para tienda de ropa deportiva, **en producción con uso diario**. Prioridad absoluta: no romper producción ni corromper datos. Este archivo tiene dos partes: **(A) cómo funciona el sistema HOY** (respétalo al tocar código existente) y **(B) arquitectura objetivo y reglas de transición** (todo código nuevo o refactorizado debe moverse hacia allá, nunca en dirección contraria).

## Commands

```bash
npm run dev      # Next.js dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Serve the production build
npm run lint     # next lint (eslint-config-next)
```

Deployment: Vercel. Aún no hay suite de tests configurada (ver Parte B — al introducirla: Vitest + Playwright).

## Environment

`.env.local` must define:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ADMIN_PIN` — PIN 4 dígitos validado server-side por `/api/verify-pin` *(legacy: será reemplazado por Supabase Auth, ver Parte B)*
- `SUPABASE_SERVICE_ROLE_KEY` — solo server-side, **jamás** `NEXT_PUBLIC_`. Usado por `/api/editar-movimiento` y `/api/eliminar-venta` para saltar RLS.

El cliente Supabase en `src/lib/supabase/client.ts` usa credenciales placeholder cuando faltan env vars para que el build estático no falle — no quitar ese guard.

---

# PARTE A — Estado actual del sistema

## Architecture

Next.js 14 **App Router** + React 18 + TypeScript (strict) + Tailwind. Data layer: Supabase (Postgres + views).

### Auth & role gating (estado actual — legacy)

**No hay auth real.** El control de acceso es solo client-side:

- `src/lib/context/ProfileContext.tsx` guarda el perfil en memoria (`useState`, no persiste). Refrescar pierde la sesión y vuelve a `/`.
- `/` es el selector de perfil. Admin pide PIN (POST a `/api/verify-pin` contra `ADMIN_PIN`).
- El route group `(dashboard)` envuelve páginas protegidas con `DashboardGuard` (redirige a `/` si `profile === null`).
- En páginas, usar `useProfile()` y `isAdmin` para ocultar acciones admin (venta, apartados CRUD, caja, productos CRUD). Empleado es read-only y no debe ver montos en Apartados / Historial de caja.

Este gating es trivialmente bypasseable. Cualquier frontera de seguridad real pertenece a RLS / endpoints con service role — y la migración a Supabase Auth es la prioridad #1 de la Parte B.

### Routing map

```
src/app/
  page.tsx                      # profile selection + PIN
  api/verify-pin/route.ts       # PIN check
  api/editar-movimiento/route.ts  # UPDATE movimientos bypassing RLS (service role)
  api/eliminar-venta/route.ts   # anular venta + restaurar stock (service role)
  (dashboard)/
    layout.tsx                  # guard + NavBar + Toaster
    inicio/ inventario/ venta/ venta/[ref]/
    entrada/ traslado/ devolucion/ cambio/
    apartados/ apartados/[id] apartados/nuevo
    caja/ caja/historial caja/historial/[id]
    productos/ productos/[id] productos/nuevo
    reportes/
```

### API routes con service role

- **`/api/editar-movimiento`** (POST) — actualiza `canal`, `metodo_pago`, `precio_venta`, `descuento` en movimientos de venta. Solo acepta `tipo=salida` con canal de venta.
- **`/api/eliminar-venta`** (POST) — recibe `{ movimientoIds }`, inserta movimientos de corrección (`tipo=devolucion, canal=ajuste`) para que el trigger restaure stock, borra `registros_caja` vinculados y elimina los movimientos originales. *(Ver Parte B: el borrado de movimientos originales debe migrar a anulación con marca, conservando historial.)*

Ambas validan que los movimientos sean ventas antes de actuar.

### Data model (Supabase)

Schema = fuente de verdad en los SQL del repo raíz: `schema_nuevo.sql` (base: tablas + vistas + trigger de stock) + `migration_linea_en_productos.sql`, `migration_grupo_apartados.sql`, `supabase_migration_caja.sql` (ya aplicadas). *(Parte B: migrar a `supabase/migrations/` con CLI.)*

Tablas: `productos`, `lineas`, `categorias`, `tallas`, `ubicaciones` (1=tienda, 2=bodega), `stock`, `movimientos`, `clientes`, `apartados`, `abonos`, `caja_diaria`, `registros_caja`, `gastos`. Vistas: `v_stock_total`, `v_stock_bajo`, `v_apartados_pendientes`, `v_resumen_caja_hoy`, `v_resumen_caja`. Uniones tipo enum en `src/lib/types.ts` (`TipoMovimiento`, `CanalMovimiento`, `MetodoPago`, `EstadoApartado`, `SistemaTalla`…) — **deben mantenerse en sync con el SQL**.

### RLS constraints (crítico)

Con anon key, `movimientos` solo permite `SELECT` e `INSERT`. **`UPDATE` y `DELETE` están bloqueados** — fallan silenciosamente (0 filas, sin error). Toda escritura destructiva sobre `movimientos` va por API routes con service role. `registros_caja` y `gastos` SÍ permiten `DELETE` con anon key *(hueco de seguridad conocido — cerrar en Parte B)*.

### Stock trigger (crítico)

`actualizar_stock_tras_movimiento` **solo dispara en INSERT**, nunca en UPDATE/DELETE:

- Editar un movimiento **no cambia stock**. Borrarlo **no restaura stock**.
- Restaurar stock = insertar movimiento compensatorio (`tipo=devolucion, canal=ajuste`), como hace `/api/eliminar-venta`.

### Cross-cutting invariants

- **El inventario lo manejan los `movimientos`.** Venta/entrada/traslado/devolucion/cambio insertan filas cuyo `tipo` + `canal` codifican la operación; el stock se actualiza vía trigger. Un **cambio** escribe 2 filas ligadas por `referencia = CAM-{timestamp}`.
- **Ventas en Caja descuentan stock al instante** (al registrar, no al cerrar). Cerrar caja solo hace el cuadre financiero.
- **Apartados: una fila por unidad.** Filas del mismo pedido comparten `grupo_id`. `en_tienda` codifica si la unidad ya se descontó del stock. Crear con `en_tienda=true` inserta `salida/ajuste`. "Marcar recibida" (`false → true`): si hay stock lo descuenta y marca; si no (fue directo proveedor→cliente), solo marca. Cancelar con `en_tienda=true` devuelve vía `entrada/ajuste`.
- **Caja es por día.** `caja_diaria` (abierta/cerrada) + `registros_caja` (venta/gasto/ingreso/caja_fuerte). Ventas desde `/venta` **no** caen automáticamente en caja — para contar en el cierre se registran desde `/caja`. **Los abonos de apartados solo entran a caja si hay caja abierta** *(inconsistencia conocida, ver Parte B)*.
- **Comisión:** $1.000 por unidad en artículos con precio unitario ≥ $30.000 (KPIs de Caja/Reportes). ⚠️ DOCUMENTACION.md §13 dice "> $25.000" — **la regla vigente es ≥ $30.000**; corregir la doc, no el código.
- **Offline en Caja:** ventas se persisten en `localStorage` con badge "pendiente" y se sincronizan al volver la conexión — tener en cuenta al tocar el flujo de venta desde caja.

### Pedidos de venta (`src/lib/pedidos-venta.ts`)

`buildPedidosVenta()` agrupa los movimientos de venta del día en "pedidos" por `movimiento_ref` (o `SINREF-{id}`). `venta/[ref]` muestra el detalle y permite editar/eliminar vía las API routes.

### UI conventions

- Color primario `#1C3A8C`. Fuente Outfit. Path alias `@/*` → `./src/*`.
- Componentes globales en `src/components/`; primitivas (Button, Input, Modal, Badge, Spinner, EmptyState, InputDinero) en `src/components/ui/`. Usar `cn()` de `src/lib/utils.ts`.
- Toasts: `react-hot-toast` (Toaster montado una vez en el layout del dashboard).
- Mobile: bottom nav + paneles deslizantes. Desktop: sidebar (`md:ml-60`) + dropdowns inline. Inventario: tabla tipo Excel en desktop, cards en móvil.
- Reportes/cierre exportan a PNG vía `html2canvas`.

### Language

UI, comentarios, commits y nombres de dominio en español (apartado, abono, traslado…). Mantener ese estilo.

---

# PARTE B — Arquitectura objetivo y reglas de transición

Estas reglas gobiernan TODO código nuevo o refactorizado. Ante conflicto entre Parte A y Parte B: la Parte A describe, la Parte B manda. No generar código nuevo con los patrones legacy.

## Reglas duras de base de datos (NUNCA violar)

1. **Migraciones via Supabase CLI** (`supabase/migrations/`), append-only: jamás editar una migración aplicada. Cambios destructivos siguen expand → migrate → contract. Los `.sql` sueltos del repo raíz son el legado a absorber como baseline (`supabase db pull`).
2. **Toda tabla nueva incluye en la MISMA migración** `ENABLE ROW LEVEL SECURITY` + policies explícitas por operación. Default deny.
3. **Dinero es `numeric(12,2)`**, nunca float. Fechas `timestamptz`.
4. **`movimientos` es append-only (objetivo estricto):** las anulaciones insertan contramovimiento y marcan el original (`anulado_por`), NO lo borran. Al tocar `/api/eliminar-venta`, migrar hacia ese patrón — el borrado actual destruye el historial de reportes.
5. **El stock nunca se calcula en TypeScript** (leer→calcular→escribir = race condition). Operaciones de venta/inventario multi-paso → RPC transaccional plpgsql con `UPDATE ... WHERE cantidad >= n` y constraint `CHECK (cantidad >= 0)` en `stock`.
6. **supabase-js no soporta transacciones**: nunca orquestar transacciones desde Next.js; siempre RPC.
7. Cambios de estado de apartados solo vía RPCs dedicadas; las transiciones válidas las impone un trigger de transición. Nunca UPDATE directo de `estado` desde el cliente.
8. Ventas idempotentes: `client_sale_id` UUID generado en cliente con constraint unique (crítico para el flujo offline existente).

## Reglas duras de auth y seguridad

9. **Destino: Supabase Auth + roles reales** (admin/empleado via custom claim `user_role` por Auth Hook). El PIN/ProfileContext es legacy: no extenderlo; toda feature nueva de autorización se diseña para el modelo destino.
10. Solo `@supabase/ssr`. **PROHIBIDO `@supabase/auth-helpers-nextjs`**. Cookies solo `getAll`/`setAll`. En servidor `supabase.auth.getUser()`, nunca `getSession()`.
11. Middleware = UX (redirects, refresh). La autorización real vive en RLS + verificación en Server Actions/Route Handlers.
12. Cerrar los huecos RLS conocidos: `registros_caja` y `gastos` no deben permitir DELETE con anon key. Policies objetivo: `supervisor` = SELECT en todo, cero escrituras; `admin` = escrituras vía RPCs. La ocultación client-side actual no es seguridad.
13. `SUPABASE_SERVICE_ROLE_KEY`: minimizar su uso; cada endpoint que la usa debe validar rol del solicitante (hoy no lo hacen — cualquiera puede llamar `/api/eliminar-venta`).
14. Todo input se valida con zod en servidor, aunque el cliente ya valide.

## Convenciones para código nuevo

- Server Components por defecto; `'use client'` solo con interactividad.
- **Rediseño UI en curso (v0 + shadcn/ui):** los componentes visuales nuevos vienen de v0 como presentacionales y se integran con regla estricta — *comportamiento idéntico, solo capa visual*: no tocar `src/lib`, queries, API routes ni lógica de negocio al integrar UI. Primitivas legacy (`Button`, `Badge`, `Modal` de `src/components/ui/`) migran a shadcn (Button, Badge, Dialog/Sheet) gradualmente; no crear primitivas nuevas del estilo viejo. Tokens de diseño en CSS variables de shadcn (azul `#1C3A8C` primario, dorado `#C49A2C` acento), no hexes sueltos. Sistema de diseño y prompts: `docs/prompt-rediseno-ui.md` y `UI_DESIGN_BRIEF.md`.
- **Modelo de roles objetivo (decisión de negocio, jun 2026):** el perfil hoy llamado "Empleado" lo usa el jefe y es en realidad un **supervisor de solo lectura con visibilidad financiera completa**: ve inicio (resumen de pedidos del día, domicilios, apartados pendientes, stock bajo), inventario, apartados, **caja del día**, historiales y reportes — **con todos los montos** — pero NO puede registrar, editar ni eliminar nada. La ocultación de montos del código actual (Parte A) es legacy a eliminar; al migrar a Supabase Auth nombrar los roles `admin` y `supervisor`.
- **RBAC por permisos, no por roles (diseño base, no opcional):** desde el inicio crear enum `app_permission` ('pos.sell', 'caja.register', 'caja.close', 'inventory.manage', 'apartados.manage', 'products.manage', 'money.view') + tabla `role_permissions`. Las policies RLS y los grants de RPCs validan con `authorize('permiso')`, nunca comparando el rol directamente. Así, roles futuros (ej. `cajero`: vende en caja + solo lectura en lo demás) son filas nuevas en `role_permissions`, sin tocar policies ni código.
- **UI por capacidades:** las pantallas NO reciben `isAdmin: boolean`; reciben un objeto `can: { sell, manageInventory, manageApartados, registerCash, closeCash, manageProducts, viewMoney }` derivado del rol en un solo helper (`src/lib/permissions.ts`). Cada acción de UI se condiciona a su capacidad específica. Nunca condicionar UI con comparaciones de rol dispersas.
- **Sin emojis en la UI**: nunca usar emojis en textos, botones, badges, toasts, estados vacíos ni avatares. Iconografía exclusivamente lucide-react. Los avatares emoji actuales del selector de perfil son legacy: al tocarlos, reemplazar por iniciales sobre fondo de color de marca.
- Datos remotos nuevos: TanStack Query (`networkMode: 'offlineFirst'`); no introducir más `useEffect + fetch`.
- Formularios nuevos: react-hook-form + zod, esquema compartido cliente/servidor.
- Offline: el localStorage actual de Caja se mantiene; su evolución es cola de mutaciones en IndexedDB (Dexie) deduplicada por `client_sale_id`. No expandir el patrón localStorage a flujos nuevos.
- Tests: al crear la suite — Vitest (lógica de negocio: totales, comisiones, descuentos) + Playwright (E2E: venta, cierre de caja, apartados). Todo bug de producción gana un test antes del fix.

## Flujo de trabajo del agente

- **Plan antes que código** en tareas no triviales: listar archivos y enfoque; esperar aprobación.
- Diffs pequeños, acotados a la tarea. Refactor = comportamiento idéntico. No "aprovechar para mejorar".
- **Migraciones SQL y policies RLS requieren revisión humana explícita** — proponerlas, no aplicarlas.
- Antes de tocar inventario, caja o apartados: leer la sección correspondiente de `DOCUMENTACION.md` (spec funcional: flujos por pantalla, permisos por rol, y exactamente qué filas de `movimientos`/`registros_caja` produce cada acción).
- Arquitectura completa y justificación: `docs/deep-research-pos-maduracion.md`. Ante duda, esa es la fuente; no improvisar alternativas.

## Decisiones ya tomadas (no re-litigar)

- Lógica de invariantes (stock, totales) en triggers/RPCs de Postgres, no en backend JS.
- Stock = agregado cacheado por trigger + reconciliación periódica (no vista materializada ni cálculo al vuelo).
- Costeo futuro: promedio ponderado → todo movimiento de compra debe guardar `costo_unitario`.
- Pagos mixtos: evolucionar hacia tabla de pagos por venta (N pagos por venta), no columna `metodo_pago='mixto'` con desglose ad-hoc.
- **Reportes: las métricas de ventas se calculan desde `movimientos` (ledger), nunca desde `caja_diaria`/`registros_caja`.** Caja solo reporta flujo de efectivo y cuadre. Los KPIs actuales basados en cierres de caja son un bug conocido (ignoran ventas de `/venta`); al tocar reportes, migrar a la fuente correcta. Diseño objetivo de KPIs: §8.5 de la deep research.
- Agente Telegram (futuro): tool-calling sobre RPCs read-only, NO text-to-SQL libre.
- Git: trunk-based, feature branches cortas, PR con CI verde para `main`.

## Further reading

- `DOCUMENTACION.md` — spec funcional por pantalla. Consultar antes de cambiar lógica de negocio.
- `TAREAS_PENDIENTES.md` — chores operativos.
- `docs/deep-research-pos-maduracion.md` — investigación de arquitectura (el porqué de la Parte B).