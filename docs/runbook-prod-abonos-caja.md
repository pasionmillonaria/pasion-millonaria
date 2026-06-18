# Runbook — Despliegue a producción: correcciones de abonos ↔ caja

Despliegue del trabajo de corrección/anulación de abonos y cierre del hueco de
borrado en caja. **Producción tiene uso diario: esto se ejecuta con la tienda
cerrada (fuera de horario).**

## Qué se despliega

**Migraciones (se aplican a prod en este push, en orden):**
1. `20260611200000_trigger_stock_ignora_comodin_libre` — fix del trigger para que
   el "Artículo Libre" no mueva stock. *(Ya en staging desde 11-jun; pendiente en prod.)*
2. `20260617120000_abono_id_registros_caja_y_rpc_corregir_abono` — columna
   `registros_caja.abono_id` + RPC `corregir_metodo_abono`.
3. `20260617130000_fase2_cerrar_delete_caja_y_anular_abono` — quita el DELETE
   anónimo en `registros_caja`/`gastos` + RPC `anular_abono`.

**Código (merge a `main` → Vercel Production):** rama
`chore/supabase-baseline-migraciones` (corregir/anular abono, registro de abono en
la caja de hoy, ocultar botón eliminar, etiquetas, fix de entrega tras último abono).

**Refs:** prod `egnfwkrkptkundfdhcyc` (Oregon) · staging `ubwtkjgvabycymwopmvl`.

---

## Por qué el ORDEN importa (leer antes de ejecutar)

Código y migración están acoplados:
- El **código nuevo necesita** la migración (usa `abono_id` y las RPCs; sin ellas, crear/corregir/anular abonos falla).
- La **migración rompe el código viejo**: al quitar el DELETE anónimo, la app actual (que borra de caja con anon key) deja de poder borrar gastos/ingresos de caja.

⇒ **Migración primero, código inmediatamente después**, en una ventana corta y con la
tienda cerrada. Único efecto durante esa ventana (migración aplicada, código viejo aún
vivo): no se pueden borrar gastos/ingresos desde caja. Aceptable por unos minutos.

---

## Prerequisitos (antes de tocar prod)

- [ ] Validación en **staging** OK (corregir, anular, registro en caja, entrega).
- [ ] **Revisión humana** de las 3 migraciones (`supabase/migrations/`). Sensible: el
      `DROP POLICY` de borrado y las RPCs `SECURITY DEFINER`.
- [ ] **Contraseña de la DB de prod** a mano (para `link` y `db push`).
- [ ] Vercel **Production** tiene `SUPABASE_SERVICE_ROLE_KEY` (ya la usan
      `editar-movimiento`/`eliminar-venta`; confirmar que sigue ahí).
- [ ] **PR** de la rama a `main` con **CI verde**.
- [ ] **Tienda cerrada**, sin actividad en caja.
- [ ] Token de la CLI cargado (gotcha Windows):
      `$env:SUPABASE_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')`

---

## Pasos

### 0. Backup de prod
En el dashboard de Supabase (proyecto prod) → **Database → Backups**: confirmar que hay
un backup reciente o disparar uno. Anotar el **timestamp** para PITR por si hay que
restaurar.

### 1. Relink del repo a PROD y verificar pendientes
```powershell
$env:SUPABASE_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')
npx supabase link --project-ref egnfwkrkptkundfdhcyc
npx supabase migration list --linked
```
Confirmar que las **pendientes** son exactamente: `20260611200000`, `20260617120000`,
`20260617130000` (las dos del baseline ya deben aparecer en ambos lados). **Si aparece
algo inesperado, DETENERSE.**

### 2. Aplicar migraciones a prod
```powershell
$pw = '<contraseña-db-prod>'
npx supabase db push --password $pw
```
Revisar la lista que muestra (las 3 esperadas) y confirmar. Debe terminar en
`Finished supabase db push.`

### 3. Desplegar el código (merge a `main`)
Mergear el PR a `main` (o `git checkout main && git merge --no-ff <rama> && git push`).
Vercel publica **Production** en ~40-60s. **Hacerlo justo después del paso 2** para
minimizar la ventana.

### 4. Verificación en prod (con cuidado, es la app real)
- `npx supabase migration list --linked` → las 3 aplicadas (Local = Remote).
- En la app de prod:
  - [ ] Crear apartado con abono (Tienda) → aparece el ingreso en caja **con etiqueta de método**.
  - [ ] **Corregir** método del abono → se ajusta en caja.
  - [ ] **Anular** un abono (apartado pendiente) → desaparece del apartado y de caja.
  - [ ] En caja, el ingreso de abono **no** tiene botón eliminar; un **gasto normal sí** se puede borrar (va por el API route nuevo).
  - [ ] Registrar el último abono → "marcar entregado" entrega **a la primera**.

### 5. Relink del repo de vuelta a STAGING (restaurar el default seguro)
```powershell
npx supabase link --project-ref ubwtkjgvabycymwopmvl
```
> El repo debe quedar linkeado a staging para que un `db push` accidental no toque prod.

---

## Rollback

- **Código:** en Vercel, "Promote to Production" del deployment anterior (o revertir el
  merge en `main`). 
- **Base de datos:** las migraciones son aditivas salvo el `DROP` de las dos policies de
  borrado. Si se revierte el código a la versión vieja, hay que **recrear esas policies**
  o el borrado de caja del código viejo quedará roto:
  ```sql
  CREATE POLICY "borrar_registro_caja" ON public.registros_caja FOR DELETE USING (true);
  CREATE POLICY "borrar_gasto"         ON public.gastos         FOR DELETE USING (true);
  ```
- **Rollback total:** restaurar el backup/PITR del paso 0 (camino más seguro si hay duda).

---

## Efectos esperados en prod (no son bugs)

- Los **abonos que ya existían** en prod no tienen `abono_id` (la columna nace en NULL).
  Al corregir/anular uno viejo, la app avisa *"no tenía ingreso de caja vinculado"*. Solo
  los abonos **nuevos** quedan sincronizados con caja automáticamente.
- El borrado de gastos/ingresos desde caja ahora pasa por `/api/eliminar-registro-caja`
  (service role); los ingresos de abono quedan bloqueados allí (se anulan desde el apartado).
