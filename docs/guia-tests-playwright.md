# Guía de tests automáticos (Playwright)

Cómo correr y entender los tests E2E del proyecto. Pensada para consulta rápida.

> Parte de la **Fase 1** del plan de maduración. Los tests son la red de seguridad
> que detecta si un cambio rompió un flujo crítico (venta, caja, apartados) **antes**
> de que llegue a producción.

---

## 1. ¿Qué es esto y por qué?

Playwright controla un navegador de verdad de forma automática: abre la app, hace
clics, escribe, y comprueba que el resultado es el esperado. Es como un robot que usa
la app igual que un empleado, siguiendo un guion exacto, en segundos.

**Para qué sirve:** antes de cualquier cambio grande, corres los tests. Si algo se
rompió (p. ej. "registrar venta" dejó de descontar stock), un test **falla y te avisa**,
en vez de que el error aparezca en la tienda.

Los tests corren contra el **laboratorio local** (Docker), nunca contra staging ni
producción. Pueden vender, borrar y romper datos de prueba sin afectar a nadie.

---

## 2. Requisitos antes de correr los tests

1. **Docker Desktop** abierto (la ballena encendida).
2. **Stack local de Supabase** corriendo:
   ```powershell
   npx supabase start
   ```
3. **`.env.local` apuntando al laboratorio local** (no a producción). Ver
   `docs/guia-entornos-y-docker.md` §5. Así está configurado actualmente.

> No hace falta tener `npm run dev` corriendo: Playwright arranca la app sola. Si ya
> la tienes corriendo, la reutiliza.

---

## 3. Cómo correr los tests

```powershell
npm run test:e2e        # corre todos los tests (sin ventana, rapido)
npm run test:e2e:ui     # modo visual: ves el navegador y cada paso (ideal para entender o depurar)
```

Otras formas útiles:

```powershell
npx playwright test venta            # corre solo los tests cuyo archivo contiene "venta"
npx playwright test --headed         # ver el navegador mientras corre
npx playwright show-report           # abre el reporte HTML del ultimo run (con capturas si algo fallo)
```

Cuando un test **falla**, Playwright guarda una captura de pantalla y una "traza"
(grabación paso a paso) en `playwright-report/` y `test-results/`. Para verlo:
`npx playwright show-report`.

---

## 4. Qué tests hay hoy

| Archivo | Qué verifica |
|---------|--------------|
| `e2e/smoke.spec.ts` | La app carga y muestra el selector de perfil |
| `e2e/venta.spec.ts` | Registrar una venta del inventario **descuenta el stock** |
| `e2e/caja.spec.ts` | Registrar un gasto y **cerrar la caja** del día (queda 'cerrada' en la base) |
| `e2e/apartados.spec.ts` | Crear un apartado en tienda **registra la fila y descuenta el stock** |

`e2e/helpers.ts` tiene utilidades reutilizables: `loginAsAdmin()` (inicia sesión como
admin con el PIN), `getStockTienda()` (lee el stock desde la base) y `restGet()`
(consulta cualquier tabla/vista por REST para verificar efectos).

---

## 5. IMPORTANTE: la suite reinicia el laboratorio automáticamente

Los tests **mutan datos** (la venta y el apartado gastan stock; cerrar caja es
irreversible). Para que sean repetibles, antes de cada corrida la suite ejecuta
**automáticamente** `supabase db reset` (ver `e2e/global-setup.ts`), dejando el
laboratorio con los datos frescos del `seed.sql` (stock lleno, caja del día abierta).

Consecuencia a tener clara: **cada `npm run test:e2e` BORRA lo que tengas en el
laboratorio local** y lo reemplaza por el seed. No afecta staging ni producción. Si
estabas probando algo manualmente en el laboratorio, se perderá al correr los tests.

Por eso también la suite corre con `workers: 1` (un test a la vez): todos comparten la
misma base local y así no se pisan.

### Detalle de zona horaria

Los tests fijan el navegador en **UTC** (`timezoneId: "UTC"` en la config). Es necesario
porque el `seed.sql` crea la caja del día con la fecha de la base (UTC) y la app usa la
fecha local del navegador; si no coinciden (de noche en Colombia, UTC ya va un día
adelante), la pantalla de Caja no encontraría la caja del día. Con UTC, ambas hablan del
mismo día. (Esto es solo del entorno de test; en producción la app crea y lee la caja
con la misma fecha local, así que no aplica.)

---

## 6. Notas para escribir más tests (cuando agreguemos caja, apartados…)

- **La sesión (perfil) NO persiste.** El `ProfileContext` vive solo en memoria. Si
  navegas con `page.goto("/otra-ruta")` se pierde el perfil y la app te manda al inicio.
  Por eso, después del login hay que navegar **haciendo clic en enlaces dentro de la
  app** (navegación de Next.js), como hace el test de venta al entrar a Venta desde las
  acciones rápidas.
- **Login admin:** `loginAsAdmin(page)` (helper). PIN del seed local: `1234`.
- **Verificar efectos en la base:** usar `getStockTienda()` u otros helpers que leen por
  REST. Comparar antes/después es más robusto que asumir un valor absoluto.
- **Datos de prueba:** vienen de `supabase/seed.sql` (5 productos con stock, 2 clientes,
  caja abierta). Si un test necesita datos nuevos, se agregan ahí.
- **Verificar en la base:** usar `getStockTienda()` o `restGet()` (lectura por REST).
  Comparar antes/después es más robusto que asumir un valor absoluto.
- Flujos cubiertos hoy: venta, cierre de caja y crear apartado. Posibles siguientes:
  abono a un apartado, marcar recibida / entregar, devolución y cambio.

---

## 7. Archivos del setup

| Archivo | Qué es |
|---------|--------|
| `playwright.config.ts` | Config: laboratorio local, arranca `npm run dev` solo, carga `.env.local`, UTC, 1 worker |
| `e2e/global-setup.ts` | Reinicia el laboratorio (`supabase db reset`) antes de la suite |
| `e2e/*.spec.ts` | Los tests |
| `e2e/helpers.ts` | Utilidades compartidas (login, lectura de stock/REST) |
| `package.json` | Scripts `test:e2e` y `test:e2e:ui` |

Carpetas que genera Playwright (ignoradas por git): `playwright-report/`, `test-results/`.
