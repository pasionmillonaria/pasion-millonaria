# Deep Research: Maduración de un POS construido con vibecoding
### Stack: Next.js 14 (App Router) + TypeScript + Tailwind + Supabase + Vercel — 100% free tier
*Fecha: junio 2026*

---

## 1. Arquitectura y Entornos (Dev / Staging / Prod)

### 1.1 Topología recomendada en free tier

El free tier de Supabase permite **2 proyectos activos por organización**, y puedes crear más de una organización gratuita. La topología estándar sin pagar nada:

| Entorno | Supabase | Vercel | Rama Git |
|---|---|---|---|
| **Dev (local)** | Supabase CLI + Docker (`supabase start`) — Postgres local completo, gratis e ilimitado | `next dev` | feature branches |
| **Staging** | Proyecto Supabase #2 (`mi-pos-staging`) | Preview deployments (automáticos en cada PR) + dominio fijo para la rama `develop` | `develop` |
| **Prod** | Proyecto Supabase #1 (`mi-pos-prod`) | Production deployment | `main` |

Claves:

- **Nunca desarrolles contra producción.** El desarrollo diario ocurre contra el stack local del CLI (`supabase start` levanta Postgres, Auth, Storage y Studio en Docker). Doc: [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments) y la guía oficial [The Vibe Coder's Guide to Supabase Environments](https://supabase.com/blog/the-vibe-coders-guide-to-supabase-environments).
- En Vercel, configura las variables de entorno **por scope**: `Production` apunta a `mi-pos-prod`, `Preview` apunta a `mi-pos-staging`. Así cada PR se prueba contra staging automáticamente sin tocar datos reales. Vercel Hobby incluye preview deployments ilimitados ([docs de planes](https://vercel.com/docs/plans/hobby)).
- **Ojo crítico**: los proyectos free de Supabase **se pausan tras 1 semana de inactividad**. Para staging, crea un GitHub Action con cron que haga un `select 1` cada 3–4 días (o usa el endpoint REST con un ping). Para prod, el tráfico real lo mantiene vivo, pero vigílalo.
- El **branching nativo** de Supabase (un branch de BD por PR) es de plan Pro — no lo necesitas; el patrón de 2 proyectos + CLI lo sustituye gratis.

### 1.2 Migraciones de base de datos sin perder datos

Flujo con Supabase CLI (todo gratis):

```bash
# 1. Inicializa migraciones en el repo
supabase init
supabase link --project-ref <ref-staging>

# 2. Trae el esquema actual de prod UNA VEZ (baseline)
supabase db pull          # genera supabase/migrations/<ts>_remote_schema.sql

# 3. Cada cambio futuro: edítalo localmente y genera el diff
supabase db diff -f agregar_tabla_apartados

# 4. Pruébalo desde cero localmente
supabase db reset         # aplica TODAS las migraciones + seed.sql

# 5. CI/CD lo aplica a staging y luego a prod
supabase db push
```

**Reglas para no perder datos:**

1. **Las migraciones son append-only**: nunca edites una migración ya aplicada; crea una nueva.
2. **Patrón expand → migrate → contract** para cambios destructivos: primero agregas la columna/tabla nueva (expand), despliegas código que escribe en ambas, migras datos con un `UPDATE`, y solo en una migración posterior eliminas lo viejo (contract). Nunca `DROP COLUMN` en el mismo deploy que el código que deja de usarla.
3. **CI/CD con GitHub Actions** (gratis para repos privados hasta 2000 min/mes): push a `develop` → `supabase db push` contra staging; merge a `main` → push contra prod. Guarda `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` y `SUPABASE_PROJECT_ID` como secrets. Ejemplo oficial: [Deployment & Branching](https://supabase.com/docs/guides/deployment) y este tutorial práctico: [Managing migrations across environments](https://dev.to/parth24072001/supabase-managing-database-migrations-across-multiple-environments-local-staging-production-4emg).
4. **Backup antes de cada migración a prod** (ver §7).
5. Genera tipos TypeScript desde el esquema: `supabase gen types typescript --linked > src/types/database.ts`, y hazlo parte del CI para que el frontend nunca quede desincronizado del esquema.

### 1.3 Estrategia de Git

Para un equipo de 1–3 personas: **Trunk-Based Development con una rama de release ligera**, no Git Flow (Git Flow agrega burocracia diseñada para releases versionados largos):

- `main` = producción, siempre deployable, protegida (require PR + CI verde).
- `develop` = staging (opcional; con un solo dev puedes hacer trunk puro: feature branch → PR → preview en staging → merge a `main`).
- Feature branches cortas (< 2 días de vida). Si una feature es grande, usa **feature flags** simples (una tabla `feature_flags` o variables de entorno) en lugar de ramas largas.
- Commits convencionales (`feat:`, `fix:`, `db:`) — facilitan que la IA y tú entiendan el historial.

Referencia: [trunkbaseddevelopment.com](https://trunkbaseddevelopment.com/).

---

## 2. Seguridad y Control de Acceso (RBAC)

### 2.1 Migrar de "fake auth" a Supabase Auth

El PIN en variable de entorno + estado en cliente es bypasseable con DevTools en segundos. Plan de migración:

**Paso 1 — Instalar el patrón SSR oficial.** Usa `@supabase/ssr` (no el viejo auth-helpers). Tres clientes: browser client, server client (Server Components/Actions) y el cliente del middleware. Guía oficial: [Build a User Management App with Next.js](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs).

**Paso 2 — Tabla de roles + Custom Access Token Hook.** El patrón oficial de Supabase ([Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)):

```sql
create type public.app_role as enum ('admin', 'empleado');

create table public.user_roles (
  user_id uuid references auth.users on delete cascade primary key,
  role app_role not null default 'empleado'
);

-- Hook: inyecta el rol en el JWT al emitirse
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare claims jsonb; user_role public.app_role;
begin
  select role into user_role from public.user_roles
   where user_id = (event->>'user_id')::uuid;
  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role::text,'empleado')));
  return jsonb_set(event, '{claims}', claims);
end; $$;
```

Actívalo en Dashboard → Auth → Hooks. Importante: los JWT no se invalidan al cambiar el rol; el cambio aplica al refrescarse el token (~1 h por defecto). Para revocación inmediata, además del claim consulta `user_roles` en operaciones sensibles.

**Permisos granulares (parte del diseño base):** además de los roles, implementa desde el inicio el enum `app_permission` ('pos.sell', 'caja.register', 'inventory.manage', 'money.view'...) y la tabla `role_permissions` (rol ↔ permiso). Las policies RLS validan con una función `authorize('inventory.manage')` en vez de comparar roles directamente, y la UI se condiciona por capacidades (`can.sell`, `can.viewMoney`...) derivadas del rol en un solo helper. El beneficio: un rol futuro —ej. "cajero" que registra ventas de caja pero solo lee lo demás— se agrega insertando filas en `role_permissions`, sin reescribir ni una policy ni una pantalla.

**Paso 3 — Defensa en capas (en orden de importancia real):**

1. **RLS en Postgres** — la única capa que protege de verdad los *datos* (aplica incluso si alguien llama la API REST de Supabase directamente).
2. **Verificación en Server Actions / Route Handlers** — usa siempre `supabase.auth.getUser()` (valida el JWT contra el servidor), **nunca** `getSession()` en servidor (lee la cookie sin validar).
3. **Middleware de Next.js** — solo para UX (redirigir a /login, refrescar tokens). No es frontera de seguridad: ha habido CVEs de bypass de middleware (CVE-2025-29927). Trátalo como conveniencia.

```ts
// middleware.ts — refresco de sesión + gate de rutas por rol (UX)
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  // ...crear cliente con cookies (patrón oficial @supabase/ssr)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !req.nextUrl.pathname.startsWith('/login'))
    return NextResponse.redirect(new URL('/login', req.url))
  const role = user?.app_metadata?.user_role
  if (req.nextUrl.pathname.startsWith('/admin') && role !== 'admin')
    return NextResponse.redirect(new URL('/', req.url))
  return res
}
```

**Paso 4 — Si extrañas el PIN:** mantén login con email/password de Supabase por usuario y agrega un "PIN de operación rápida" como dato local de cada empleado para cambiar de operador entre ventas — pero la *sesión* siempre es de Supabase Auth.

### 2.2 Diseño de políticas RLS

```sql
alter table public.ventas enable row level security;
alter table public.movimientos_inventario enable row level security;

-- Helper centralizado (evita repetir lógica en 20 policies)
create or replace function public.es_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt()->>'user_role') = 'admin', false)
$$;

-- Empleados: pueden registrar ventas y leerlas, no borrarlas ni editarlas
create policy "ventas_select" on ventas for select to authenticated using (true);
create policy "ventas_insert" on ventas for insert to authenticated
  with check (auth.uid() = empleado_id);
create policy "ventas_update_admin" on ventas for update to authenticated
  using (public.es_admin());
create policy "ventas_delete_nadie" on ventas for delete to authenticated
  using (false);  -- las ventas no se borran: se anulan (ver §8)
```

Reglas de oro de RLS:

- **Default deny**: habilitar RLS sin policy = nadie accede. Crea policies explícitas por operación (`select`/`insert`/`update`/`delete`), no una sola `for all`.
- Envuelve `auth.uid()` y `auth.jwt()` en `(select ...)` en tablas grandes para que Postgres lo evalúe una vez por query (rendimiento).
- El `service_role` key **salta RLS**: solo debe vivir en el servidor (jamás `NEXT_PUBLIC_`). Audita que ninguna esté expuesta al cliente.
- Revoca permisos de tablas internas al rol `anon` por completo si tu POS no tiene parte pública.
- **Testea las policies** (ver §4): un test que intenta leer ventas como `anon` y espera 0 filas vale oro.

Más patrones: [discusión oficial de RBAC](https://github.com/orgs/supabase/discussions/346) y [guía RBAC de Permit.io para Next.js+Supabase](https://www.permit.io/blog/supabase-authentication-and-authorization-in-nextjs-implementation-guide).

---

## 3. Base de Datos y Lógica de Negocio

### 3.1 ¿Trigger de stock: buena o mala práctica?

Tu diseño actual (tabla `movimientos` + trigger que recalcula stock) es **conceptualmente correcto y es el patrón estándar de la industria**: es un *ledger* de inventario con un agregado cacheado. De hecho es un event sourcing ligero sin saberlo. No lo muevas a Next.js.

**Pros del trigger en Postgres:**

- Atomicidad garantizada: el movimiento y el stock cambian en la misma transacción, imposible desincronizarse.
- Cualquier vía de escritura (app, agente de Telegram, SQL manual, futura app móvil) mantiene la invariante.
- Lógica junto a los datos = sin latencia de red extra.

**Contras / riesgos a mitigar:**

- Lógica "invisible" para quien lee solo el código TypeScript → documenta cada trigger en el repo (las migraciones SON el código; agrega comentarios `comment on function`).
- Difícil de debuggear si crece → mantén triggers *pequeños* (solo invariantes: stock, totales); la lógica de negocio orquestadora (validar venta, aplicar descuento) va en **funciones Postgres (RPC)** llamadas explícitamente, o en Server Actions.
- Testing → con Supabase local + pgTAP o tests de integración con Vitest contra el Postgres del CLI.

**Lo que NO debes hacer:** mover el cálculo de stock a Next.js (leer stock → calcular → escribir). Eso introduce race conditions que el trigger te evita gratis. Edge/serverless con múltiples instancias concurrentes hace esto aún peor.

**¿Event Sourcing / CQRS completos?** Sobredimensionado para una tienda. Quédate con la versión ligera que ya tienes, pero formalízala:

1. `movimientos_inventario` es **append-only** (sin UPDATE/DELETE; las correcciones son contramovimientos).
2. `stock` actual es un **valor derivado** — debe poder reconstruirse: `select producto_id, sum(cantidad) from movimientos group by 1`. Crea un job/función `reconciliar_stock()` que compare derivado vs cacheado y alerte diferencias (córrelo semanal con [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron), incluido gratis).

### 3.2 Concurrencia: dos empleados venden la última prenda a la vez

Tres mecanismos complementarios, todos dentro de Postgres:

**a) Constraint como red de seguridad final (ponla YA):**

```sql
alter table public.stock add constraint stock_no_negativo check (cantidad >= 0);
```

Con esto es *matemáticamente imposible* vender lo que no existe: la segunda transacción falla y la manejas en UI ("Producto agotado").

**b) La venta completa como UNA función transaccional (RPC):**

```sql
create or replace function public.registrar_venta(items jsonb, ...)
returns uuid language plpgsql security definer as $$
declare ...
begin
  -- Todo esto es atómico: o entra completo o no entra nada
  insert into ventas ... returning id into v_venta_id;
  for item in select * from jsonb_array_elements(items) loop
    -- UPDATE condicional: bloquea la fila y verifica stock en un solo paso
    update stock set cantidad = cantidad - (item->>'cantidad')::int
     where producto_id = (item->>'producto_id')::uuid
       and cantidad >= (item->>'cantidad')::int;
    if not found then
      raise exception 'STOCK_INSUFICIENTE:%', item->>'producto_id';
    end if;
    insert into movimientos_inventario (...) values (...);
  end loop;
  return v_venta_id;
end; $$;
```

Desde Next.js: `supabase.rpc('registrar_venta', { items })`. El `UPDATE ... WHERE cantidad >= n` toma un row lock: si dos cajas compiten, una espera a la otra y la segunda ve el stock ya descontado. Es el patrón clásico, más simple y robusto que `SELECT ... FOR UPDATE` separado, y no necesitas subir el nivel de aislamiento (READ COMMITTED basta con locks de fila).

**c) Idempotencia:** pasa un `client_sale_id` (UUID generado en el cliente) con constraint `unique`. Si la red falla y el cliente reintenta, no duplicas la venta. Esencial también para el modo offline (§4.3).

**d) Bloqueo optimista para el catálogo:** la venta usa bloqueo pesimista implícito (el `UPDATE` condicional), pero para ediciones de baja contención —precios, descripciones, datos de producto— usa el patrón optimista: columna `version int` que se incrementa en cada update, y el `UPDATE ... WHERE id = X AND version = N`. Si `not found`, otro usuario editó en paralelo y la UI pide recargar. Evita locks innecesarios fuera del hot path de la caja.

**¿Por qué la transacción vive en Postgres y no en Next.js?** Porque `supabase-js` no soporta transacciones multi-sentencia: orquestar `BEGIN → SELECT FOR UPDATE → INSERT → COMMIT` desde el servidor de Next.js exige una conexión Postgres directa (pg/Drizzle) vía pooler, lo que en serverless agrega gestión de conexiones, riesgo de agotar el pool del free tier y locks colgados si la función muere a mitad de transacción. La RPC obtiene la misma garantía ACID en una sola llamada, sin infraestructura extra.

---

## 4. Frontend, Testing y Fiabilidad

### 4.1 Suite de pruebas (todo gratis y open source)

Pirámide pragmática para un POS:

| Capa | Herramienta | Qué cubrir |
|---|---|---|
| E2E (lo más valioso aquí) | **Playwright** | Flujos críticos: login, venta completa con pago mixto, venta con stock insuficiente, cierre de caja, crear/cancelar apartado |
| Integración BD | **Vitest** + Supabase local | RPCs (`registrar_venta` concurrente con `Promise.all`), policies RLS (cliente anon no lee ventas), triggers |
| Unidad | **Vitest** + Testing Library | Cálculos de totales/descuentos/IVA, validadores zod, máquina de estados de apartados |

¿Por qué Playwright sobre Cypress? Más rápido, paralelismo gratis, mejor soporte multi-pestaña/contexts (útil para simular dos cajeros a la vez), y sin límites comerciales en CI. Corre en GitHub Actions gratis.

Orden de implementación (no intentes 100% cobertura):

1. Semana 1: 3–5 tests E2E de Playwright del flujo de venta. Es tu seguro contra "la IA me rompió producción".
2. Semana 2: tests de integración de `registrar_venta` y RLS contra `supabase start` local.
3. Continuo: cada bug que llegue a prod gana un test que lo reproduce antes de arreglarlo.
4. CI: PR no se mergea sin tests verdes (branch protection en GitHub).

### 4.2 UI/UX estandarizado

- **shadcn/ui** (sobre Radix + Tailwind): es el match exacto de tu stack. No es dependencia: copia el código a tu repo (control total, cero lock-in). Usa `Dialog`, `Command` (búsqueda de productos estilo cmd-k para la caja), `DataTable` (con TanStack Table), `Sonner` (toasts de confirmación de venta).
- **react-hook-form + zod**: un solo esquema zod valida en el cliente Y en la Server Action (nunca confíes solo en validación de cliente).
- **TanStack Query**: cache, reintentos, invalidación y estados de red declarativos. Reemplaza cualquier `useEffect + fetch` que haya generado el vibecoding.
- Para un POS: prioriza **densidad de información, targets táctiles grandes y atajos de teclado** sobre estética. La cajera no debe necesitar mouse para una venta.

**Rediseño visual con herramientas generativas (v0):** para renovar la capa visual sin rediseñar a mano, usa [v0](https://v0.dev) — genera directamente Next.js + Tailwind + shadcn/ui, es decir, código integrable tal cual a este stack (Stitch y Figma requieren traducción posterior). Reglas del proceso: (1) un prompt maestro con el sistema de diseño y restricciones del dominio + un prompt por pantalla (ver `prompt-rediseno-ui.md`); (2) v0 solo produce componentes *presentacionales* con mock data — la conexión a datos reales la hace tu agente de código con la instrucción "comportamiento idéntico, solo capa visual"; (3) **los tests E2E de Playwright van ANTES del rediseño** — son la red de seguridad de la migración visual; (4) primitivas primero (Button/Badge/Modal → shadcn), luego una pantalla por PR, empezando por Caja (la más usada).

### 4.3 Offline / red intermitente

Más robusto que localStorage, en orden creciente de esfuerzo:

1. **Nivel 1 (hazlo ya):** TanStack Query con `networkMode: 'offlineFirst'` (resuelve consultas desde la caché cuando no hay red y pausa mutaciones hasta que vuelva), `retry` + detección `onLine` + UI explícita de "sin conexión". Las ventas usan idempotency key (§3.2c) para reintentos seguros.
2. **Nivel 2 (recomendado):** **Dexie.js** (IndexedDB) como cola de mutaciones offline: cada venta se escribe primero a una tabla local `sync_queue` y un worker la sube cuando vuelve la red, deduplicada por `client_sale_id`. IndexedDB sobrevive cierres del navegador y soporta órdenes de magnitud más datos que localStorage. Tutoriales: [Dexie.js](https://dexie.org/), [Offline-first PWA con Next.js + IndexedDB](https://www.wellally.tech/blog/build-offline-first-pwa-nextjs-indexeddb), [patrones PWA + Background Sync](https://rohitraj.tech/de/notes/pwa-offline-sync).
3. **Nivel 3 (solo si el offline es frecuente):** PWA completa con service worker ([Serwist](https://serwist.pages.dev/) para Next.js) + catálogo de productos cacheado localmente para poder *cobrar* sin red.

**Advertencia de dominio:** vender offline implica que el stock visible puede estar desactualizado → acepta sobreventa eventual y reconcíliala (es lo que hace Square/Shopify POS), o limita el modo offline a consulta + venta de ítems con stock alto. Decisión de negocio, no técnica.

---

## 5. Agente de IA en Telegram (roadmap)

### 5.1 Arquitectura recomendada (100% free tier)

```
Telegram → webhook → Vercel Function (grammY) → LLM con tool-calling → RPCs Supabase (read-only) → respuesta
```

- **Bot framework:** [grammY](https://grammy.dev/) (TypeScript, diseñado para serverless). Configura el bot por **webhook** apuntando a una Route Handler de Next.js (`/api/telegram`) — así no pagas un servidor 24/7; Telegram te llama solo cuando hay mensajes. Cabe de sobra en el límite Hobby de Vercel (1M invocaciones/mes).
- **LLM gratis:** [Google AI Studio (Gemini)](https://aistudio.google.com/) o [Groq](https://groq.com/) (Llama 3.x, latencia bajísima) — ambos con free tier de API generoso en 2026; lista mantenida: [free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources).
- **Orquestación:** para 5–10 herramientas no necesitas LangChain; el **Vercel AI SDK** (`generateText` con `tools`) en el mismo proyecto Next.js es más simple y comparte tus tipos. LangChain/LangGraph (Node o Python) solo si luego quieres grafos multi-paso complejos.

### 5.2 El patrón correcto: tools, no text-to-SQL ni RAG

Tu caso es **datos estructurados** → el patrón ganador es **function/tool calling sobre consultas predefinidas**, no RAG (RAG es para documentos no estructurados) ni text-to-SQL libre (riesgo de inyección y de queries destructivas alucinadas):

```ts
const tools = {
  consultar_stock: tool({
    description: 'Stock actual de un producto por nombre, talla o SKU',
    parameters: z.object({ busqueda: z.string() }),
    execute: ({ busqueda }) => supabaseRO.rpc('buscar_stock', { q: busqueda }),
  }),
  ventas_resumen: tool({ /* rango de fechas → total, #tickets, top productos */ }),
  apartados_pendientes: tool({ /* por cliente o por vencer */ }),
}
```

Seguridad imprescindible:

1. **Allowlist de `chat_id`** de Telegram (tabla en Supabase: chat_id ↔ usuario ↔ rol). Cualquier otro chat recibe "no autorizado". Telegram no es tu auth.
2. El agente usa un cliente con **rol Postgres de solo lectura** (crea un rol `agente_readonly` con `GRANT SELECT` solo a vistas/RPCs específicas), nunca el `service_role`.
3. Valida el `secret_token` del webhook de Telegram en cada request.
4. Fase 2 (escritura: "aparta esta prenda") solo con confirmación explícita de dos pasos en el chat y registrando el agente como actor en la auditoría (§7).
5. Si más adelante quieres "preguntas libres" sobre históricos, ahí sí evalúa text-to-SQL con un esquema acotado a vistas read-only, o embeddings con `pgvector` (incluido en Supabase free) para buscar en descripciones de productos.

### 5.3 Alertas proactivas (el agente que te habla primero)

Además del flujo reactivo (preguntar → responder), agrega notificaciones automáticas con **Database Webhooks de Supabase** (extensión `pg_net`, incluida gratis): un trigger en Postgres detecta el evento — stock de un producto bajo el umbral de reorden, descuadre de caja mayor a X, apartado vencido — y hace una petición HTTP asíncrona a un Route Handler de Next.js, que valida la firma (`X-Supabase-Event-Signature`) y manda el mensaje por la API del bot de Telegram. Cero polling, cero servidor extra, y cierra el ciclo de gestión: el sistema avisa antes de que alguien pregunte.

---

## 6. AI-Assisted Coding seguro (vibecoding maduro)

### 6.1 Infraestructura de contexto

- **`CLAUDE.md` / `.cursor/rules` en la raíz del repo**: describe stack, convenciones, comandos (`pnpm test`, `supabase db reset`), arquitectura (qué vive en triggers vs RPCs vs Server Actions), y prohibiciones explícitas ("nunca editar migraciones aplicadas", "nunca usar service_role en código cliente", "todo dinero es `numeric`, jamás `float`").
- Mantén `database.ts` (tipos generados) actualizado: es la fuente de verdad que evita que la IA alucine columnas.
- Documenta los triggers y RPCs en un `docs/db-logic.md` — es la parte que la IA no "ve" leyendo TypeScript.
- Crea un directorio **`/docs/context`** con archivos Markdown referenciables: el ERD actual, las reglas de negocio de caja (pagos mixtos, arqueo), y el modelo de roles/permisos. En Cursor, ancla cada petición a ese contexto: `@docs/context/database_schema.md @docs/context/rbac_rules.md Refactoriza el componente de inventario...`. La referenciación explícita reduce drásticamente dependencias inventadas.
- Regla automática de seguridad: **toda migración generada por IA que cree una tabla debe incluir `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` y sus policies** en el mismo archivo. Ponlo como prohibición explícita en `CLAUDE.md`/`.cursor/rules`; una tabla sin RLS es una fuga de datos silenciosa.
- Prohíbe también el paquete obsoleto `@supabase/auth-helpers-nextjs` (solo `@supabase/ssr` con `getAll`/`setAll` de cookies) — es la regresión más común que generan los LLMs por datos de entrenamiento viejos.

### 6.2 Reglas de oro del vibecoding seguro

1. **Plan antes que código**: pide primero "explícame qué archivos tocarías y por qué; no escribas código aún". Revisa el plan, luego autoriza.
2. **Diffs pequeños, commits frecuentes**: una tarea = un cambio acotado = un commit. Si la IA propone tocar 14 archivos para un fix, sospecha.
3. **Tests como contrato**: con la suite del §4, la instrucción estándar es "haz X sin romper los tests; córrelos al final". El test E2E de la venta es tu detector de alucinaciones.
4. **La IA no toca migraciones ni policies RLS sin revisión humana línea por línea.** Son los dos lugares donde un error es catastrófico y silencioso.
5. **Pide que cite**: "antes de usar una API de Supabase, muéstrame la firma del tipo en database.ts / la doc". Reduce APIs inventadas.
6. **Refactor ≠ rewrite**: instruye "comportamiento idéntico, solo estructura" y verifica con tests. Nunca aceptes "aproveché para mejorar también...".
7. **Sesiones frescas por tarea**: contexto largo degrada precisión; mejor 5 tareas en 5 conversaciones que 5 tareas en una.
8. **Tú eres el integrador**: lee cada diff antes de aceptar. Si no entiendes una línea, pregúntale a la IA qué hace — entenderla es el verdadero requisito para "poder modificar sin romper producción".

---

## 7. Puntos ciegos típicos de un POS junior/IA

Ordenados por riesgo real para tu negocio:

1. **Backups.** El free tier de Supabase **no incluye backups automáticos**. Monta hoy mismo un GitHub Action con cron diario (ej. 2:00 AM) que haga `pg_dump` (via `supabase db dump`: esquema + datos) y lo suba a un bucket gratuito de **Cloudflare R2** (10 GB gratis, compatible S3) con lifecycle rules que borren backups de más de 14 días. **Gotcha crítico:** la cadena de conexión debe apuntar al **Session Pooler** de Supabase (puerto 5432 del pooler, IPv4); la conexión directa usa IPv6 y falla con errores de red en los runners de GitHub Actions. Prueba la restauración una vez — un backup no probado no existe.
2. **Pausa por inactividad** (free tier, 1 semana): un lunes festivo largo puede dejarte la BD pausada el martes en la mañana. Ping con cron (§1.1).
3. **Monitoreo de errores:** [Sentry](https://sentry.io/) free tier (5K errores/mes) con la integración de Next.js: te enteras de los errores antes que la cajera. Agrega también logs de Vercel + alertas.
4. **Auditoría:** tabla `audit_log` (quién, qué, cuándo, valores antes/después) poblada por un **trigger genérico** adjuntado a cada tabla sensible: guarda `OLD` y `NEW` completos como `jsonb`, la tabla afectada, la operación y `auth.uid()`. El formato JSONB permite auditar cualquier tabla sin cambiar el esquema de auditoría cuando evolucionen las tablas origen. En retail, el riesgo #1 es interno: precios modificados, ventas borradas, ajustes de stock que ocultan mermas.
5. **Dinero como `numeric(12,2)`, nunca `float`** — audita el esquema ya. Y todas las fechas `timestamptz`, con la zona horaria de la tienda manejada en presentación.
6. **Anulación, no borrado:** ventas y movimientos nunca se eliminan; se emite una venta de anulación/devolución que genera contramovimientos. Sin esto, los reportes históricos mienten y la auditoría es imposible.
7. **Folio/consecutivo de tickets** legible (no UUID) con secuencia de Postgres, por requerimientos fiscales y para que el cliente pueda reclamar "el ticket 1042".
8. **Validación servidor:** todo input validado con zod en la Server Action aunque el formulario ya valide. La IA suele generar solo validación de cliente.
9. **Rate limiting** en endpoints sensibles (login, webhook de Telegram) — [Upstash Redis](https://upstash.com/) tiene free tier, o usa contadores en Postgres.
10. **Datos de prueba en prod:** asegúrate de que el seed/productos de prueba del vibecoding no vivan en producción.
11. **Plan de contingencia analógico:** ¿qué hace la tienda si Vercel o Supabase se caen 2 horas? Una hoja de ventas en papel + procedimiento de captura posterior es parte del sistema.

---

## 8. Teoría y modelado profesional de POS/Inventarios

### 8.1 Cómo opera un POS profesional: los flujos estándar

Un POS maduro se organiza alrededor de cuatro ciclos: **(1) ciclo de venta** (carrito → cobro → emisión de ticket → afectación de inventario y caja, todo atómico), **(2) ciclo de caja** (sesión: apertura con fondo → transacciones → arqueo → cierre con cuadre), **(3) ciclo de inventario** (compra/recepción → existencia → venta/merma/ajuste, todo como movimientos trazables) y **(4) ciclo de pedido/apartado** (reserva de stock con máquina de estados). La regla transversal: **nada se sobrescribe; todo es un evento inmutable** y los "saldos" (stock, caja) son derivados.

### 8.2 Caja: partida doble, cierres, descuadres y pagos mixtos

**¿Partida doble completa?** No necesitas un libro contable de débitos/créditos formal, pero sí su *principio*: cada movimiento de dinero tiene origen y destino, y los saldos se derivan de movimientos, nunca se editan. La versión pragmática:

```sql
create table sesiones_caja (
  id uuid primary key default gen_random_uuid(),
  abierta_por uuid references auth.users not null,
  fondo_inicial numeric(12,2) not null,
  abierta_en timestamptz not null default now(),
  cerrada_en timestamptz,
  efectivo_contado numeric(12,2),   -- lo que contó el cajero (arqueo ciego)
  efectivo_esperado numeric(12,2),  -- calculado por el sistema
  descuadre numeric(12,2) generated always as
    (efectivo_contado - efectivo_esperado) stored
);

create table movimientos_caja (    -- el "ledger" de caja, append-only
  id bigint generated always as identity primary key,
  sesion_id uuid references sesiones_caja not null,
  tipo text not null check (tipo in
    ('venta','devolucion','retiro','deposito','gasto','fondo')),
  metodo text not null check (metodo in ('efectivo','transferencia','tarjeta')),
  monto numeric(12,2) not null,
  venta_id uuid references ventas,
  creado_en timestamptz not null default now()
);
```

Prácticas estándar:

- **Arqueo ciego:** el cajero cuenta el efectivo SIN ver el monto esperado; el sistema calcula el descuadre. Si ve el esperado primero, el descuadre siempre "cuadra".
- **Descuadres se registran, no se corrigen:** el sobrante/faltante queda en la sesión como dato (es la métrica que detecta problemas de proceso o robo hormiga). Tu reporte mensual de descuadres por cajero es de los más valiosos del sistema.
- **Pagos mixtos:** la venta NO tiene columna `metodo_pago`. Tiene una tabla hija `pagos_venta` (venta_id, metodo, monto) con constraint de que `sum(monto) = total`. Una venta de $500 con $300 efectivo + $200 transferencia = dos filas. Esto además hace trivial el cierre por método ("efectivo esperado" solo suma `metodo='efectivo'`).
- El cierre de caja solo concilia **efectivo**; transferencias/tarjeta se concilian contra el banco (otro reporte).

Lectura clásica: Martin Fowler, [Accounting Patterns](https://martinfowler.com/eaaDev/AccountingNarrative.html) y *Patterns of Enterprise Application Architecture*.

### 8.3 Inventario: trazabilidad y costeo (FIFO / promedio ponderado)

El error junior es tener solo `stock.cantidad`. El modelo profesional: **el inventario ES la tabla de movimientos**; stock es una suma. Para no bloquear el costeo futuro, agrega *hoy* estas columnas a `movimientos_inventario` (costo casi nada y desbloquea todo):

```sql
-- movimientos_inventario (ya la tienes; complétala)
tipo text check (tipo in ('compra','venta','devolucion_cliente',
       'devolucion_proveedor','ajuste','merma','traslado','apartado','liberacion')),
cantidad int not null,              -- positiva entra, negativa sale
costo_unitario numeric(12,4),       -- en COMPRAS: lo que costó. CLAVE para costeo
precio_unitario numeric(12,2),      -- en VENTAS: a cuánto se vendió
referencia_id uuid,                 -- venta, compra o ajuste que lo originó
creado_por uuid not null
```

- **Promedio ponderado** (recomendado para ropa): costo promedio = se recalcula con cada compra. Implementable después como vista/función sobre los movimientos *si guardaste `costo_unitario`*. Es el método de Odoo por defecto y el más simple de auditar.
- **FIFO**: requiere "capas" de costo (cada compra es una capa que se consume en orden). Solo lo necesitarías por requerimiento fiscal o productos perecederos — en ropa casi nunca. Con el ledger completo puedes reconstruir FIFO retroactivamente.
- Con `costo_unitario` en compras + `precio_unitario` en ventas obtienes **margen bruto real por producto**, la métrica que decide qué reordenar.
- **Apartados afectan stock disponible, no stock físico**: maneja dos números — `stock_fisico` (lo que hay en tienda) y `stock_disponible = físico − apartado`. La venta normal valida contra disponible.

### 8.4 Ciclo de vida de apartados/pedidos: máquina de estados

Define estados y transiciones válidas explícitamente, y **haz que la BD las imponga** (no solo el frontend):

```
borrador → apartado → (abono)* → pagado → entregado
              ↓                      ↓
          vencido → liberado     cancelado → (reembolso) → liberado
```

```sql
create table transiciones_apartado (
  desde text not null, hacia text not null, primary key (desde, hacia)
);
insert into transiciones_apartado values
 ('borrador','apartado'),('apartado','pagado'),('apartado','vencido'),
 ('apartado','cancelado'),('vencido','liberado'),('pagado','entregado'),
 ('pagado','cancelado'),('cancelado','liberado');

create or replace function validar_transicion_apartado() returns trigger
language plpgsql as $$
begin
  if old.estado is distinct from new.estado and not exists (
    select 1 from transiciones_apartado
     where desde = old.estado and hacia = new.estado)
  then raise exception 'TRANSICION_INVALIDA: % -> %', old.estado, new.estado;
  end if;
  return new;
end; $$;
```

Reglas anti-"estados fantasma":

- Cada transición es un UPDATE de estado **+ sus efectos en la misma transacción** (apartar = cambiar estado + movimiento `apartado` que reserva stock; liberar = estado + movimiento `liberacion`). Una RPC por transición (`apartar()`, `cancelar_apartado()`...), nunca UPDATEs sueltos desde el cliente.
- Tabla `historial_estados_apartado` (apartado_id, de, a, quién, cuándo, motivo) poblada por trigger.
- Vencimientos con **pg_cron**: job diario que transiciona `apartado → vencido` los que pasaron su fecha límite y libera el stock. Así ningún apartado queda "colgado" reteniendo inventario.
- En el frontend puedes espejar la máquina con [XState](https://stately.ai/docs/xstate) o un simple mapa de transiciones en TS, pero la autoridad es la BD.

### 8.5 Diseño de reportes orientado a decisiones

Regla fundamental: **las métricas de ventas se calculan desde `movimientos` (el ledger); la caja solo reporta flujo de efectivo y cuadre.** Son preguntas distintas ("¿cuánto vendí?" vs "¿cuánto dinero pasó por caja?") y mezclarlas produce reportes que mienten (ej. KPIs que ignoran ventas registradas fuera de caja). Segundo principio: cada bloque del reporte debe responder una decisión concreta; si un número no alimenta ninguna decisión, es decoración.

| Decisión | Bloque del reporte |
|---|---|
| ¿Vamos mejor o peor? | KPIs con **delta vs período anterior** (+/-%) y chart de línea de ventas por día |
| ¿A quién le cobro? | **Cartera / por cobrar**: pagos `por_confirmar` de domicilios/envíos + saldos de apartados, con antigüedad |
| ¿Qué recompro? | Top productos + **tallas agotadas en los más vendidos** (ventas perdidas invisibles) |
| ¿Qué liquido? | **Producto muerto**: referencias sin movimiento en 60+ días, unidades y valor parado |
| ¿Se pierde plata? | **Descuadres de caja** acumulados por período y por quien cerró (requiere arqueo ciego §8.2); **margen bruto** y top por margen (requiere `costo_unitario` §8.3); **% devoluciones por referencia** (señala tallaje/calidad) |
| ¿Funciona la venta cruzada? | **Ticket promedio** y unidades por ticket (por pedido, no por día) |

Datos operativos como "días con caja abierta" van en un resumen secundario, no como KPI principal. El margen bruto y los descuadres quedan bloqueados hasta implementar `costo_unitario` en entradas y el arqueo ciego — razón adicional para priorizarlos en el roadmap.

### 8.6 Referencias open-source para comparar tu esquema (ERDs)

- **[Odoo](https://github.com/odoo/odoo)** (módulos `point_of_sale`, `stock`, `account`): el estándar de facto. Estudia `pos.session` (tu sesión de caja), `pos.payment` (pagos mixtos), `stock.move` (tu tabla de movimientos — verás que es exactamente el patrón ledger). Concepto clave a estudiar: las **ubicaciones virtuales** — el inventario nunca aparece ni desaparece, *fluye* entre nodos (`Proveedor → Bodega → Cliente`, o `Bodega → Pérdida de inventario` para mermas/robo). Es partida doble aplicada a unidades físicas, y explica por qué tu tabla de movimientos debe registrar también las mermas como movimiento tipificado, no como un UPDATE de stock. Modelos navegables en su [documentación de desarrollador](https://www.odoo.com/documentation/18.0/developer.html).
- **[ERPNext](https://github.com/frappe/erpnext)**: mira `Stock Ledger Entry` (ledger inmutable con costeo por promedio/FIFO incluido — el mejor ejemplo educativo de §8.3) y `POS Invoice`.
- **[Open Source Point of Sale](https://github.com/opensourcepos/opensourcepos)** (PHP): más cercano a tu escala; su esquema de `sales`, `sales_payments` (¡pagos mixtos!) y `inventory` es fácil de leer completo en una tarde.
- **[Medusa.js](https://github.com/medusajs/medusa)** (TypeScript): no es POS pero su módulo de inventario moderno (reservations = tus apartados, stock locations, inventory levels) es la referencia más cercana a tu stack.
- Teoría: Fowler, *Analysis Patterns* (cap. de inventario y contabilidad); el patrón [Transaction Script vs Domain Model](https://martinfowler.com/eaaCatalog/) para decidir dónde vive la lógica.

---

## 9. Migración en caliente: aplicar todo esto sin detener la app en producción

La app ya está en GitHub, Supabase y Vercel con uso diario. No hace falta detenerla: casi todo el plan se construye **al lado** de producción, no encima. Prod solo se toca al final de cada cambio, en operaciones que duran segundos.

**Principio rector: todo cambio es aditivo primero, destructivo después (expand → contract).** Agregar tablas, columnas, funciones o triggers nuevos no afecta al código que ya corre. Solo el "switch" final toca lo existente, en una ventana de minutos fuera de horario.

### Fase 0 — Sin tocar prod (hoy mismo)

1. `supabase db dump` de prod → primer backup. Solo lectura, cero impacto.
2. `supabase db pull` → migración baseline en el repo. También solo lectura.
3. Sentry, branch protection en GitHub y GitHub Action de backup diario: nada de esto toca la app.

### Fase 1 — Construir los entornos (prod sigue intacto)

4. `supabase start` local + crear el proyecto staging y aplicarle las migraciones.
5. En Vercel, env vars de scope `Preview` → staging. Los deploys de producción siguen usando las variables de siempre.
6. Escribir los tests Playwright **contra staging**, replicando el comportamiento actual. Esa es la red que detecta roturas antes de llegar a prod.

### Fase 2 — Cambios en prod, cada uno con su técnica de cero downtime

- **Constraint `stock >= 0`:** primero un `SELECT` para detectar filas que ya lo violan y corregirlas; luego `ADD CONSTRAINT ... NOT VALID` seguido de `VALIDATE CONSTRAINT` (no bloquea la tabla). Segundos.
- **`float` → `numeric`:** expand/contract — columna nueva, backfill con `UPDATE`, código que usa la nueva, y días después se elimina la vieja. La app nunca deja de funcionar.
- **Auth real (el cambio grande):** corre *en paralelo* con el fake auth. Instalar Supabase Auth, crear los usuarios, montar el login nuevo en una ruta aparte (o tras un feature flag), probarlo en staging y luego en prod. Cuando funcione, una noche se cambia el middleware para exigir sesión real — dejando el PIN como fallback una semana. Rollback = revertir el deploy en Vercel (un clic, instantáneo).
- **RLS:** crear todas las policies con RLS aún *deshabilitado* (cero efecto), validar en staging, y luego `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` tabla por tabla, empezando por las menos críticas, en horario sin ventas. Si algo falla, `DISABLE` es rollback instantáneo. Verificar antes qué key usa el código actual del servidor: RLS no aplica a `service_role`.
- **Tablas nuevas** (sesiones de caja, `pagos_venta`, historial de estados): puramente aditivas, cero riesgo. Se despliegan cuando sea y el código las adopta gradualmente.

### Reglas operativas durante la convivencia uso diario + refactor

- Despliegues a prod fuera de horario de tienda (los deploys de Vercel son atómicos y con rollback de un clic, pero igual).
- Backup automático antes de cada `db push` a prod (un paso más en el GitHub Action).
- **Un cambio a la vez:** nunca mezclar "habilitar RLS" con "migrar auth" en el mismo deploy, para que el rollback sea obvio.
- En una BD de este tamaño las migraciones corren en milisegundos; la "ventana de mantenimiento" real será de minutos, una o dos veces en todo el plan.
- El único cambio que conviene avisar a la tienda ("hoy a las 9pm el sistema se reinicia 10 minutos") es el switch de login, porque todos deberán iniciar sesión con su nuevo usuario. Todo lo demás es invisible para quien está en la caja.

---

## Plan de acción sugerido (orden de ejecución)

1. **Semana 1 — Red de seguridad:** backups automatizados + Sentry + constraint `stock >= 0` + `numeric` para dinero + repo con migraciones baseline (`supabase db pull`).
2. **Semana 2 — Entornos:** Supabase local + proyecto staging + scopes de env en Vercel + GitHub Actions de migraciones.
3. **Semanas 3–4 — Auth real:** Supabase Auth + roles + RLS en todas las tablas. (El mayor riesgo actual de tu sistema.)
4. **Semana 5 — Tests:** Playwright sobre el flujo de venta + tests de RLS y de la RPC `registrar_venta`.
5. **Semanas 6–8 — Modelado:** sesiones de caja con arqueo ciego, `pagos_venta`, máquina de estados de apartados, `costo_unitario` en movimientos.
6. **Después:** rediseño visual con v0 (pantalla por pantalla, protegido por los tests E2E de la semana 5), offline nivel 2 (Dexie), agente de Telegram, costeo promedio ponderado.

---

## Fuentes principales

- [Supabase: Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments) · [Deployment & Branching](https://supabase.com/docs/guides/deployment) · [Vibe Coder's Guide to Environments](https://supabase.com/blog/the-vibe-coders-guide-to-supabase-environments)
- [Supabase: Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) · [Next.js tutorial](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs) · [Pricing/free tier](https://supabase.com/pricing)
- [Vercel: Hobby plan](https://vercel.com/docs/plans/hobby) · [Limits](https://vercel.com/docs/limits)
- [Migraciones multi-entorno (tutorial)](https://dev.to/parth24072001/supabase-managing-database-migrations-across-multiple-environments-local-staging-production-4emg) · [RBAC Next.js+Supabase (Permit.io)](https://www.permit.io/blog/supabase-authentication-and-authorization-in-nextjs-implementation-guide)
- [Dexie.js](https://dexie.org/) · [Offline-first PWA Next.js](https://www.wellally.tech/blog/build-offline-first-pwa-nextjs-indexeddb) · [Patrones PWA/Background Sync](https://rohitraj.tech/de/notes/pwa-offline-sync)
- [grammY](https://grammy.dev/) · [free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources)
- [Odoo](https://github.com/odoo/odoo) · [ERPNext](https://github.com/frappe/erpnext) · [OpenSourcePOS](https://github.com/opensourcepos/opensourcepos) · [Medusa](https://github.com/medusajs/medusa) · [Fowler: Accounting Patterns](https://martinfowler.com/eaaDev/AccountingNarrative.html)