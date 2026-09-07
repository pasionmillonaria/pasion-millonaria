1# Tareas pendientes

## 1. Cambiar PIN de admin en producción (Vercel)

El PIN está en la variable de entorno `ADMIN_PIN` (`src/app/api/verify-pin/route.ts`).

**Pasos:**
1. Ir a vercel.com → tu proyecto → **Settings** → **Environment Variables**
2. Buscar `ADMIN_PIN` (si no existe, crearla)
3. Poner el valor deseado
4. Hacer **Redeploy**: tab Deployments → tres puntos → Redeploy

**Local:** agregar `ADMIN_PIN=tupin` en el archivo `.env.local`

---

## 2. Fotos de productos (Supabase Storage)

Implementado en la rama de imágenes de productos:

- Una foto principal opcional por producto.
- La app prepara JPG, PNG, WebP, HEIC/HEIF en el celular y el servidor guarda solo
  `thumb.webp` (256×256, máximo 60 KB) y `detail.webp` (800×800, máximo 220 KB).
- Se muestran miniaturas en Inventario y Productos; no se agregaron todavía a Venta ni Apartados.
- Las escrituras usan un endpoint de servidor protegido por sesión administrativa y se pueden
  apagar con `PRODUCT_IMAGE_UPLOADS_ENABLED`.
- Importador masivo con `dry-run` predeterminado y reporte CSV.

La guía operativa completa está en `docs/guia-imagenes-productos.md`. Antes de llevarlo a
producción todavía se debe aprobar Docker local, staging y el Preview de Vercel.

## Reportes (rediseño orientado a decisiones — ver deep research §8.5)
- [ ] BUG: KPIs calculan desde cierres de caja e ignoran ventas de /venta → migrar a `movimientos`
- [ ] Asimetría artículo libre Caja ↔ Reportes: una venta libre desde `/venta` crea movimiento (sí aparece en Reportes, agrupada como "ARTÍCULO LIBRE"); la misma venta desde Caja solo crea `registros_caja` sin movimiento (`handleSaveLibre` manda `productoId: null`), así que NO aparece en Reportes, solo en la caja del día. Al migrar los KPIs a `movimientos`, decidir cómo contar los libres de Caja para que no queden invisibles.
- [ ] Delta vs período anterior en cada KPI + chart de línea de ventas por día
- [ ] Bloque "Por cobrar": pagos por_confirmar + saldos de apartados, con antigüedad
- [ ] Bloque "Qué liquidar": referencias sin movimiento en 60+ días
- [ ] Alerta de tallas agotadas dentro del top 10
- [ ] Ticket promedio y unidades por ticket (por pedido)
- [ ] Bloqueados hasta otras tareas: margen bruto (requiere costo_unitario en entradas) y descuadres (requiere arqueo ciego)
