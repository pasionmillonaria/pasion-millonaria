# UI Design Brief — Pasión Millonaria POS

> Documento de referencia visual y de UX para guiar mejoras de diseño en la app.  
> Stack: Next.js 14 App Router · React 18 · TypeScript · Tailwind CSS · Lucide Icons

---

## 1. Identidad visual actual

### Paleta de colores
| Token            | Hex       | Uso principal                                   |
|------------------|-----------|-------------------------------------------------|
| `brand-blue`     | `#1C3A8C` | Sidebar, botones primarios, acentos activos     |
| `brand-blue-light` | `#2D4FA8` | Hover de botón primario                        |
| `brand-blue-dark`  | `#122B72` | Sombras, contrastes oscuros                    |
| `brand-gold`     | `#C49A2C` | Botón gold, badge PIN Admin, iconos de apartados |
| `brand-gold-light` | `#D4AE44` | Hover gold                                     |
| `brand-gold-dark`  | `#A07E1E` | Sombras gold                                   |
| `gray-50`        | `#F9FAFB` | Fondo general de la app (body background)       |
| `gray-100`       | `#F3F4F6` | Fondo de cards secundarias, hover items         |
| `white`          | `#FFFFFF` | Cards, modales, sidebar en mobile               |
| `red-600`        | `#DC2626` | Botón danger, saldos pendientes                 |
| `green-600`      | `#16A34A` | Acciones de entrada, estados completados        |
| `amber-500`      | `#F59E0B` | Alertas de stock bajo                           |
| `#0F2260`        | —         | Fondo pantalla de login (más oscuro que brand-blue) |

**Fondo de login vs app:** La pantalla de selección de perfil usa `#0F2260` (azul marino profundo), mientras que las páginas internas usan `bg-gray-50` con un sidebar `bg-brand-blue`.

### Tipografía

- **Fuente principal:** `Outfit` (Google Fonts, variable `--font-outfit`)  
- **Fallback:** `system-ui`, `sans-serif`  
- **Pesos usados:** 400 (normal), 500 (medium), 600 (semibold), 700 (bold), 900 (black)  
- **Tamaños frecuentes:** `text-xs` (10–12px), `text-sm` (14px), `text-base` (16px), `text-xl/2xl` (encabezados)

### Iconografía

Librería **Lucide React** exclusivamente. Tamaños más usados: `w-4 h-4`, `w-5 h-5`, `w-6 h-6`. `strokeWidth={2}` por defecto, `strokeWidth={2.5}` para ítems activos en nav.

---

## 2. Componentes UI reutilizables

### Botones (`src/components/ui/Button.tsx`)

| Variante    | Apariencia                                  | Uso                          |
|-------------|---------------------------------------------|------------------------------|
| `primary`   | Fondo `brand-blue`, texto blanco            | Acción principal de pantalla |
| `secondary` | Fondo blanco, borde `brand-blue`, texto azul| Acción secundaria            |
| `gold`      | Fondo `brand-gold`, texto blanco            | Apartados, acciones especiales|
| `danger`    | Fondo `red-600`, texto blanco               | Eliminar, cancelar           |
| `ghost`     | Transparente, texto gris                    | Acciones terciarias          |

Tamaños: `sm` (py-2 px-4), `md` (py-3 px-6), `lg` (py-4 px-8).  
Todos: `rounded-xl`, `active:scale-95`, `transition-all duration-150`.

### Badges (`src/components/ui/Badge.tsx`)

| Variante  | Colores                        |
|-----------|--------------------------------|
| `default` | `bg-gray-100 text-gray-700`    |
| `success` | `bg-green-100 text-green-700`  |
| `warning` | `bg-yellow-100 text-yellow-700`|
| `danger`  | `bg-red-100 text-red-700`      |
| `info`    | `bg-blue-100 text-blue-700`    |
| `gold`    | `bg-amber-100 text-amber-700`  |

Forma: `rounded-full`, inline, `text-xs font-medium`, padding `px-2.5 py-0.5`.

### Cards

Clase CSS global `.card`:  
```
bg-white rounded-2xl shadow-sm border border-gray-100 p-4
```

### Inputs

Clase CSS global `.input`:  
```
w-full px-4 py-3 rounded-xl border border-gray-200
focus:ring-2 focus:ring-brand-blue focus:border-transparent
```

### Modal (`src/components/ui/Modal.tsx`)

- Backdrop: `bg-black/50 backdrop-blur-sm`  
- Panel: `bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl`  
- En mobile se abre **desde abajo** (sheet), en desktop se centra  
- Drag handle visible en mobile cuando no tiene título  
- Tamaños: `sm md lg xl 2xl 3xl full`  
- `max-h-[90vh] overflow-y-auto`

### Spinner / EmptyState

- `Spinner`: animación `animate-spin` sobre un círculo SVG, centrado con `flex items-center justify-center`
- `EmptyState`: icono grande + texto descriptivo, centrado, texto `text-gray-400`

---

## 3. Layout y navegación

### Desktop (≥ `md` / 768px)

```
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (w-60, fixed, bg-brand-blue)                    │
│  ┌──────────────┐                                        │
│  │ Logo + Nombre│                                        │
│  ├──────────────┤                                        │
│  │ ● Inicio     │   MAIN CONTENT (ml-60)                 │
│  │ ● Inventario │   px-4 md:px-8 pt-6                   │
│  │ ● Apartados  │   max-w-7xl mx-auto                    │
│  │ ● Caja       │                                        │
│  │ ● Productos  │                                        │
│  │ ● Reportes   │                                        │
│  ├──────────────┤                                        │
│  │ Avatar + rol │                                        │
│  │ Cambiar perf │                                        │
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

Nav activo: `bg-white/15 text-white` + chevron derecho  
Nav inactivo: `text-blue-200 hover:bg-white/10`

### Mobile (< `md`)

```
┌────────────────────────────────┐
│  CONTENIDO (pb-20)             │
│                                │
│                                │
├────────────────────────────────┤
│  BOTTOM NAV (fixed, bg-white)  │
│  [Inicio][Inventario][Apartados│
│          ][Caja][Reportes]     │
└────────────────────────────────┘
```

Tab activo: color `brand-blue` + barra superior de 2px ancho `w-8`  
Tab inactivo: `text-gray-400`

---

## 4. Pantallas y flujos de usuario

### 4.1 Pantalla de login / selección de perfil (`/`)

**Fondo:** `bg-[#0F2260]` (azul marino)

**Flujo:**
1. Logo centrado + título
2. Grid 2×N de tarjetas de perfil (blancas con borde)  
   — Cada perfil tiene avatar emoji con color personalizado, nombre y rol  
   — El perfil Admin muestra un badge dorado con candado
3. Si se selecciona **Empleado** → ingresa directo al dashboard
4. Si se selecciona **Admin** → aparece modal/sheet de PIN numérico
   - Teclado numérico 3×4
   - 4 puntos que se llenan (dorado = correcto, rojo = error)
   - Animación `shake` si el PIN es incorrecto

**Colores del modal PIN:** Fondo `#0F2260`, teclas `bg-white/10`, confirmación en brand-gold.

---

### 4.2 Inicio / Dashboard (`/inicio`)

**Layout desktop:** 3 columnas (2 izquierda + 1 derecha)  
**Layout mobile:** 1 columna

**Estructura (Admin):**
```
[Header: Avatar + nombre + botón cambiar perfil] [Guardado en caja fuerte] [Refresh]

[Banner brand-blue: logo + "Pasión Millonaria" + total ventas del día + botón "Ver caja"]

[Acciones rápidas — grid 2×4]
  [Venta bg-brand-blue] [Entrada bg-green-600] [Apartado bg-brand-gold] [Traslado bg-purple-600]

[Más acciones — card]
  [Devolución] [Cambio] [Retiro]

[Pedidos de hoy — card con tabs por canal (Tienda/Domicilio/Envío)]

[Apartados pendientes — card con lista + saldos]

COLUMNA DERECHA:
[Ventas de hoy por método de pago]
[Stock bajo — alertas amber]
```

**Estructura (Empleado):**
- Banner "Modo consulta" en lugar del banner de ventas
- Sin acciones rápidas
- Solo ve pedidos de hoy (sin precios) y apartados pendientes (sin montos)

**Patrones visuales:**
- KPI de caja fuerte: tarjeta verde `bg-green-50 border-green-100` con candado
- Canal badges: info=Tienda, warning=Domicilio, success=Envío
- Items "Por llegar": badge naranja
- Saldo pendiente: texto `text-red-600 font-bold`

---

### 4.3 Inventario (`/inventario`)

**Mobile:** Cards por producto con tallas en pills  
**Desktop:** Tabla estilo Excel con filas expandibles por producto

**Controles:**
- Barra de búsqueda (texto libre)
- Botón de filtros (slide-up panel en mobile / dropdown en desktop)
  - Filtro por línea, categoría, talla

**Datos mostrados por producto:**
- Referencia + categoría/línea
- Precio base
- Stock tienda / bodega / total
- Por talla (al expandir): pills con cantidad, coloreados por stock

---

### 4.4 Venta (`/venta`)

**Flujo paso a paso:**
1. **Agregar ítems:** buscador de producto → selector de talla con stock en tiempo real → cantidad + precio + descuento
2. **Carrito:** lista de ítems con precio por unidad y total
3. **Configuración:** selector de canal (Tienda / Domicilio / Envío nacional) + método de pago
4. **Confirmar:** botón "Registrar venta" → toast de éxito → redirect

**Detalle de venta (`/venta/[ref]`):**
- Permite editar canal, precio, método de pago (solo Admin)
- Permite eliminar la venta completa

---

### 4.5 Apartados (`/apartados`)

**Lista:** Cards agrupadas por pedido (grupo_id)  
- Nombre del cliente + teléfono
- Items del apartado (referencias, tallas)
- Badges de estado: `pendiente` (warning), `entregado` (success), `cancelado` (danger)
- Saldo a pagar (rojo, solo Admin)
- Badge de canal (Domicilio / Envío)

**Buscador:** por nombre de cliente o referencia

**Filtros:** estado (pendiente / entregado / cancelado)

**Nuevo apartado (`/apartados/nuevo`):**
- Formulario con: cliente (nuevo o existente), productos + tallas, precio, abono inicial, canal, observaciones

**Detalle apartado (`/apartados/[id]`):**
- Lista de prendas del pedido
- Historial de abonos
- Acciones: abonar, marcar como recibida (en_tienda), entregar, cancelar

---

### 4.6 Caja (`/caja`)

**Estado abierta / cerrada:**
- Si no hay caja del día → botón "Abrir caja"
- Si está abierta → vista de movimientos del día

**Vista caja abierta:**
```
[Header: fecha + estado abierta/cerrada]

[KPIs en cards: Total ventas | Efectivo | Digital | Gastos | Neto]

[Lista de movimientos del día]
  — Cada fila: hora, tipo (venta/gasto/ingreso/caja_fuerte), descripción, método, monto

[Acciones flotantes o en panel:]
  [+ Venta] [+ Gasto] [+ Ingreso] [Caja fuerte] [Cerrar caja]
```

**Offline:** Badge "pendiente" en movimientos que aún no se sincronizaron al servidor (guardados en `localStorage`).

**Cierre de caja:** Modal resumen con totales por método + export a PNG via html2canvas.

**Historial (`/caja/historial`):** Lista de cierres pasados (últimos 60), cada uno navega al detalle del día.

---

### 4.7 Productos (`/productos`)

**Lista:** Cards con referencia, categoría, línea, sistema de talla, precio base, toggle activo/inactivo  
**Búsqueda:** filtro por texto  
**Nuevo/Editar (`/productos/nuevo`, `/productos/[id]`):**
- Campos: referencia, código, categoría, línea, sistema de talla, precio base
- Gestión de tallas disponibles (multi-select)
- Modal de gestión de categorías (`GestionarCategoriasModal`)

---

### 4.8 Reportes (`/reportes`)

**Selector de periodo:** 7 días / 30 días / 90 días

**Secciones (solo Admin):**
```
[KPIs principales]
  — Total ventas | Unidades vendidas | Comisiones ($1.000/ud ≥ $30.000)

[Ventas por canal — barras de progreso]
  — Tienda (brand-blue) | Domicilio (orange) | Envío Nacional (teal) | Cambio (gray)

[Ventas por método de pago — barras de progreso]
  — Efectivo | Nequi | Transferencia | Datafono | Mixto

[Top productos — tabla]
  — Referencia | Unidades | Ingresos

[Export a PNG]
```

---

### 4.9 Flujos secundarios

| Pantalla       | Descripción breve                                              |
|----------------|----------------------------------------------------------------|
| `/entrada`     | Formulario: producto + talla + cantidad + ubicación (tienda/bodega) |
| `/traslado`    | Mover unidades entre tienda y bodega                          |
| `/devolucion`  | Cliente devuelve prenda → restaura stock                      |
| `/cambio`      | Dos movimientos: devolucion + nueva salida                    |
| `/retiro`      | Retiro por uso personal del dueño (salida/ajuste)             |

---

## 5. Patrones de interacción

### Feedback visual
- **Toasts:** `react-hot-toast`, posición `top-center`, `borderRadius: 12px`, duración 3s
  - Success: icono `brand-blue`
  - Error: rojo por defecto
- **Loading states:** `Spinner` centrado en el área de contenido
- **Estados vacíos:** `EmptyState` con icono grande tenue + texto descriptivo

### Microinteracciones
- `active:scale-95` en todos los botones y cards clicables
- `hover:bg-gray-50/100` en ítems de lista
- `hover:scale-105` en avatares de perfil
- `animate-spin` en botón de refresh mientras carga
- `animate-[shake_0.4s]` en modal de PIN al ingresar código incorrecto

### Responsive pattern
- **Filtros:** Slide-up sheet en mobile, dropdown inline en desktop
- **Inventario:** Cards en mobile, tabla Excel en desktop
- **Modales:** Sheet (desde abajo, `rounded-t-3xl`) en mobile, diálogo centrado (`rounded-3xl`) en desktop
- **Nav:** Bottom nav en mobile, sidebar fija en desktop

### Scroll
- Scrollbar personalizado: `width: 4px`, thumb `bg-gray-300 rounded-full`
- Contenido principal con `overflow-x-hidden`

---

## 6. Roles y diferencias visuales

| Elemento                        | Admin                  | Empleado               |
|---------------------------------|------------------------|------------------------|
| Sidebar/Bottom nav              | Todos los ítems        | Sin Productos          |
| Banner inicio                   | Ventas + KPIs del día  | "Modo consulta" azul   |
| Acciones rápidas (inicio)       | Visibles               | Ocultas                |
| Montos en apartados             | Visibles (rojo)        | Ocultos                |
| Montos en historial caja        | Visibles               | Ocultos                |
| Crear/editar/eliminar           | Habilitado             | Solo lectura           |

---

## 7. Oportunidades de mejora detectadas (estado actual)

1. **Paleta limitada:** Solo azul y dorado como colores de marca — sin gradientes, sin variantes semánticas consistentes para estados de éxito/peligro fuera de los badges.
2. **Cards planas:** Todos los cards tienen el mismo estilo (`bg-white rounded-2xl shadow-sm border border-gray-100`), no hay jerarquía visual clara entre secciones principales y secundarias.
3. **Tipografía sin escala modular:** Los tamaños saltan de `text-xs` a `text-sm` a `text-xl` sin una escala rítmica definida.
4. **Sin dark mode:** Solo light mode.
5. **Pantalla de login visualmente distinta** al resto de la app (azul marino oscuro vs gris claro interior) — puede sentirse como dos apps distintas.
6. **KPIs sin visualización:** Los reportes usan solo texto y barras de progreso simples (sin charts reales).
7. **Caja y formularios de alta densidad:** Las pantallas de Caja y Venta tienen muchos elementos sin respiración suficiente.
8. **Mobile bottom nav con 5–6 ítems:** Puede quedar apretado en pantallas pequeñas.
