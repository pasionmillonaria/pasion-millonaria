# Plan detallado — Auth real + RBAC + RLS (Fase 2)

Migración del login falso (PIN en memoria) a **Supabase Auth con roles reales y
seguridad a nivel de base (RLS)**. Es el cambio grande y delicado de la Fase 2: toca el
login que usan los empleados a diario, así que va con red doble (staging primero, PIN de
respaldo, rollback de un clic).

> Este documento es **resumible**: si se corta la sesión, lee primero el tablero de
> abajo para saber en qué paso vamos. Marca cada `[ ]` como `[x]` al completarlo y
> actualiza "Última actualización" y "Próximo paso".

---

## ░ DÓNDE NOS QUEDAMOS (actualizar siempre)

- **Última actualización:** 2026-06-12 — plan creado, aún sin ejecutar ningún paso.
- **Próximo paso:** Fase A, paso A1 (crear usuarios reales en Supabase Auth de staging).
- **Rama de trabajo sugerida:** `feat/auth-real` (crear desde `main` cuando arranque la ejecución).
- **Resumen de avance:** 0 / 7 fases completas. Nada aplicado a prod. PIN sigue siendo el login activo.

### Tablero de fases

| Fase | Qué | Entorno | Estado |
|------|-----|---------|--------|
| A | Fundación de identidad (usuarios + esquema de permisos + Auth Hook) | local → staging | ⬜ pendiente |
| B | Capa Supabase SSR + middleware + helper de permisos | local | ⬜ pendiente |
| C | Login nuevo en paralelo, detrás de feature flag | local → staging | ⬜ pendiente |
| D | RLS con significado (policies por permiso) + RPCs | local → staging | ⬜ pendiente |
| E | Pruebas en staging (Playwright de auth + RLS) | staging | ⬜ pendiente |
| F | Switch en producción (una noche, PIN de respaldo) | producción | ⬜ pendiente |
| G | Limpieza (quitar PIN/legacy, policies permisivas viejas) | local → staging → prod | ⬜ pendiente |

---

## Objetivo y principios

- **Objetivo:** que la base de datos sepa **quién** es cada usuario y **qué puede hacer**,
  cerrando el hueco de que hoy la seguridad es solo de pantalla (burlable).
- **Aditivo primero, destructivo después** (expand → contract): se construye al lado del
  PIN, sin romperlo, y solo al final se quita lo viejo.
- **Staging siempre primero.** Prod solo en el paso F, de noche, con rollback de un clic.
- **Un cambio a la vez.** Nunca mezclar "activar RLS" con "migrar auth" en el mismo deploy.

## Estado actual verificado (2026-06-12)

- `src/lib/supabase/client.ts` — cliente de navegador (con guard de credenciales placeholder). ✅ existe
- `src/lib/supabase/server.ts` — cliente de servidor con patrón correcto `getAll/setAll`, anon key. ✅ existe
- `@supabase/ssr ^0.5.1` instalado. ✅
- `src/app/login/` — directorio **vacío** (sin `page.tsx`). ⬜
- **No existe** `middleware.ts`. ⬜
- No hay uso de `getSession` ni de `@supabase/auth-helpers-nextjs` (bien). ✅
- Login actual: `ProfileContext` en memoria + PIN vía `/api/verify-pin`. (legacy, se conserva hasta el switch)

## Reglas duras (no violar — del CLAUDE.md Parte B)

1. Solo `@supabase/ssr`. **PROHIBIDO** `@supabase/auth-helpers-nextjs`. Cookies solo `getAll`/`setAll`.
2. En servidor: `supabase.auth.getUser()`, **nunca** `getSession()`.
3. Middleware = UX (redirects, refresh de sesión). La autorización real vive en **RLS + verificación en Server Actions/Route Handlers**.
4. **RBAC por permisos, no por roles:** las policies y RPCs validan con `authorize('permiso')`, nunca comparando el rol directamente.
5. La UI recibe un objeto `can: {...}` derivado del rol en **un solo helper** (`src/lib/permissions.ts`), nunca `isAdmin` disperso.
6. Migraciones SQL y policies RLS: **se proponen, las revisa un humano** antes de aplicar a prod. Append-only en `supabase/migrations/`.
7. Todo input se valida con **zod en servidor**, aunque el cliente ya valide.
8. Sin emojis en UI; iconos solo de lucide-react.

## Decisiones de negocio (ya tomadas, no re-litigar)

- Dos roles: **`admin`** (opera todo) y **`supervisor`** (solo lectura, ve TODO incluidos los montos). El "Empleado" actual del código ES el supervisor; la ocultación de montos actual es legacy a eliminar.
- Permisos (enum `app_permission`): `pos.sell`, `caja.register`, `caja.close`, `inventory.manage`, `apartados.manage`, `products.manage`, `money.view`.
  - `admin` → todos.
  - `supervisor` → solo `money.view`.
- Roles futuros (ej. `cajero`) = filas nuevas en `role_permissions`, sin tocar código ni policies.

---

## FASE A — Fundación de identidad (aditivo, no toca el login actual)

> Construye la identidad y los permisos en la base. El PIN sigue funcionando igual.

- [ ] **A1.** Crear los usuarios reales en **Supabase Auth de staging** (dashboard → Authentication → Add user): uno `admin` y uno `supervisor`. Guardar correos/contraseñas en lugar seguro.
- [ ] **A2.** Migración SQL `nnnn_auth_rbac_schema.sql` (REVISIÓN HUMANA) con, en una sola migración y con RLS + policies explícitas:
  - `create type app_role as enum ('admin','supervisor');`
  - `create type app_permission as enum ('pos.sell','caja.register','caja.close','inventory.manage','apartados.manage','products.manage','money.view');`
  - tabla `user_roles (id, user_id uuid references auth.users unique, role app_role)` — RLS: cada quien lee su fila; escritura solo service_role/admin.
  - tabla `role_permissions (id, role app_role, permission app_permission, unique(role,permission))` — RLS: lectura para autenticados; escritura solo admin.
  - seed de `role_permissions`: admin = los 7 permisos; supervisor = `money.view`.
- [ ] **A3.** Función `authorize(requested app_permission) returns boolean` `security definer`, `stable`, que lee el rol del claim del JWT (`auth.jwt() -> 'user_role'`) y verifica contra `role_permissions`. Sin acceso al claim, retorna false (default deny).
- [ ] **A4.** **Auth Hook** (Custom Access Token Hook) que inyecta el claim `user_role` en el JWT a partir de `user_roles`. Configurarlo en staging (dashboard → Authentication → Hooks) + función `public.custom_access_token_hook(event jsonb)`.
- [ ] **A5.** Aplicar A2–A4 en **local** (`supabase db reset` / `migration up`) y validar con SQL que `authorize()` responde bien para cada rol.

**Salida de fase:** la base ya sabe roles y permisos; el JWT de un usuario logueado trae su rol. El login de la app sigue siendo el PIN.

## FASE B — Capa Supabase SSR + middleware (solo plomería, sin gating)

- [ ] **B1.** Crear `src/lib/supabase/middleware.ts` (helper de refresh de sesión con `getAll/setAll`) y `middleware.ts` en la raíz que lo use. Solo refresca sesión; **no bloquea** todavía.
- [ ] **B2.** Confirmar que `server.ts` usa `getUser()` (no `getSession()`) donde se lea el usuario.
- [ ] **B3.** Helper `src/lib/permissions.ts`: función que, dado el usuario/rol, devuelve `can = { vender, manejarInventario, registrarCaja, cerrarCaja, manejarApartados, manejarProductos, verMontos }`. Una sola fuente de verdad.
- [ ] **B4.** (Aún no se conecta a la UI — eso es Fase C tras el flag.)

**Salida de fase:** la app puede leer la sesión real y calcular capacidades, sin cambiar el comportamiento visible.

## FASE C — Login nuevo en paralelo (detrás de feature flag)

- [ ] **C1.** Feature flag por env var, p. ej. `NEXT_PUBLIC_AUTH_MODE = 'pin' | 'supabase'` (default `pin`). Decide qué login usa la app.
- [ ] **C2.** Página real `src/app/login/page.tsx`: email + contraseña con `@supabase/ssr` (Server Action para `signInWithPassword`). Sin emojis; estilo de marca.
- [ ] **C3.** Adaptar `ProfileContext`/guard para que, cuando `AUTH_MODE='supabase'`, el perfil salga del usuario real + `can` del helper; cuando `'pin'`, siga el flujo legacy. (Convivencia.)
- [ ] **C4.** Cambiar las pantallas para condicionar acciones por `can.*` (no por `isAdmin`). Hacerlo de forma que con `AUTH_MODE='pin'` el comportamiento sea idéntico al de hoy (mapear el rol legacy a `can`).
- [ ] **C5.** Probar en local con el flag en `supabase`: login real, capacidades correctas; y con `pin`: comportamiento idéntico al actual.

**Salida de fase:** existe un login real funcional detrás de un interruptor; con el interruptor apagado, la tienda no nota nada.

## FASE D — RLS con significado (expand) + RPCs

> Las policies hoy son permisivas (`true`). Aquí se crean las reales **sin quitar** las viejas todavía (expand), se validan, y se contraen en la Fase G.

- [ ] **D1.** Migración (REVISIÓN HUMANA) que agrega policies nuevas por tabla usando `authorize('permiso')`:
  - lectura para `admin` y `supervisor` (ambos ven todo, incluidos montos);
  - escritura solo donde el permiso corresponda (ej. `movimientos` insert → `pos.sell`/`inventory.manage`; `registros_caja` → `caja.register`; etc.).
- [ ] **D2.** Cerrar los huecos conocidos: `registros_caja` y `gastos` no deben permitir DELETE con anon. `movimientos` sigue append-only (anulación = contramovimiento + marca, no DELETE).
- [ ] **D3.** (Opcional aquí o luego) RPCs transaccionales para escrituras críticas (venta) con `UPDATE ... WHERE cantidad >= n`, grants por permiso. Esto también resuelve la race condition de stock.
- [ ] **D4.** Mantener las policies permisivas viejas activas en paralelo hasta validar (no romper el flujo con PIN/anon todavía).

**Salida de fase:** existen las reglas reales de seguridad, conviviendo con las viejas, listas para validarse.

## FASE E — Pruebas en staging

- [ ] **E1.** Replicar A1–D en **staging**: usuarios, hook, migraciones (`db push` al ref de staging), seed de permisos.
- [ ] **E2.** Env vars de Vercel **Preview** o config local apuntando a staging con `AUTH_MODE='supabase'`.
- [ ] **E3.** Tests Playwright de auth (nuevos, en `e2e/`): 
  - admin loguea y PUEDE vender / cerrar caja / crear apartado;
  - supervisor loguea y NO puede registrar/editar/borrar, pero SÍ ve montos;
  - sin sesión → redirige a `/login`.
- [ ] **E4.** Tests de RLS: que un token de supervisor no pueda INSERT/UPDATE/DELETE donde no debe (verificación por REST con el token).
- [ ] **E5.** Correr toda la suite E2E existente contra staging con `AUTH_MODE='supabase'` y que pase.

**Salida de fase:** evidencia de que el sistema nuevo funciona y restringe bien, sin haber tocado prod.

## FASE F — Switch en producción (una noche, fuera de horario)

- [ ] **F1.** Backup de prod antes de nada (`supabase db dump`).
- [ ] **F2.** Crear usuarios reales en **Auth de prod** (admin = dueño, supervisor = jefe).
- [ ] **F3.** Configurar Auth Hook en prod + aplicar migraciones de A/D a prod (`db push` a prod, **revisión humana**, fuera de horario).
- [ ] **F4.** Activar `AUTH_MODE='supabase'` en Vercel Production (deploy nocturno). Avisar a la tienda: "hoy inician sesión con su usuario nuevo".
- [ ] **F5.** Dejar el **PIN como respaldo 1 semana** (no borrar nada legacy aún). 
- [ ] **F6.** Monitorear (logins, errores). **Rollback** = revertir el deploy en Vercel (vuelve el PIN al instante).

**Salida de fase:** la tienda usa login real; la base impone la seguridad.

## FASE G — Limpieza (contract, ~1 semana después, ya estable)

- [ ] **G1.** Quitar las policies permisivas viejas (`true/true`) que quedaron en paralelo.
- [ ] **G2.** Eliminar el PIN / `ProfileContext` legacy / `/api/verify-pin` / `ADMIN_PIN`.
- [ ] **G3.** Revisar las API routes con service role (`/api/eliminar-venta`, `/api/editar-movimiento`): que validen el rol del solicitante o migrar a RPCs con permiso.
- [ ] **G4.** Quitar el feature flag `AUTH_MODE` (ya solo existe el modo real).
- [ ] **G5.** Actualizar `CLAUDE.md` (mover lo de auth de "objetivo" a "estado actual") y este documento.

**Salida de fase:** ya no queda nada del login falso; el sistema queda solo con auth real.

---

## Cómo se prueba cada paso (recordatorio)

- DB / `authorize()` / hook → SQL directo en local (`docker exec ... psql`) y luego staging (pooler).
- Login y capacidades → Playwright contra el laboratorio local con `AUTH_MODE='supabase'`.
- RLS → peticiones REST con el token de cada rol, verificando que se permita/rechace.
- Restaurar laboratorio entre corridas → `npx supabase db reset` (ya integrado en `e2e/global-setup.ts`).

## Preguntas abiertas / decisiones a confirmar antes de ejecutar

- [ ] ¿Correos reales para los usuarios admin/supervisor, o usuarios sin email verificado (solo contraseña)?
- [ ] ¿Recuperación de contraseña por correo (magic link / reset) o el admin la gestiona manualmente?
- [ ] Nombre final del feature flag y su default (propuesto: `NEXT_PUBLIC_AUTH_MODE='pin'`).
- [ ] ¿La race condition de stock (RPC de venta, D3) se hace dentro de esta migración o como ítem aparte de la Fase 2?

## Referencias

- `CLAUDE.md` — Parte B (reglas duras de auth/seguridad, RBAC, modelo de roles).
- `docs/deep-research-pos-maduracion.md` — §auth real y §RLS (el porqué y la técnica de cero downtime).
- `docs/guia-entornos-y-docker.md` — flujo local → staging → prod.
- `docs/guia-tests-playwright.md` — cómo correr y escribir los tests.
- Supabase: Custom Claims & RBAC, Auth Hooks, `@supabase/ssr` + Next.js (links en la deep research).
