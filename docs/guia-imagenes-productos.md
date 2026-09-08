# Guía operativa — imágenes de productos

Esta funcionalidad sigue los tres entornos definidos en `guia-entornos-y-docker.md`.
Nunca se usa producción para desarrollar o probar.

## 1. Qué se almacena

Cada producto puede tener una foto principal. El original nunca llega a Storage. La app crea:

- `{producto_id}/{uuid}/thumb.webp`: 256×256, máximo 60 KB.
- `{producto_id}/{uuid}/detail.webp`: 800×800, máximo 220 KB.

Ambas usan fondo neutro y encuadre `contain`. Una foto ocupa como máximo 280 KB. La columna
`productos.imagen_path` guarda solo la ruta base versionada.
Si Storage no permite borrar una versión reemplazada, la ruta queda registrada en
`producto_imagenes_huerfanas` para una limpieza posterior.

## 2. Variables nuevas

```env
ADMIN_SESSION_SECRET=una-cadena-aleatoria-de-al-menos-32-caracteres
PRODUCT_IMAGE_UPLOADS_ENABLED=true
```

`ADMIN_SESSION_SECRET` firma una cookie administrativa `HttpOnly` válida durante 8 horas.
`PRODUCT_IMAGE_UPLOADS_ENABLED=false` bloquea POST/DELETE de imágenes sin afectar su lectura.

En Docker local ambas van en `.env.local`. En Vercel se configuran primero únicamente para
Preview. Producción se configura solo durante el despliegue aprobado.

## 3. Laboratorio Docker (obligatorio primero)

Verificar que `.env.local` contenga exactamente:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
```

Luego:

```powershell
npx supabase start
npx supabase db reset
npm run lint
npm run build
npm run test:e2e
```

El `globalSetup` de Playwright aborta antes del reset si la URL no es exactamente la local.
Playwright tampoco reutiliza un servidor Next.js que pudiera haberse iniciado con otro entorno.

## 4. Importar una carpeta existente

El nombre del archivo debe coincidir exactamente con el `codigo` o con una `referencia`
normalizada que sea única. No hay coincidencias difusas. JPG, PNG, WebP, HEIC y HEIF son
candidatos; si la instalación local de Sharp no puede decodificar un archivo, el CSV lo reporta
como error y no se modifica el original.

Primero ejecutar siempre la simulación local:

```powershell
npm run importar:fotos -- "C:\ruta\fotos"
```

El reporte queda en `reportes-importacion/` e incluye coincidencias, faltantes, ambigüedades,
duplicados y pesos. Tras revisar el CSV:

```powershell
npm run importar:fotos -- "C:\ruta\fotos" --apply
```

Para staging se deben proporcionar en la terminal actual `SUPABASE_IMPORT_URL` y
`SUPABASE_IMPORT_SERVICE_ROLE_KEY`, y confirmar explícitamente el proyecto:

```powershell
npm run importar:fotos -- "C:\ruta\fotos" --target=staging --project-ref=ubwtkjgvabycymwopmvl
```

Sin `--apply` sigue siendo simulación. El importador valida que la URL pertenezca realmente a
staging. Producción exige dos confirmaciones exactas y no se ejecuta hasta completar el runbook.

## 5. Staging y Preview

Después de aprobar Docker:

1. Verificar que `supabase/.temp/project-ref` sea `ubwtkjgvabycymwopmvl`.
2. Aplicar solo la migración nueva a staging.
3. Configurar las dos variables nuevas en Vercel Preview.
4. Publicar la rama y validar en móvil creación, reemplazo, eliminación, placeholders e inventario.
5. Mantener `main` y la base `egnfwkrkptkundfdhcyc` sin cambios.

## 6. Salida a producción (posterior y con aprobación)

Seguir `guia-entornos-y-docker.md`: fuera del horario de la tienda, con backup, revisión de la
migración y prueba controlada de una sola foto. No usar un `db push` genérico si el proyecto
enlazado no ha sido comprobado explícitamente.

Rollback de código: la columna nullable y el bucket pueden quedarse sin afectar la versión
anterior. Para apagar cargas de emergencia, establecer `PRODUCT_IMAGE_UPLOADS_ENABLED=false`.
