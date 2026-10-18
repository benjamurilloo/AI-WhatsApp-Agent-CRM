import type { Profile } from "./index";

// Perfil de la venta de iPhone (ADR 0024; brief-29.2, D-8). Versión 1, del 2026-10-18. Capacidad y
// color son de variante; «Trae caja» es un dato que solo se muestra. Una sola lista de colores para
// todos los modelos, del iPhone 11 en adelante (D-7): opciones por modelo quedan como mejora. Sin
// modelos: los modelos son de cada negocio.
export const IPHONE_PROFILE: Profile = {
  name: "iphone",
  label: "Venta de iPhone",
  capabilities: ["variants"],
  attributes: [
    {
      key: "capacidad",
      name: "Capacidad",
      type: "option",
      isRequired: true,
      isVariant: true,
      options: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"],
    },
    {
      key: "color",
      name: "Color",
      type: "option",
      isRequired: true,
      isVariant: true,
      options: [
        "Negro",
        "Blanco",
        "Azul",
        "Rojo",
        "Verde",
        "Violeta",
        "Amarillo",
        "Rosa",
        "Medianoche",
        "Blanco estelar",
        "Grafito",
        "Plata",
        "Dorado",
        "Azul Sierra",
        "Morado oscuro",
        "Titanio natural",
        "Titanio negro",
        "Titanio blanco",
        "Titanio azul",
        "Titanio desierto",
        "Ultramarino",
        "Verde azulado",
      ],
    },
    {
      key: "trae_caja",
      name: "Trae caja",
      type: "boolean",
      isRequired: false,
      isVariant: false,
      options: [],
    },
  ],
};
