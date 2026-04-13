# Pasión Millonaria — Documentación del Sistema

Sistema de inventario y punto de venta para tienda de ropa deportiva.

---

## Índice

1. [Roles y acceso](#1-roles-y-acceso)
2. [Pantalla de inicio de sesión](#2-pantalla-de-inicio-de-sesión)
3. [Inicio (Dashboard)](#3-inicio-dashboard)
4. [Inventario](#4-inventario)
5. [Venta](#5-venta)
6. [Entrada de mercancía](#6-entrada-de-mercancía)
7. [Traslado](#7-traslado)
8. [Devolución](#8-devolución)
9. [Cambio](#9-cambio)
10. [Apartados — Lista](#10-apartados--lista)
11. [Apartados — Detalle](#11-apartados--detalle)
12. [Apartados — Nuevo](#12-apartados--nuevo)
13. [Caja](#13-caja)
14. [Historial de caja — Lista](#14-historial-de-caja--lista)
15. [Historial de caja — Detalle](#15-historial-de-caja--detalle)
16. [Productos — Lista](#16-productos--lista)
17. [Productos — Detalle / Editar](#17-productos--detalle--editar)
18. [Productos — Nuevo](#18-productos--nuevo)
19. [Reportes](#19-reportes)
20. [Estructura de la base de datos](#20-estructura-de-la-base-de-datos)
21. [Pendientes / posibles mejoras](#21-pendientes--posibles-mejoras)

---

## 1. Roles y acceso

| Funcionalidad | Admin | Empleado |
|---|:---:|:---:|
| Ver inventario | ✅ | ✅ |
| Ver apartados | ✅ | ✅ (solo lectura) |
| Ver historial de caja | ✅ | ✅ (sin montos) |
| Ver reportes | ✅ | ✅ |
| Registrar ventas / movimientos | ✅ | ❌ |
| Crear / editar apartados | ✅ | ❌ |
| Registrar abonos | ✅ | ❌ |
| Acceder a Caja (día actual) | ✅ | ❌ |
| Gestionar productos | ✅ | ❌ |
| Cerrar caja | ✅ | ❌ |

**PIN de seguridad:** El perfil Admin requiere un PIN de 4 dígitos para ingresar. Los empleados entran directamente sin PIN.

---

## 2. Pantalla de inicio de sesión

**Ruta:** `/`

Pantalla de selección de perfil. Muestra una tarjeta por cada perfil definido en el sistema.

- **Admin** → pide PIN de 4 dígitos antes de ingresar
- **Empleados** → entra directamente

El PIN se verifica contra la API `/api/verify-pin`. Hay 3 intentos antes de que el campo se reinicie. Al ingresar correctamente se redirige a `/inicio`.

**Cambiar de perfil:** Desde cualquier pantalla, en la página de Inicio hay un botón de salir (ícono `LogOut`) en la esquina superior derecha del encabezado.

---

## 3. Inicio (Dashboard)

**Ruta:** `/inicio`  
**Acceso:** Admin y Empleado

### Vista Admin

- **Banner superior:** Logo + nombre de la tienda + total de ventas del día y cantidad
- **Acciones rápidas:** Venta · Entrada · Apartado · Traslado
- **Más acciones:** Devolución · Cambio
- **Apartados pendientes:** Lista de hasta 20 apartados pendientes, ordenados por:
  1. Primero los "Por llegar" (pendientes del proveedor)
  2. Luego por fecha (más antiguos primero)
  - Muestra: cliente, referencia, talla, saldo pendiente, badge "Por llegar"
- **Ventas de hoy:** Desglose por método de pago (efectivo, transferencia, etc.)
- **Stock bajo:** Productos con stock ≤ umbral configurado

### Vista Empleado

- Misma estructura pero sin acciones de movimiento
- Banner azul "Modo consulta"
- Apartados pendientes visibles pero **sin montos** (saldo oculto)
- Sin sección de ventas de hoy

---

## 4. Inventario

**Ruta:** `/inventario`  
**Acceso:** Admin y Empleado (solo lectura)

Muestra el stock de todos los productos por talla, separado entre Tienda y Bodega.

### Filtros

| Filtro | Descripción |
|---|---|
| Búsqueda | Por referencia o categoría (texto libre) |
| Línea | Filtra la vista por línea de producto |
| Categoría | Se activa siempre; filtra por categoría |
| Talla | Solo disponible cuando hay una línea seleccionada; muestra las tallas de esa línea |

En **móvil**, los filtros de línea/categoría/talla se abren en un panel deslizante desde abajo.  
En **desktop**, los tres filtros son dropdowns en fila.

### Tabla de inventario (desktop)

Formato tipo Excel: cada producto es una fila, cada talla es una columna. Las celdas muestran `tienda / bodega` con colores:
- 🟢 Verde: stock > 2
- 🟡 Amarillo: stock 1–2
- 🔴 Rojo: sin stock (0)

### Vista móvil

Tarjetas por producto con rejilla de tallas expandible.

---

## 5. Venta

**Ruta:** `/venta`  
**Acceso:** Solo Admin

Registra la salida de un producto del inventario por venta. Flujo en 3 pasos:

**Paso 1 — Producto:** Buscar y seleccionar producto del catálogo activo.

**Paso 2 — Talla y ubicación:**
- Selector Tienda / Bodega (muestra stock disponible en cada una)
- Selector de talla con stock visible
- El sistema pre-selecciona Tienda si hay stock ahí

**Paso 3 — Detalle de venta:**
- Cantidad (máximo = stock disponible)
- Canal de venta: Tienda · Domicilio · Envío Nacional
- Precio de venta (pre-cargado del precio base del producto)
- Descuento opcional (se resta al precio)
- Método de pago: Efectivo · Nequi · Transferencia · Datáfono · Mixto
- Total calculado automáticamente: `(precio - descuento) × cantidad`

**Lo que genera:**
- Un registro en `movimientos` (tipo: salida, canal: venta_tienda/domicilio/envio_nacional)
- El stock se descuenta automáticamente

> ⚠️ Esta venta **no** queda registrada en Caja automáticamente. Para registrar cobros del día, usar la sección **Caja**.

---

## 6. Entrada de mercancía

**Ruta:** `/entrada`  
**Acceso:** Solo Admin

Registra la llegada de mercancía nueva (compra a proveedor).

**Flujo:**
1. Seleccionar producto
2. Elegir destino: Tienda o Bodega
3. Agregar tallas con sus cantidades (puede agregar múltiples tallas a la vez)
4. Confirmar

**Lo que genera:**
- Un registro `movimientos` por cada talla (tipo: entrada, canal: compra_proveedor)
- El stock sube automáticamente en la ubicación seleccionada

---

## 7. Traslado

**Ruta:** `/traslado`  
**Acceso:** Solo Admin

Mueve unidades entre Tienda ↔ Bodega.

**Flujo:**
1. Elegir dirección: Tienda → Bodega o Bodega → Tienda
2. Seleccionar producto
3. Seleccionar talla (muestra stock disponible en origen)
4. Cantidad (máximo = stock en origen)
5. Confirmar

**Lo que genera:**
- 2 registros `movimientos`: salida del origen + entrada al destino (ligados por canal: traslado)

---

## 8. Devolución

**Ruta:** `/devolucion`  
**Acceso:** Solo Admin

Registra que un cliente devuelve un producto.

**Flujo:**
1. Seleccionar producto
2. Elegir destino de la devolución: Tienda o Bodega
3. Seleccionar talla y cantidad
4. ¿Se hace reembolso? Sí / No
   - Si sí: ingresar monto y método de pago
5. Nota opcional (motivo de la devolución)
6. Confirmar

**Lo que genera:**
- Registro `movimientos` (tipo: devolucion, canal: cambio)
- El stock sube en la ubicación elegida

---

## 9. Cambio

**Ruta:** `/cambio`  
**Acceso:** Solo Admin

El cliente devuelve un producto y lleva otro a cambio. Puede haber diferencia de precio.

**Flujo:**

| Panel izquierdo (lo que devuelve) | Panel derecho (lo que lleva) |
|---|---|
| Buscar producto devuelto | Buscar producto nuevo |
| Talla devuelta | Tienda o Bodega |
| Precio que pagó | Talla nueva |
| | Precio nuevo |

- **Diferencia calculada automáticamente:**
  - Positiva → el cliente paga la diferencia (seleccionar método de pago)
  - Negativa → se le reembolsa al cliente
  - Cero → cambio sin costo

**Lo que genera:**
- 2 registros `movimientos` ligados por referencia `CAM-{timestamp}`:
  1. Devolucion del producto original (siempre vuelve a Tienda)
  2. Salida del producto nuevo desde la ubicación seleccionada

---

## 10. Apartados — Lista

**Ruta:** `/apartados`  
**Acceso:** Admin (edición) · Empleado (lectura)

Lista de todos los apartados agrupados por cliente/pedido.

### Filtros

- Búsqueda por nombre de cliente o referencia
- Pestañas de estado: **Pendiente** · **Entregado** · **Cancelado**

### Tarjetas

Cada tarjeta muestra:
- Nombre del cliente
- Artículo(s) apartados (referencia + talla, o lista si son varios)
- Fecha de creación
- Saldo pendiente (en rojo) o badge de estado (Entregado / Cancelado)
- Badge numérico si el pedido tiene más de 1 prenda

**Solo Admin:** botón "Nuevo" para crear un apartado.

---

## 11. Apartados — Detalle

**Ruta:** `/apartados/[id]`  
**Acceso:** Admin (edición) · Empleado (lectura)

### Información mostrada (todos los roles)

- Nombre y teléfono del cliente (con botón para llamar)
- Fecha del apartado
- Lista de prendas con: referencia, talla, precio, estado, badge "En tienda" o "Pendiente de llegada"

### Información financiera (solo Admin)

- Precio total
- Total abonado
- **Saldo pendiente** (en rojo si debe, verde si está al día)
- Historial completo de abonos (monto, método, fecha)

### Acciones (solo Admin, solo si el apartado está pendiente)

| Acción | Descripción |
|---|---|
| **Registrar abono** | Abre modal para registrar pago parcial o total. Si hay caja abierta, el abono se registra también como ingreso en caja. |
| **Agregar prenda** | Añadir más artículos al pedido existente. Permite seleccionar si viene del inventario o si hay que pedirlo al proveedor. |
| **Marcar recibida** | Para prendas "Pendiente de llegada": marca que llegaron del proveedor. No mueve inventario (la prenda va directo al cliente). |
| **Editar prenda** | Cambiar talla o estado En tienda/Pendiente de cada prenda. Ajusta el inventario si cambia el estado. |
| **Quitar prenda** | Elimina una prenda del pedido. Si estaba en inventario, la devuelve. Solo disponible si hay más de 1 prenda. |
| **Marcar entregado** | Cierra el apartado. Solo posible cuando saldo = $0. |
| **Cancelar apartado** | Cancela todas las prendas pendientes. Devuelve al inventario las que estaban en tienda. |

---

## 12. Apartados — Nuevo

**Ruta:** `/apartados/nuevo`  
**Acceso:** Solo Admin

Crea un apartado nuevo para un cliente.

**Flujo:**

1. **Cliente:** Escribir nombre → el sistema busca clientes existentes con ese nombre.
   - Si existe: seleccionar de la lista (auto-completa teléfono)
   - Si no existe: se crea automáticamente con el nombre y teléfono ingresados
   - Teléfono: opcional, debe ser 10 dígitos

2. **Prendas:** Agregar una o más prendas al carrito:
   - Buscar producto → seleccionar talla → precio (pre-cargado, editable) → cantidad
   - Toggle: ¿Está en tienda o hay que pedirla al proveedor?
   - Si no hay stock en ninguna talla, se marca automáticamente como "Pedir al proveedor"

3. **Abono inicial:** Opcional. Si se registra, requiere método de pago.

4. **Crear pedido** → Pantalla de confirmación.

**Lo que genera:**
- Registro(s) en `clientes` (si es nuevo)
- Un registro `apartados` por cada unidad (cada cantidad = una fila separada)
- Todos los registros del mismo pedido comparten el mismo `grupo_id`
- Si hay prendas en tienda: registros `movimientos` (salida, canal: ajuste)
- Si hay abono: registro en `abonos` + registro en `registros_caja` si hay caja abierta

---

## 13. Caja

**Ruta:** `/caja`  
**Acceso:** Solo Admin

Centro de control financiero del día.

### Panel de resumen (tarjetas)

| Tarjeta | Qué muestra |
|---|---|
| Ventas | Total del día |
| Efectivo | Solo ventas en efectivo |
| Transferencias | Solo ventas por transferencia |
| Comisiones | $1.000 por unidad en artículos > $25.000 |

### Tarjeta azul principal

- **Caja abierta:** muestra "Debe haber en caja" = saldo inicial + ventas efectivo + ingresos efectivo − gastos efectivo − guardado en caja fuerte
- **Caja cerrada:** muestra el contado real registrado al cierre + comparación con lo esperado

### Registros del día

Lista de todas las transacciones con opción de eliminar (si la caja está abierta):
- **Ventas** (verde): producto, talla, valor, método de pago, desglose si es mixto
- **Gastos** (rojo): descripción, monto
- **Ingresos** (azul): descripción, monto
- **Caja fuerte** (amarillo): guardados y retiros

### Botones de acción

| Botón | Qué hace |
|---|---|
| **+ Venta** | Registra una venta con o sin producto del inventario |
| **+ Gasto** | Registra un egreso (almuerzo, servicios, etc.) |
| **+ Ingreso** | Registra dinero que entra sin ser venta (cambios, devoluciones de proveedores) |
| **Guardar en caja fuerte** | Saca dinero del conteo diario y lo guarda aparte |
| **Retiro de caja fuerte** | Trae dinero de vuelta desde el guardado |
| **Cerrar Caja** | Cierra el día con conteo físico de efectivo |

### Modal de venta en Caja

Tiene dos modos:

**Del inventario:**
- Buscar producto → seleccionar talla → cantidad → precio → método de pago
- Descuenta del stock automáticamente
- Soporta pago mixto (efectivo + transferencia)

**Artículo libre:**
- Para llaveros, gorras, manillas, billeteras u otros artículos sin inventario
- Ingresar: descripción + precio unitario + cantidad + método de pago
- **No mueve inventario**
- Se registra como venta en el cierre del día

### Cierre de caja

1. Clic en "Cerrar Caja"
2. Modal muestra desglose: saldo inicial + ventas + ingresos − gastos − guardado = debe haber
3. Ingresar contado real (cuánto hay físicamente)
4. Confirmar → caja queda cerrada
5. Se puede descargar el reporte como imagen PNG

### Modo offline

Si no hay conexión a internet:
- Las ventas se guardan localmente (localStorage)
- Se muestran con badge "pendiente"
- Al recuperar conexión: botón "Sincronizar" sube los registros pendientes

---

## 14. Historial de caja — Lista

**Ruta:** `/caja/historial`  
**Acceso:** Admin y Empleado

Lista los últimos 60 cierres de caja.

- **Admin:** ve fecha, cantidad de ventas, total en dinero, desglose de transferencias
- **Empleado:** ve fecha y cantidad de ventas (sin montos)

Clic en cualquier cierre abre el detalle.

---

## 15. Historial de caja — Detalle

**Ruta:** `/caja/historial/[id]`  
**Acceso:** Admin y Empleado

Resumen completo de un día específico.

### Secciones

- **KPIs:** Ventas totales · Ventas efectivo · Ventas transferencia · Comisiones estimadas
- **Tabla de ventas:** Cantidad · Producto · Talla · Valor · Método de pago
  - Pago mixto: muestra desglose efectivo + transferencia debajo de cada fila
- **Gastos del día**
- **Ingresos extra**
- **Movimientos de caja fuerte**
- **Liquidación final:** Saldo inicial + entradas − salidas = debe haber en caja

### Descarga

Botón "Descargar reporte" → genera imagen PNG con toda la información del día (incluyendo logo de la tienda).

---

## 16. Productos — Lista

**Ruta:** `/productos`  
**Acceso:** Solo Admin

Lista todos los productos del catálogo.

- Búsqueda por referencia o categoría
- Muestra: referencia, línea, categoría, sistema de talla, estado activo/inactivo
- Toggle rápido para activar/desactivar sin entrar al detalle
- Clic para ir al detalle y editar

---

## 17. Productos — Detalle / Editar

**Ruta:** `/productos/[id]`  
**Acceso:** Solo Admin

Editar un producto existente.

Campos editables:
- Referencia / nombre
- Línea
- Categoría (con opción de crear una nueva inline)
- Sistema de talla: Ropa adulto (XS–2XL) · Ropa niño (0–16) · Calzado (34–42) · Talla única
- Precio base

> El sistema de talla determina qué tallas aparecen disponibles cuando se hace una venta, entrada o apartado de ese producto.

---

## 18. Productos — Nuevo

**Ruta:** `/productos/nuevo`  
**Acceso:** Solo Admin

Crea un producto nuevo en el catálogo.

Campos requeridos: referencia, línea, categoría, sistema de talla, precio base.

> Crear el producto **no agrega stock**. Después de crearlo hay que ir a **Entrada** para registrar las unidades que llegaron.

---

## 19. Reportes

**Ruta:** `/reportes`  
**Acceso:** Admin y Empleado

Análisis de ventas por período.

### Selector de período
7 días · 30 días · 90 días

### KPIs
- Ingresos totales del período
- Gastos totales
- Días con caja abierta
- Promedio de ventas por día

### Top productos
Ranking de los 10 productos más vendidos por ingresos. Muestra referencia, unidades vendidas, total en pesos, y barra proporcional.

### Cierres de caja
Tabla con: fecha · cantidad de ventas · efectivo · transferencias · gastos · total. Fila de totales al final.

### Métodos de pago
Desglose de ventas por método: efectivo, nequi, transferencia, datáfono, mixto. Porcentaje del total y barra de color por método.

### Resumen del período (tarjeta azul)
- Días activos
- Venta promedio por día
- Total gastos
- **Neto (ventas − gastos)**

---

## 20. Estructura de la base de datos

### Tablas principales

| Tabla | Descripción |
|---|---|
| `productos` | Catálogo de productos (referencia, línea, categoría, sistema de talla, precio base) |
| `lineas` | Líneas de producto (ej: Masculino, Femenino, Niños) |
| `categorias` | Categorías (ej: Camiseta, Buso, Pantaloneta) |
| `tallas` | Tallas disponibles por sistema (XS, S, M, L, XL…) |
| `ubicaciones` | Tienda (id=1) y Bodega (id=2) |
| `stock` | Stock actual por producto + talla + ubicación |
| `movimientos` | Historial de todos los movimientos de inventario |
| `clientes` | Directorio de clientes con nombre y teléfono |
| `apartados` | Prendas apartadas por clientes (una fila = una unidad) |
| `abonos` | Pagos realizados hacia un apartado |
| `caja_diaria` | Registro de cada día de caja (apertura/cierre) |
| `registros_caja` | Transacciones individuales dentro de un día de caja |
| `gastos` | Egresos del día |

### Vistas (Views)

| Vista | Descripción |
|---|---|
| `v_stock_total` | Stock consolidado por producto/talla con totales tienda/bodega |
| `v_stock_bajo` | Productos con stock bajo el umbral de alerta |
| `v_apartados_pendientes` | Apartados activos con datos del cliente y saldos calculados |
| `v_resumen_caja_hoy` | Resumen de ventas del día actual por método de pago |
| `v_resumen_caja` | Historial de cierres con totales calculados |

### Tipos de movimiento

| Campo | Valores |
|---|---|
| `tipo` | `entrada` · `salida` · `devolucion` |
| `canal` | `venta_tienda` · `domicilio` · `envio_nacional` · `traslado` · `cambio` · `garantia` · `ajuste` · `compra_proveedor` |

---

## 21. Pendientes / posibles mejoras

Esta sección es para identificar funcionalidades que podrían faltar o mejorarse:

### Funcionalidades que podrían agregarse

- [ ] **Clientes — pantalla dedicada:** ver historial de compras y apartados por cliente
- [ ] **Garantías:** flujo específico para recibir productos con defecto de fábrica (actualmente el canal existe en DB pero no hay pantalla)
- [ ] **Domicilios y envíos:** el canal existe pero no hay seguimiento del estado del envío
- [ ] **Múltiples empleados:** actualmente solo hay un perfil de empleado; podría expandirse
- [ ] **Notificaciones de stock bajo:** alerta automática cuando un producto baja del umbral
- [ ] **Descuentos por prenda en apartados:** actualmente el precio se edita manualmente
- [ ] **Exportar reportes a Excel/PDF:** actualmente solo se exporta la imagen del cierre de caja
- [ ] **Cámara para escanear productos:** buscar producto por código de barras
- [ ] **Historial de movimientos por producto:** ver todas las entradas/salidas de una referencia específica

### Posibles ajustes operativos

- [ ] Definir el umbral de stock bajo (actualmente en la DB)
- [x] Comisiones de $1.000 por unidad aplican solo a productos con precio unitario ≥ $30.000
- [ ] Confirmar si los artículos libres (sin inventario) deben tener algún reporte separado
- [ ] Evaluar si agregar categorías de gastos más específicas en el módulo de caja
