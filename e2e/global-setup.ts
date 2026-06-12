import { execSync } from "node:child_process";

/**
 * Se ejecuta UNA vez antes de toda la suite.
 *
 * Reinicia el laboratorio local a los datos del seed (`supabase db reset`),
 * para que los tests sean repetibles y deterministas: cada corrida arranca con
 * stock fresco (10 uds del producto de prueba) y la caja del día abierta.
 *
 * Requiere Docker + el stack local corriendo (`npx supabase start`).
 * OJO: esto BORRA los datos actuales del LABORATORIO LOCAL y los reemplaza por
 * el seed. No toca staging ni producción.
 *
 * `db reset` a veces falla esperando a que el contenedor de storage termine de
 * reiniciar (problema transitorio): por eso reintentamos un par de veces.
 */
export default function globalSetup() {
  const intentos = 3;
  for (let i = 1; i <= intentos; i++) {
    try {
      console.log(`\n[playwright] Reiniciando laboratorio local (supabase db reset) — intento ${i}/${intentos}...`);
      execSync("npx supabase db reset", { stdio: "inherit", timeout: 240_000 });
      console.log("[playwright] Laboratorio listo.\n");
      return;
    } catch (err) {
      if (i === intentos) {
        console.error("[playwright] No se pudo reiniciar el laboratorio. ¿Está corriendo `npx supabase start`?");
        throw err;
      }
      console.warn("[playwright] Reset falló (probable contenedor reiniciando); reintentando en 5s...");
      execSync(process.platform === "win32" ? "ping -n 6 127.0.0.1 > NUL" : "sleep 5");
    }
  }
}
