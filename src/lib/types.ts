export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Rol = "admin" | "empleado";
export type TipoMovimiento = "entrada" | "salida" | "devolucion";
export type CanalMovimiento =
  | "venta_tienda"
  | "domicilio"
  | "envio_nacional"
  | "traslado"
  | "cambio"
  | "garantia"
  | "ajuste"
  | "compra_proveedor";
export type MetodoPago =
  | "efectivo"
  | "nequi"
  | "transferencia"
  | "datafono"
  | "mixto";
export type EstadoApartado = "pendiente" | "entregado" | "cancelado";
export type EstadoCaja = "abierta" | "cerrada";
export type SistemaTalla =
  | "ropa_adulto"
  | "ropa_nino"
  | "calzado"
  | "unica";
export type TipoUbicacion = "tienda" | "bodega";
export type CategoriaGasto =
  | "alimentacion"
  | "transporte"
  | "insumos"
  | "servicios"
  | "caja_fuerte"
  | "otro";

export interface Database {
  public: {
    Tables: {
      usuarios: {
        Row: {
          id: string;
          nombre: string;
          email: string;
          rol: Rol;
          activo: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["usuarios"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["usuarios"]["Row"]>;
      };
      lineas: {
        Row: {
          id: number;
          nombre: string;
          orden: number;
        };
        Insert: Omit<Database["public"]["Tables"]["lineas"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["lineas"]["Row"]>;
      };
      categorias: {
        Row: {
          id: number;
          nombre: string;
          linea_id: number;
          orden: number;
        };
        Insert: Omit<Database["public"]["Tables"]["categorias"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["categorias"]["Row"]>;
      };
      tallas: {
        Row: {
          id: number;
          nombre: string;
          sistema: SistemaTalla;
        };
        Insert: Omit<Database["public"]["Tables"]["tallas"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["tallas"]["Row"]>;
      };
      ubicaciones: {
        Row: {
          id: number;
          nombre: string;
          tipo: TipoUbicacion;
        };
        Insert: Omit<Database["public"]["Tables"]["ubicaciones"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["ubicaciones"]["Row"]>;
      };
      productos: {
        Row: {
          id: number;
          codigo: string;
          referencia: string;
          categoria_id: number;
          sistema_talla: SistemaTalla;
          precio_base: number;
          activo: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["productos"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["productos"]["Row"]>;
      };
      stock: {
        Row: {
          id: number;
          producto_id: number;
          talla_id: number;
          ubicacion_id: number;
          cantidad: number;
        };
        Insert: Omit<Database["public"]["Tables"]["stock"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["stock"]["Row"]>;
      };
      movimientos: {
        Row: {
          id: number;
          fecha: string;
          producto_id: number;
          talla_id: number;
          ubicacion_id: number;
          cantidad: number;
          tipo: TipoMovimiento;
          canal: CanalMovimiento;
          precio_venta: number | null;
          descuento: number | null;
          metodo_pago: MetodoPago | null;
          movimiento_ref: string | null;
          nota: string | null;
          usuario_id: string | null;
          ubicacion_destino_id: number | null;
        };
        Insert: Omit<Database["public"]["Tables"]["movimientos"]["Row"], "id" | "fecha">;
        Update: Partial<Database["public"]["Tables"]["movimientos"]["Row"]>;
      };
      clientes: {
        Row: {
          id: number;
          nombre: string;
          telefono: string | null;
          notas: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["clientes"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["clientes"]["Row"]>;
      };
      apartados: {
        Row: {
          id: number;
          fecha: string;
          cliente_id: number;
          producto_id: number;
          talla_id: number;
          precio: number;
          total_abonado: number;
          saldo: number;
          estado: EstadoApartado;
          en_tienda: boolean;
          observacion: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["apartados"]["Row"], "id" | "fecha" | "saldo">;
        Update: Partial<Database["public"]["Tables"]["apartados"]["Row"]>;
      };
      abonos: {
        Row: {
          id: number;
          apartado_id: number;
          monto: number;
          metodo_pago: MetodoPago;
          fecha: string;
          registrado_por: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["abonos"]["Row"], "id" | "fecha">;
        Update: Partial<Database["public"]["Tables"]["abonos"]["Row"]>;
      };
      caja_diaria: {
        Row: {
          id: number;
          fecha: string;
          saldo_inicial: number;
          total_efectivo: number;
          total_transferencias: number;
          total_datafono: number;
          total_nequi: number;
          total_descuentos: number;
          total_devoluciones: number;
          total_gastos: number;
          guardado_caja_fuerte: number;
          saldo_final: number;
          cantidad_ventas: number;
          estado: EstadoCaja;
        };
        Insert: Omit<Database["public"]["Tables"]["caja_diaria"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["caja_diaria"]["Row"]>;
      };
      gastos: {
        Row: {
          id: number;
          fecha: string;
          concepto: string;
          monto: number;
          categoria: CategoriaGasto;
          metodo_pago: MetodoPago;
          caja_diaria_id: number | null;
          registrado_por: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["gastos"]["Row"], "id" | "fecha">;
        Update: Partial<Database["public"]["Tables"]["gastos"]["Row"]>;
      };
    };
    Views: {
      v_stock_total: {
        Row: {
          producto_id: number;
          codigo: string;
          referencia: string;
          categoria: string;
          linea: string;
          talla: string;
          sistema_talla: SistemaTalla;
          stock_tienda: number;
          stock_bodega: number;
          stock_total: number;
        };
      };
      v_stock_bajo: {
        Row: {
          producto_id: number;
          codigo: string;
          referencia: string;
          categoria: string;
          linea: string;
          talla: string;
          stock_total: number;
        };
      };
      v_ventas_hoy: {
        Row: {
          id: number;
          fecha: string;
          producto_id: number;
          referencia: string;
          talla: string;
          cantidad: number;
          canal: CanalMovimiento;
          precio_venta: number | null;
          descuento: number | null;
          metodo_pago: MetodoPago | null;
          usuario_id: string | null;
        };
      };
      v_apartados_pendientes: {
        Row: {
          id: number;
          fecha: string;
          cliente_nombre: string;
          cliente_telefono: string | null;
          referencia: string;
          talla: string;
          precio: number;
          total_abonado: number;
          saldo: number;
          estado: EstadoApartado;
        };
      };
      v_resumen_caja_hoy: {
        Row: {
          metodo_pago: MetodoPago;
          total: number;
          cantidad: number;
        };
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Tipos derivados útiles
export type Usuario = Database["public"]["Tables"]["usuarios"]["Row"];
export type Linea = Database["public"]["Tables"]["lineas"]["Row"];
export type Categoria = Database["public"]["Tables"]["categorias"]["Row"];
export type Talla = Database["public"]["Tables"]["tallas"]["Row"];
export type Ubicacion = Database["public"]["Tables"]["ubicaciones"]["Row"];
export type Producto = Database["public"]["Tables"]["productos"]["Row"];
export type Stock = Database["public"]["Tables"]["stock"]["Row"];
export type Movimiento = Database["public"]["Tables"]["movimientos"]["Row"];
export type Cliente = Database["public"]["Tables"]["clientes"]["Row"];
export type Apartado = Database["public"]["Tables"]["apartados"]["Row"];
export type Abono = Database["public"]["Tables"]["abonos"]["Row"];
export type CajaDiaria = Database["public"]["Tables"]["caja_diaria"]["Row"];
export type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

export type VStockTotal = Database["public"]["Views"]["v_stock_total"]["Row"];
export type VStockBajo = Database["public"]["Views"]["v_stock_bajo"]["Row"];
export type VApartadosPendientes = Database["public"]["Views"]["v_apartados_pendientes"]["Row"];
export type VResumenCajaHoy = Database["public"]["Views"]["v_resumen_caja_hoy"]["Row"];
