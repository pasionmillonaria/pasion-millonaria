# Tareas pendientes

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

**Opción recomendada: Supabase Storage**

1. En el dashboard de Supabase, crear un bucket llamado `productos` (público)
2. Subir las fotos con el nombre `{codigo_producto}.webp` (ej: `CAM-001.webp`)
3. En el código, construir la URL así:
   ```ts
   supabase.storage.from("productos").getPublicUrl(producto.codigo + ".webp")
   ```
4. Las imágenes aparecerían en inventario, venta, etc.

**Convenciones para las fotos:**
- Nombre del archivo = código del producto (campo `codigo` en la tabla `productos`)
- Formato: `.webp`
- Tamaño ideal: 800×800 px, fondo blanco o neutro

**Pendiente de implementar en el código:**
- Mostrar foto en la lista de productos (inventario, venta)
- Agregar botón "Subir foto" en la página de detalle de producto (solo admin)

## Reportes (rediseño orientado a decisiones — ver deep research §8.5)
- [ ] BUG: KPIs calculan desde cierres de caja e ignoran ventas de /venta → migrar a `movimientos`
- [ ] Asimetría artículo libre Caja ↔ Reportes: una venta libre desde `/venta` crea movimiento (sí aparece en Reportes, agrupada como "ARTÍCULO LIBRE"); la misma venta desde Caja solo crea `registros_caja` sin movimiento (`handleSaveLibre` manda `productoId: null`), así que NO aparece en Reportes, solo en la caja del día. Al migrar los KPIs a `movimientos`, decidir cómo contar los libres de Caja para que no queden invisibles.
- [ ] Delta vs período anterior en cada KPI + chart de línea de ventas por día
- [ ] Bloque "Por cobrar": pagos por_confirmar + saldos de apartados, con antigüedad
- [ ] Bloque "Qué liquidar": referencias sin movimiento en 60+ días
- [ ] Alerta de tallas agotadas dentro del top 10
- [ ] Ticket promedio y unidades por ticket (por pedido)
- [ ] Bloqueados hasta otras tareas: margen bruto (requiere costo_unitario en entradas) y descuadres (requiere arqueo ciego)