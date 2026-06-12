# Guía de entornos y laboratorio local (Docker)

Guía práctica para trabajar con la base de datos sin tocar producción. Escrita para
consulta rápida: si algo se te olvida, está aquí.

> Contexto: esto es parte de la **Fase 1** del plan de maduración
> (`docs/deep-research-pos-maduracion.md`). Objetivo de la fase: construir entornos de
> prueba **al lado** de producción, sin tocar la app que usan los empleados.

---

## 1. Concepto clave: hay 3 "copias" de la app

Cada una tiene su propia base de datos, separada de las demás:

| Entorno        | Dónde vive          | Qué datos tiene          | Quién lo usa                  |
|----------------|---------------------|--------------------------|-------------------------------|
| **Local**      | Tu PC (Docker)      | Datos de prueba / vacíos | Solo tú, para experimentar    |
| **Staging**    | La nube (Supabase)  | Datos de prueba / vacíos | Tú, para probar antes de subir|
| **Producción** | La nube (Supabase)  | **Datos reales** tienda  | Los empleados, a diario       |

Regla de oro: **se prueba primero en local, luego en staging, y solo al final —con
calma y fuera de horario— va a producción.**

### Referencias de cada proyecto

- **Producción:** ref `egnfwkrkptkundfdhcyc` — región West US (Oregon).
- **Staging:** ref `ubwtkjgvabycymwopmvl` — URL `https://ubwtkjgvabycymwopmvl.supabase.co`.
  Password de la DB en `C:\Users\PC\.pm-staging-db-password.txt`.

---

## 2. ¿Qué es Docker y para qué lo usamos?

Docker es un programa que corre "mini-computadoras" aisladas dentro de tu PC. Supabase
(base de datos + API + login) son en realidad varios programas juntos; con un comando,
Docker levanta una **copia completa de Supabase dentro de tu computador**.

- Es idéntica en estructura a producción (mismas tablas), pero con datos de juguete.
- Vive solo en tu PC. Si la rompes, no pasa nada: la tienda ni se entera.
- Es desechable: la puedes reconstruir desde cero cuando quieras.

**Docker = tu laboratorio privado.** El ícono de la ballena solo tiene que estar
encendido; no necesitas tocar su interfaz.

---

## 3. Encender y apagar el laboratorio

Todo se maneja con la CLI de Supabase (no con Docker directamente):

```powershell
npx supabase start    # enciende el laboratorio (la copia local de la DB)
npx supabase status   # muestra las direcciones (localhost) y si está corriendo
npx supabase stop     # apaga el laboratorio cuando terminas
```

Antes de `supabase start`, **abre Docker Desktop** (la ballena) y espera a que arranque
el motor (~30-60s la primera vez).

### Direcciones del laboratorio (las que miras en el navegador)

| Qué          | Dirección                  | Para qué sirve                                         |
|--------------|----------------------------|--------------------------------------------------------|
| **Studio**   | http://127.0.0.1:55323     | Panel de la base de datos: ver tablas, filas, correr SQL |
| **Tu app**   | http://localhost:3000      | La app corriendo (`npm run dev`) sobre la base local   |
| API / REST   | http://127.0.0.1:55321     | A donde se conecta la app (no la abres a mano)         |
| DB directa   | `postgresql://postgres:postgres@127.0.0.1:55322/postgres` | conexión directa a Postgres |

> Si los puertos cambian, sácalos siempre de `npx supabase status`.

---

## 4. El flujo de trabajo (hacer un cambio en la DB y verlo)

1. **Encender:** Docker Desktop abierto + `npx supabase start`.
2. **Hacer el cambio en la DB:** NO se edita la base a mano. Se escribe un archivo de
   **migración** (`.sql`) en `supabase/migrations/`. *(Normalmente lo redacta el agente.)*
3. **Aplicar el cambio al laboratorio:**
   ```powershell
   npx supabase db reset
   ```
   Esto reconstruye la base local desde cero aplicando todas las migraciones (queda
   limpia y con el cambio nuevo). Se puede repetir cuantas veces quieras, sin miedo.
4. **Mirar el resultado:**
   - en **Studio** (`127.0.0.1:55323`) ves la base directamente, o
   - en **tu app** (`localhost:3000`, con `npm run dev`) la usas como un empleado.
5. Si algo salió mal: editas el SQL y vuelves al paso 3.
6. **Apagar** al terminar: `npx supabase stop`.

Resumen mental: **cambio → `db reset` → mirar en localhost.**

---

## 5. IMPORTANTE: a qué base apunta tu app local

El archivo **`.env.local`** decide a cuál base se conecta la app cuando corres
`npm run dev` en tu PC. Hay dos configuraciones posibles:

- **Apuntando al laboratorio local** (lo normal y seguro):
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321`
- **Apuntando a producción** (PELIGRO: tocas datos reales desde tu PC):
  `NEXT_PUBLIC_SUPABASE_URL=https://egnfwkrkptkundfdhcyc.supabase.co`

**Configuración actual:** `.env.local` apunta al **laboratorio local**. Las credenciales
reales de producción están respaldadas en **`.env.prod-backup.local`** (ignorado por git,
nunca se sube).

> Regla: deja `.env.local` SIEMPRE apuntando al laboratorio local. Producción solo se
> configura en Vercel, no en tu PC. Así nunca tocas datos reales por accidente.

Si la app local se ve vacía (sin productos), es normal: el laboratorio arranca con datos
de prueba, no con el inventario real.

---

## 6. Cómo viaja un cambio de local → staging → producción

Hay **dos cosas distintas** que viajan, no las confundas:

### a) Cambios en la BASE DE DATOS (migraciones `.sql`)

1. Pruebas en **local** (`db reset`).
2. Subes a **staging** y verificas:
   ```powershell
   npx supabase db push      # con el repo linkeado a staging
   ```
3. Cuando estás seguro, aplicas a **producción**: se relinkea a prod y se hace `db push`.
   **Este último paso requiere aprobación humana explícita y se hace fuera de horario**,
   porque toca datos reales.

> El repo está actualmente **linkeado a staging** (`ubwtkjgvabycymwopmvl`). Así, un
> `db push --linked` por error va a staging, no a producción. Para tocar prod hay que
> relinkear a `egnfwkrkptkundfdhcyc` a propósito.

### b) Cambios en el CÓDIGO de la app (deploy en Vercel)

Vercel publica de dos formas, cada una con sus propias variables de entorno:

- **Production:** la URL real de los empleados. Solo cambia al subir código a la rama
  `main`. Sus variables apuntan a la **base real** (no se tocan).
- **Preview:** URLs temporales que Vercel crea para tus otras ramas. Sirven para que TÚ
  pruebes. Sus variables apuntan a **staging**.

Flujo: trabajas en una rama → Vercel genera un Preview (usa staging) → cuando funciona,
**merge a `main`** → Vercel publica a Producción y los empleados reciben la versión nueva.

**Al hacer push en una rama, la app de los empleados NO cambia.** Solo cambia al hacer
merge a `main`.

---

## 7. Reglas de seguridad (no romper producción)

- `.env.local` siempre apunta al laboratorio local; nunca a prod.
- Un cambio a la vez; nunca mezclar dos cambios grandes en un mismo deploy.
- Migraciones y políticas de seguridad (RLS) **se proponen, no se aplican** a prod sin
  revisión humana.
- Deploys a producción fuera del horario de la tienda.
- Backup antes de tocar la base de producción.

---

## 8. Chuleta de comandos

```powershell
# Encender / apagar laboratorio
npx supabase start
npx supabase status
npx supabase stop

# Aplicar migraciones al laboratorio (reconstruye la base local)
npx supabase db reset

# Ver migraciones aplicadas (local y remoto del proyecto linkeado)
npx supabase migration list --local
npx supabase migration list --linked

# Subir migraciones al proyecto linkeado (hoy = staging)
npx supabase db push

# Correr la app contra lo que diga .env.local
npm run dev      # -> http://localhost:3000
```

### Nota sobre autenticación de la CLI (Windows)

Existe una variable de usuario `SUPABASE_ACCESS_TOKEN` que la CLI prefiere sobre el login
del navegador. Si un comando da `Unauthorized`, ese token está revocado: genera uno nuevo
en https://supabase.com/account/tokens y guárdalo con
`setx SUPABASE_ACCESS_TOKEN "sbp_..."`.
