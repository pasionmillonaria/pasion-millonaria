import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  crearTokenSesionAdmin,
} from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  const adminPin = process.env.ADMIN_PIN;

  if (!adminPin) {
    return NextResponse.json({ error: "ADMIN_PIN no esta configurado" }, { status: 500 });
  }

  if (pin === adminPin) {
    const response = NextResponse.json({ valid: true });
    const token = crearTokenSesionAdmin();
    if (token) {
      response.cookies.set(ADMIN_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ADMIN_SESSION_MAX_AGE,
      });
    }
    return response;
  }
  return NextResponse.json({ valid: false }, { status: 401 });
}
