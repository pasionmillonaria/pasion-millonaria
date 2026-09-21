export interface ProductoBuscable {
  codigo: string;
  referencia: string;
  categoria_nombre: string;
  linea_nombre: string;
}

export function normalizarBusqueda(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function distanciaMaximaUno(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const corta = a.length <= b.length ? a : b;
  const larga = a.length <= b.length ? b : a;
  let i = 0; let j = 0; let diferencias = 0;
  while (i < corta.length && j < larga.length) {
    if (corta[i] === larga[j]) { i += 1; j += 1; continue; }
    diferencias += 1;
    if (diferencias > 1) return false;
    if (corta.length === larga.length) i += 1;
    j += 1;
  }
  return diferencias + Number(i < corta.length || j < larga.length) <= 1;
}

function puntuarToken(consulta: string, palabras: string[]) {
  if (palabras.some(palabra => palabra === consulta)) return 0;
  if (palabras.some(palabra => palabra.startsWith(consulta))) return 1;
  if (palabras.some(palabra => palabra.includes(consulta))) return 2;
  if (consulta.length >= 4 && palabras.some(palabra => distanciaMaximaUno(consulta, palabra))) return 4;
  return null;
}

export function puntuarProducto(producto: ProductoBuscable, consulta: string) {
  const query = normalizarBusqueda(consulta);
  if (!query) return 0;
  const referencia = normalizarBusqueda(producto.referencia);
  const codigo = normalizarBusqueda(producto.codigo);
  const texto = normalizarBusqueda([producto.referencia, producto.codigo, producto.categoria_nombre, producto.linea_nombre].join(" "));
  const palabras = texto.split(" ").filter(Boolean);
  if (codigo === query) return 0;
  if (referencia === query) return 1;
  if (referencia.startsWith(query) || codigo.startsWith(query)) return 2;
  if (texto.includes(query)) return 3;
  const puntajes = query.split(" ").map(token => puntuarToken(token, palabras));
  if (puntajes.some(puntaje => puntaje === null)) return null;
  return 10 + puntajes.reduce<number>((total, puntaje) => total + (puntaje ?? 0), 0);
}

export function buscarProductos<T extends ProductoBuscable>(productos: T[], consulta: string, limite?: number) {
  const ordenados = productos.map(producto => ({ producto, puntaje: puntuarProducto(producto, consulta) }))
    .filter((item): item is { producto: T; puntaje: number } => item.puntaje !== null)
    .sort((a, b) => a.puntaje - b.puntaje || a.producto.referencia.localeCompare(b.producto.referencia, "es"))
    .map(item => item.producto);
  return limite ? ordenados.slice(0, limite) : ordenados;
}
