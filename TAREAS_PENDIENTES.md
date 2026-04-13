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
