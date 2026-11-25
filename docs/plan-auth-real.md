# Plan — Usuarios reales, trazabilidad y permisos

Sustituye el plan del 2026-06-12 (sigue en el historial de git). Documento **resumible**:
marca `[x]` al completar y actualiza el tablero.

## Dónde nos quedamos

- **Última actualización:** 2026-11-24. Fase 0 en local: suite 26/26. Nada en staging ni producción.
- **Próximo paso:** revisión humana de la Fase 0; control previo de producción; luego Fase 1.

| Fase | Qué | Estado |
|------|-----|--------|
| 0 | Huecos urgentes | código hecho y probado en local; sin publicar |
| 1 | Usuarios + PIN sobre Supabase Auth | pendiente |
| 2 | Autor automático, auditoría y vistas | pendiente |
| 3 | Permisos en pantalla y en base | pendiente |
| 4 | Switch en producción | pendiente |
| 5 | Retirar acceso viejo | pendiente |
| UI | Diseño v0 (PRs aparte) | pendiente |

## Objetivo

1. Saber **quién** hizo cada movimiento, edición y anulación.
2. Que cada persona solo pueda hacer lo suyo, impuesto por la base.
3. Entrada rápida: tocar perfil + PIN.

Lo anterior a la activación no se puede atribuir: queda "Sin registro".

## Reglas

- Las de `CLAUDE.md` Parte B. Solo `@supabase/ssr`; `getUser()` en servidor; zod en servidor.
- Migraciones append-only y **con revisión humana**. Local, luego staging, luego prod de noche.
- Un cambio a la vez: no mezclar auth, RLS y rediseño en el mismo deploy.
- El autor lo pone la base (`auth.uid()`), nunca el cliente.

## Permisos por persona (decisión 2026-11-24)

| Permiso | Persona 1 | Persona 2 | Persona 3 | Admin |
|---|---|---|---|---|
| Ver caja, inventario, apartados y reportes (`money.view`) | sí | sí | sí | sí |
| Vender y registrar en caja (`pos.sell`, `caja.register`) | no | sí | sí | sí |
| Cerrar caja (`caja.close`) | no | sí | sí | sí |
| Apartados: crear, abonar, entregar, cancelar (`apartados.manage`) | no | sí | sí | sí |
| Entradas, retiros, devoluciones, traslados, cambios (`inventory.manage`) | no | no | sí | sí |
| Crear y editar productos (`products.manage`) | no | no | sí | sí |
| Ajuste forzado de stock (`inventory.adjust`, nuevo) | no | no | **no** | sí |
| Editar o anular ventas, abonos y registros de caja (`sales.void`, nuevo) | no | no | no | sí |
| Ver auditoría (`audit.view`, nuevo) | sí | no | no | sí |

Roles provisionales: `supervisor`, `vendedor`, `operador`, `admin`. Persona 3 usa
`inventory.manage` pero no `inventory.adjust`.

## Lección del intento anterior (sept–oct 2026)

`fe33749` buscaba en `usuarios` la primera fila activa del rol y, si no aparecía, cancelaba la
operación. El seed (local y, en junio, staging) trae esas filas; todo indica que en prod la
búsqueda no devolvió ninguna (por confirmar). `d4dd69f` lo corrigió solo en `apartados/nuevo`;
`apartados/[id]` siguió igual hasta `f82c854`, que lo quitó todo.

- **El registro de autor nunca bloquea una venta durante la transición.** Sin usuario válido:
  se guarda NULL y queda una alerta. Columnas de autor NULL-able.
- Despliegue en dos pasos: primero la base (compatible con la app vieja), luego la app.
- Ningún paso depende de filas del seed: los usuarios se crean y verifican antes del switch.

### Control previo de producción (solo lectura, lo ejecuta una persona)

- [ ] Filas y roles de `usuarios` (sin PIN), destino de las FK de autor, policies, triggers,
      funciones y migraciones aplicadas. Comparar contra local; toda diferencia se resuelve antes.
- [ ] Reproducir esas diferencias en local y correr ahí toda la matriz.

### Matriz de pruebas obligatoria

Cada operación: venta (pedido, caja y offline), gasto, ingreso, caja fuerte, entrada, traslado,
devolución, cambio, retiro, ajuste forzado, apartado (crear, agregar, editar, recibir, abonar,
cancelar, entregar), corregir y anular abono, editar y anular venta, borrar registro, cerrar y
reabrir caja, producto y categoría. Cada una contra:

- [ ] cuatro personas, permitido y rechazado (el rechazo no deja datos a medias);
- [ ] `usuarios` vacía, usuario inactivo, sin rol o con sesión de Auth sin fila en `usuarios`;
- [ ] sesión vencida a mitad de operación y cambio de usuario;
- [ ] app vieja + base nueva, y rollback a app vieja con datos nuevos;
- [ ] efecto exacto en stock, caja, autor y auditoría, sin duplicados;
- [ ] migraciones sobre una base **con datos previos** y autor NULL, no solo desde cero.

## Fase 0 — Huecos urgentes

- [ ] Repo privado; comprobar `pass.txt` y rotar lo que contenga (sigue en el historial).
- [x] (local) Quitar la lectura anónima de `usuarios.pin` (y los PIN, si hay).
- [x] (local) Exigir sesión admin (`tieneSesionAdmin` + `origenPermitido`) en `eliminar-venta`,
      `editar-movimiento`, `corregir-abono`, `anular-abono` y `eliminar-registro-caja`.
      Antes: confirmar `ADMIN_SESSION_SECRET` en Vercel; sin ella estas acciones fallarían.
- [x] (local) Bloquear pantallas de escritura al perfil Empleados, y su cambio de canal en apartados.
      (Escribir la URL ya devolvía al selector; el acceso posible era dentro de la app.)
- [x] (local) Entrar como Empleados cierra la sesión admin que quedara viva.
- Publicar primero el código (la migración es independiente). La sesión admin dura 8 h.

## Fase 1 — Identidad

- [ ] Usuarios en Supabase Auth con correos internos; registro público desactivado.
- [ ] `usuarios.id` = `auth.users.id` (las FK actuales ya apuntan a `usuarios`).
- [ ] Enum de permisos, `role_permissions` y `authorize()`.
- [ ] Login: el servidor valida el PIN con hash, bloquea tras 5 fallos y abre la sesión con
      una clave fuerte derivada de un secreto del servidor. El PIN no es la contraseña de Auth.
- [ ] Navegador con `createBrowserClient` y middleware de refresco de sesión.
- [ ] Dispositivo compartido: bloqueo por inactividad, cambio rápido y nombre siempre visible.
- [ ] Flag `NEXT_PUBLIC_AUTH_MODE` = `pin` | `supabase` (default `pin`).

## Fase 2 — Trazabilidad

- [ ] Trigger BEFORE INSERT que fija el autor en `movimientos`, `apartados`,
      `registros_caja`, `abonos`, `gastos` y `caja_diaria`, ignorando lo que mande el cliente.
- [ ] Tabla `auditoria` append-only: quién, cuándo, acción, entidad, antes, después, motivo.
      Nadie la edita desde la app. Triggers en INSERT/UPDATE/DELETE de las tablas clave.
- [ ] Anulaciones sin borrar: contramovimiento + marca `anulado_por`. Adaptar a la vez stock,
      caja, reportes y pedidos para no contar la venta anulada.
- [ ] Rutas con service role a RPCs llamadas con la sesión del usuario: con service role
      `auth.uid()` es nulo.
- [ ] Cron y cierres automáticos: autor "Sistema".
- [ ] Cola offline de caja: guardar el usuario y sincronizar solo con su sesión. Distinguir
      error de red de rechazo por permisos (hoy todo se encola como "sin conexión").

### Dónde se ve

- **Etiqueta pequeña con el nombre** en cada registro visible: pedidos del día, detalle de
  venta, filas de caja e historial, apartados y abonos.
- **Última sección de Reportes, "Auditoría"** (admin y persona 1): ajustes forzados, ventas
  editadas o anuladas, abonos corregidos o anulados, registros de caja borrados, apartados
  cancelados o con precio cambiado, retiros, cambios de precio de producto, reaperturas de
  caja y cierres con diferencia. Filtros por persona, fecha y tipo; antes y después.
- **Motivo obligatorio:** ajuste forzado, editar o anular, retiro, cancelar apartado y
  reabrir caja.

## Fase 3 — Permisos

- [ ] `can` desde `src/lib/permissions.ts`; sustituir `isAdmin` en pantallas y rutas.
- [ ] Policies viejas pasan a `TO anon` y las nuevas son `TO authenticated`. Si conviven para
      el mismo rol, Postgres las une con OR y las nuevas no restringen nada.
- [ ] Antes de restringir, revisar triggers y RPC que escriben como el usuario (stock,
      abonos, caja): pasar a `SECURITY DEFINER` con `search_path` fijo lo necesario.
- [ ] RPC `ajustar_stock` con `inventory.adjust`. Los apartados también usan `canal=ajuste`:
      moverlos a RPC para poder prohibir ese insert directo.
- [ ] Mover al servidor la corrección de `saldo_inicial` que hoy hace abrir Caja.
- [ ] RPCs actuales: retirar EXECUTE de `anon` en la Fase 5 y validar `authorize()`.

### Pruebas en staging

- [ ] Un test por persona, en pantalla y por REST, incluido falsificar `usuario_id`.
- [ ] Cambio de usuario con cola offline pendiente.
- [ ] Toda la suite E2E actual.

## Fase 4 — Switch en producción

- [ ] Control previo sin diferencias y matriz completa en verde en local y staging.
- [ ] Backup, usuarios, migraciones y flag, de noche. PIN viejo de respaldo pocos días.
- [ ] Verificación supervisada de cada operación al abrir; si una falla, rollback inmediato.
- [ ] Rollback: revertir el deploy en Vercel. Mientras `anon` siga abierto, **la seguridad no
      está completa**.

## Fase 5 — Retirar acceso viejo

- [ ] Quitar policies y grants de `anon`, `ADMIN_PIN`, `verify-pin`, perfiles fijos y flag.
- [ ] Actualizar `CLAUDE.md` y `DOCUMENTACION.md`.

## Diseño v0 (`pos-system-design.zip`)

Se adapta a mano; **no se copia el proyecto**. Usa Next 16, React 19 y Tailwind 4; la app usa
Next 14, React 18 y Tailwind 3. PRs separados y en este orden:

- [ ] **UI-1 Selector de perfil y PIN** (con Fase 1). Sin PIN demo, sin correo/contraseña, todos
      los perfiles con PIN, sin perfiles inventados; logo real.
- [ ] **UI-2 Menú** (con Fase 3). No usar `?perfil=` en la URL. Inventario y Caja no pueden
      exigir permiso de escritura para verse: la persona 1 los necesita.
- [ ] **UI-3 Inventario.** Solo apariencia; conservar datos, fotos, "mostrar más" y filtros.
- [ ] **UI-4 Reportes.** El zip trae componentes sueltos con datos inventados y sin página;
      usar solo lo que tenga datos reales.

El zip no trae Venta, Apartados, Caja, Productos ni Auditoría: se diseñan o se quedan igual.

## Decisiones abiertas

- [x] "Admin" es la cuarta persona: cuatro usuarios en total, sin cuenta aparte (2026-11-24).
- [ ] `authorize()` consultando el rol en la base (recomendado; revocación inmediata) en vez
      del Auth Hook de `CLAUDE.md`.
- [ ] Tiempo de bloqueo por inactividad (propuesto: 5 minutos).
