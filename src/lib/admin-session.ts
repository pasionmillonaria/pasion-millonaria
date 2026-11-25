import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "pm_admin_session";
export const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60;

function getSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function firmar(expira: string, secret: string): string {
  return createHmac("sha256", secret).update(expira).digest("base64url");
}

export function crearTokenSesionAdmin(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const expira = String(Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE);
  return `${expira}.${firmar(expira, secret)}`;
}

export function validarTokenSesionAdmin(token?: string): boolean {
  if (!token) return false;
  const secret = getSecret();
  if (!secret) return false;

  const [expira, firma, extra] = token.split(".");
  if (!expira || !firma || extra || !/^\d+$/.test(expira)) return false;
  if (Number(expira) <= Math.floor(Date.now() / 1000)) return false;

  const esperada = Buffer.from(firmar(expira, secret));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

export function tieneSesionAdmin(request: NextRequest): boolean {
  return validarTokenSesionAdmin(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export function origenPermitido(request: NextRequest): boolean {
  const origen = request.headers.get("origin");
  return !origen || origen === request.nextUrl.origin;
}

/**
 * Guard de las rutas destructivas. Devuelve la respuesta de rechazo, o null si
 * el solicitante tiene una sesion de administrador vigente.
 */
export function rechazarSiNoEsAdmin(request: NextRequest): NextResponse | null {
  if (!getSecret()) {
    return NextResponse.json(
      { error: "Configuración de servidor incompleta. Falta ADMIN_SESSION_SECRET." },
      { status: 503 },
    );
  }
  if (!origenPermitido(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  if (!tieneSesionAdmin(request)) {
    return NextResponse.json(
      { error: "Tu sesión de administrador venció. Sal y vuelve a entrar con tu PIN." },
      { status: 401 },
    );
  }
  return null;
}
