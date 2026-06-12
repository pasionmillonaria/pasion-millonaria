import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Carga .env.local en process.env para que los tests puedan leer las
 * credenciales del laboratorio local (URL + anon key) y consultar la base
 * por REST. Next.js ya lo carga para la app; esto es solo para el proceso
 * de Playwright. Parser minimo, sin dependencias.
 */
function cargarEnvLocal() {
  try {
    const contenido = readFileSync(resolve(__dirname, ".env.local"), "utf8");
    for (const linea of contenido.split("\n")) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith("#")) continue;
      const i = limpia.indexOf("=");
      if (i === -1) continue;
      const clave = limpia.slice(0, i).trim();
      const valor = limpia.slice(i + 1).trim();
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  } catch {
    // si no existe .env.local, los helpers usan los valores por defecto del lab
  }
}
cargarEnvLocal();

/**
 * Configuracion de tests E2E (Playwright).
 *
 * Corren contra el LABORATORIO LOCAL: Playwright levanta la app con `npm run dev`
 * (que usa .env.local apuntando a la base local de Docker) y prueba sobre
 * http://localhost:3000. Nunca toca staging ni produccion.
 *
 * Requisito: tener el stack local de Supabase corriendo (`npx supabase start`).
 */
export default defineConfig({
  testDir: "./e2e",
  // Reinicia el laboratorio al seed antes de toda la suite (tests repetibles).
  globalSetup: "./e2e/global-setup.ts",
  // Falla la suite si alguien deja un test.only por error.
  forbidOnly: !!process.env.CI,
  // Reintentos solo en CI; en local, cero para ver el fallo de una.
  retries: process.env.CI ? 1 : 0,
  // Un solo worker: los tests comparten la misma base local, así no se pisan.
  workers: 1,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3000",
    // Fija el navegador en UTC para que la fecha local del navegador coincida
    // con CURRENT_DATE de la base (UTC). Asi el seed (que crea la caja del dia
    // con CURRENT_DATE) y la app (que usa la fecha local) hablan del mismo dia.
    timezoneId: "UTC",
    // Captura traza y screenshot solo cuando un test falla, para depurar.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Arranca la app automaticamente antes de los tests.
  // Si ya tienes `npm run dev` corriendo, reutiliza ese servidor.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
