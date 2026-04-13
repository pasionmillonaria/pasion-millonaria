export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Rol = "admin" | "empleado";
export type TipoMovimiento = "entrada" | "salida" | "devolucion";
export type TipoRegistroCaja = "venta" | "gasto" | "ingreso" | "caja_fuerte";
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
          pin: string | null;
          rol: Rol;
          activo: boolean;
        };
        Insert: {
          nombre: string;
          pin?: string | null;
          rol?: Rol;
          activo?: boolean;
        };
        Update: {
          nombre?: string;
          pin?: string | null;
          rol?: Rol;
          activo?: boolean;
        };
        Relationships: [];
      };
      lineas: {
        Row: {
          id: number;
          nombre: string;
          orden: number;
        };
        Insert: {
          nombre: string;
          orden?: number;
        };
        Update: {
          nombre?: string;
          orden?: number;
        };
        Relationships: [];
      };
      categorias: {
        Row: {
          id: number;
          nombre: string;
          orden: number;
        };
        Insert: {
          nombre: string;
          orden?: number;
        };
        Update: {
          nombre?: string;
          orden?: number;
        };
        Relationships: [];
      };
      tallas: {
        Row: {
          id: number;
          nombre: string;
          sistema: SistemaTalla;
          orden: number;
        };
        Insert: {
          nombre: string;
          sistema: SistemaTalla;
          orden?: number;
        };
        Update: {
          nombre?: string;
          sistema?: SistemaTalla;
          orden?: number;
        };
        Relationships: [];
      };
      ubicaciones: {
        Row: {
          id: number;
          nombre: string;
          tipo: TipoUbicacion;
        };
        Insert: {
          nombre: string;
          tipo: TipoUbicacion;
        };
        Update: {
          nombre?: string;
          tipo?: TipoUbicacion;
        };
        Relationships: [];
      };
      productos: {
        Row: {
          id: number;
          codigo: string;
          referencia: string;
          linea_id: number;
          categoria_id: number;
          sistema_talla: SistemaTalla;
          precio_base: number;
          activo: boolean;
        };
        Insert: {
          codigo: string;
          referencia: string;
          linea_id: number;
          categoria_id: number;
          sistema_talla: SistemaTalla;
          precio_base: number;
          activo?: boolean;
        };
        Update: {
          codigo?: string;
          referencia?: string;
          linea_id?: number;
          categoria_id?: number;
          sistema_talla?: SistemaTalla;
          precio_base?: number;
          activo?: boolean;
        };
        Relationships: [];
      };
      stock: {
        Row: {
          id: number;
          producto_id: number;
          talla_id: number;
          ubicacion_id: number;
          cantidad: number;
        };
        Insert: {
          producto_id: number;
          talla_id: number;
          ubicacion_id: number;
          cantidad?: number;
        };
        Update: {
          producto_id?: number;
          talla_id?: number;
          ubicacion_id?: number;
          cantidad?: number;
        };
        Relationships: [];
      };
      movimientos: {
        Row: {
          id: number;
          fecha: string;
          producto_id: number;
          talla_id: number;
          ubicacion_id: number;
          ubicacion_destino_id: number | null;
          cantidad: number;
          tipo: TipoMovimiento;
          canal: CanalMovimiento;
          precio_venta: number | null;
          descuento: number | null;
          metodo_pago: MetodoPago | null;
          movimiento_ref: string | null;
          nota: string | null;
          usuario_id: string | null;
          caja_diaria_id: number | null;
        };
        Insert: {
          producto_id: number;
          talla_id: number;
          ubicacion_id: number;
          cantidad: number;
          tipo: TipoMovimiento;
          canal: CanalMovimiento;
          ubicacion_destino_id?: number | null;
          precio_venta?: number | null;
          descuento?: number | null;
          metodo_pago?: MetodoPago | null;
          movimiento_ref?: string | null;
          nota?: string | null;
          usuario_id?: string | null;
          caja_diaria_id?: number | null;
        };
        Update: {
          producto_id?: number;
          talla_id?: number;
          ubicacion_id?: number;
          cantidad?: number;
          tipo?: TipoMovimiento;
          canal?: CanalMovimiento;
          ubicacion_destino_id?: number | null;
          precio_venta?: number | null;
          descuento?: number | null;
          metodo_pago?: MetodoPago | null;
          movimiento_ref?: string | null;
          nota?: string | null;
          usuario_id?: string | null;
          caja_diaria_id?: number | null;
        };
        Relationships: [];
      };
      clientes: {
        Row: {
          id: number;
          nombre: string;
          telefono: string | null;
          notas: string | null;
        };
        Insert: {
          nombre: string;
          telefono?: string | null;
          notas?: string | null;
        };
        Update: {
          nombre?: string;
          telefono?: string | null;
          notas?: string | null;
        };
        Relationships: [];
      };
      apartados: {
        Row: {
          id: number;
          fecha: string;
          grupo_id: number | null;
          cliente_id: number;
          producto_id: number;
          talla_id: number;
          precio: number;
          estado: EstadoApartado;
          en_tienda: boolean;
          observacion: string | null;
          usuario_id: string | null;
        };
        Insert: {
          grupo_id?: number | null;
          cliente_id: number;
          producto_id: number;
          talla_id: number;
          precio: number;
          estado?: EstadoApartado;
          en_tienda?: boolean;
          observacion?: string | null;
          usuario_id?: string | null;
        };
        Update: {
          grupo_id?: number | null;
          cliente_id?: number;
          producto_id?: number;
          talla_id?: number;
          precio?: number;
          estado?: EstadoApartado;
          en_tienda?: boolean;
          observacion?: string | null;
          usuario_id?: string | null;
        };
        Relationships: [];
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
        Insert: {
          apartado_id: number;
          monto: number;
          metodo_pago: MetodoPago;
          registrado_por?: string | null;
        };
        Update: {
          apartado_id?: number;
          monto?: number;
          metodo_pago?: MetodoPago;
          registrado_por?: string | null;
        };
        Relationships: [];
      };
      caja_diaria: {
        Row: {
          id: number;
          fecha: string;
          saldo_inicial: number;
          guardado_caja_fuerte: number;
          efectivo_contado: number | null;
          diferencia_caja: number | null;
          estado: EstadoCaja;
          usuario_apertura: string | null;
          usuario_cierre: string | null;
          notas: string | null;
        };
        Insert: {
          fecha: string;
          saldo_inicial?: number;
          guardado_caja_fuerte?: number;
          efectivo_contado?: number | null;
          diferencia_caja?: number | null;
          estado?: EstadoCaja;
          usuario_apertura?: string | null;
          usuario_cierre?: string | null;
          notas?: string | null;
        };
        Update: {
          fecha?: string;
          saldo_inicial?: number;
          guardado_caja_fuerte?: number;
          efectivo_contado?: number | null;
          diferencia_caja?: number | null;
          estado?: EstadoCaja;
          usuario_apertura?: string | null;
          usuario_cierre?: string | null;
          notas?: string | null;
        };
        Relationships: [];
      };
      registros_caja: {
        Row: {
          id: number;
          caja_diaria_id: number;
          movimiento_id: number | null;
          fecha: string;
          hora: string;
          tipo: TipoRegistroCaja;
          descripcion: string | null;
          valor: number;
          metodo_pago: string | null;
          monto_efectivo: number;
          monto_transferencia: number;
          usuario_id: string | null;
          created_at: string;
        };
        Insert: {
          caja_diaria_id: number;
          movimiento_id?: number | null;
          fecha: string;
          hora?: string;
          tipo: TipoRegistroCaja;
          descripcion?: string | null;
          valor: number;
          metodo_pago?: string | null;
          monto_efectivo?: number;
          monto_transferencia?: number;
          usuario_id?: string | null;
        };
        Update: {
          caja_diaria_id?: number;
          movimiento_id?: number | null;
          fecha?: string;
          hora?: string;
          tipo?: TipoRegistroCaja;
          descripcion?: string | null;
          valor?: number;
          metodo_pago?: string | null;
          monto_efectivo?: number;
          monto_transferencia?: number;
          usuario_id?: string | null;
        };
        Relationships: [];
      };
      gastos: {
        Row: {
          id: number;
          caja_diaria_id: number | null;
          fecha: string;
          concepto: string;
          monto: number;
          categoria: CategoriaGasto;
          metodo_pago: MetodoPago;
          registrado_por: string | null;
        };
        Insert: {
          caja_diaria_id?: number | null;
          concepto: string;
          monto: number;
          categoria: CategoriaGasto;
          metodo_pago: MetodoPago;
          registrado_por?: string | null;
        };
        Update: {
          caja_diaria_id?: number | null;
          concepto?: string;
          monto?: number;
          categoria?: CategoriaGasto;
          metodo_pago?: MetodoPago;
          registrado_por?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      v_stock_total: {
        Row: {
          producto_id: number;
          codigo: string;
          referencia: string;
          linea_id: number;
          linea: string;
          categoria: string;
          talla: string;
          talla_id: number;
          sistema_talla: SistemaTalla;
          stock_tienda: number;
          stock_bodega: number;
          stock_total: number;
        };
        Relationships: [];
      };
      v_stock_bajo: {
        Row: {
          producto_id: number;
          codigo: string;
          referencia: string;
          linea_id: number;
          linea: string;
          categoria: string;
          talla: string;
          talla_id: number;
          sistema_talla: SistemaTalla;
          stock_tienda: number;
          stock_bodega: number;
          stock_total: number;
        };
        Relationships: [];
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
        Relationships: [];
      };
      v_apartados_pendientes: {
        Row: {
          id: number;
          fecha: string;
          grupo_id: number | null;
          cliente_nombre: string;
          cliente_telefono: string | null;
          referencia: string;
          talla: string;
          precio: number;
          total_abonado: number;
          saldo: number;
          estado: EstadoApartado;
          en_tienda: boolean;
          observacion: string | null;
        };
        Relationships: [];
      };
      v_resumen_caja_hoy: {
        Row: {
          metodo_pago: MetodoPago;
          total: number;
          cantidad: number;
        };
        Relationships: [];
      };
      v_resumen_caja: {
        Row: {
          id: number;
          fecha: string;
          saldo_inicial: number;
          guardado_caja_fuerte: number;
          efectivo_contado: number | null;
          diferencia_caja: number | null;
          estado: EstadoCaja;
          notas: string | null;
          total_efectivo: number;
          total_transferencias: number;
          total_gastos: number;
          total_ingresos: number;
          cantidad_ventas: number;
          saldo_final: number;
        };
        Relationships: [];
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
export type RegistroCaja = Database["public"]["Tables"]["registros_caja"]["Row"];

export type VStockTotal = Database["public"]["Views"]["v_stock_total"]["Row"];
export type VStockBajo = Database["public"]["Views"]["v_stock_bajo"]["Row"];
export type VApartadosPendientes = Database["public"]["Views"]["v_apartados_pendientes"]["Row"];
export type VResumenCajaHoy = Database["public"]["Views"]["v_resumen_caja_hoy"]["Row"];
export type VResumenCaja = Database["public"]["Views"]["v_resumen_caja"]["Row"];
