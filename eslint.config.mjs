import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier/flat";

// Frontera entre módulos (docs/architecture/RepositoryStructure.md).
// ESLint reemplaza la configuración de una regla cuando otro bloque aplica
// a los mismos archivos, así que cada bloque repite las prohibiciones generales.

const moduleInternals = {
  group: ["@/modules/*/**"],
  message: "Importá solo la interfaz pública del módulo: @/modules/<modulo>.",
};

const moduleInternalsExceptSchema = {
  group: ["@/modules/*/**", "!@/modules/*/schema"],
  message:
    "Solo se permite importar el schema de otro módulo; el resto, por su interfaz pública.",
};

const leaveModuleRelative = {
  group: ["../*", "../**"],
  message:
    "No uses rutas relativas que salgan del módulo: importá por @/modules/<modulo>.",
};

const httpAndPresentation = {
  group: ["next", "next/*", "@/app/*"],
  message: "El dominio no conoce HTTP ni presentación (Overview.md).",
};

// analytics puede leer esquemas ajenos para calcular métricas, pero no el de auth:
// la tabla users se lee por organizations.getMemberSummaries, que interseca contra
// organization_members en SQL (H-1, 9.0.1). La guarda user-summaries-entry-point fija
// el punto de entrada contra el acceso literal; esta regla cierra la vía del esquema,
// que esa guarda declara como no cubierta (9.0.3, D-2).
const authSchema = {
  group: ["@/modules/auth/schema"],
  message:
    "No leas users por su esquema: pasá por organizations.getMemberSummaries.",
};

const anyModule = {
  group: ["@/modules/*", "@/modules/*/**"],
  message: "src/shared no importa módulos, para no crear ciclos.",
};

const restrict = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: restrict(moduleInternals),
  },
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    rules: restrict(moduleInternals, leaveModuleRelative),
  },
  {
    files: [
      "src/modules/catalog/**/*.{ts,tsx}",
      "src/modules/crm/**/*.{ts,tsx}",
      "src/modules/conversations/**/*.{ts,tsx}",
      "src/modules/inventory/**/*.{ts,tsx}",
      "src/modules/knowledge/**/*.{ts,tsx}",
      // Desde la 19.2 (revisión independiente, R-2).
      "src/modules/orders/**/*.{ts,tsx}",
      "src/modules/numbering/**/*.{ts,tsx}",
    ],
    rules: restrict(moduleInternals, leaveModuleRelative, httpAndPresentation),
  },
  {
    files: ["src/modules/*/schema.ts"],
    rules: restrict(
      moduleInternalsExceptSchema,
      leaveModuleRelative,
      httpAndPresentation,
    ),
  },
  {
    files: ["src/modules/analytics/**/*.{ts,tsx}"],
    rules: restrict(
      moduleInternalsExceptSchema,
      authSchema,
      leaveModuleRelative,
      httpAndPresentation,
    ),
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: restrict(anyModule),
  },
  prettier,
]);
