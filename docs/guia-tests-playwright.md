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

| Archivo | Qué verifica | ¿Muta datos? |
|---------|--------------|:-:|
| `e2e/smoke.spec.ts` | La app carga y muestra el selector de perfil | No |
| `e2e/venta.spec.ts` | Registrar una venta del inventario **descuenta el stock** | Sí (−1 unidad) |

`e2e/helpers.ts` tiene utilidades reutilizables: `loginAsAdmin()` (inicia sesión como
admin con el PIN) y `getStockTienda()` (lee el stock desde la base para verificarlo).

---

## 5. IMPORTANTE: los tests de venta mutan el laboratorio

Cada vez que corre el test de venta, **descuenta 1 unidad** del producto de prueba
(DEMO-001, talla M, que arranca con 10 en tienda). Después de varias corridas el stock
se agota y el test empezará a fallar avisando que no hay stock.

**Para devolver el laboratorio a su estado inicial** (datos del `seed.sql` frescos):

```powershell
npx supabase db reset
```

Esto reconstruye la base local desde cero y vuelve a aplicar el seed (productos, stock,
caja abierta, etc.). No afecta staging ni producción.

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
- Los flujos críticos que faltan por cubrir (del `CLAUDE.md`): **cierre de caja** y
  **apartados** (crear / marcar recibida / entregar).

---

## 7. Archivos del setup

| Archivo | Qué es |
|---------|--------|
| `playwright.config.ts` | Config: corre contra el laboratorio local, arranca `npm run dev` solo, carga `.env.local` |
| `e2e/*.spec.ts` | Los tests |
| `e2e/helpers.ts` | Utilidades compartidas (login, lectura de stock) |
| `package.json` | Scripts `test:e2e` y `test:e2e:ui` |

Carpetas que genera Playwright (ignoradas por git): `playwright-report/`, `test-results/`.
