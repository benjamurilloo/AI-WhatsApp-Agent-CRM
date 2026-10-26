import type { Profile } from "./index";

// Perfil de la venta de iPhone (ADR 0024; brief-29.2, D-8). Versión 1, del 2026-10-18. Capacidad y
// color son de variante; «Trae caja» es un dato que solo se muestra. Una sola lista de colores para
// todos los modelos, del iPhone 11 en adelante (D-7): opciones por modelo quedan como mejora. Sin
// modelos: los modelos son de cada negocio.
//
// Versión 2, del 2026-10-19 (brief-29.5, D-5): suma serialized_units y los grados de las unidades,
// tres ejemplos que el negocio ajusta. Una organización que ya activó el perfil no los recibe sola:
// los recibe al activar serialized_units con el perfil.
//
// Versión 3, del 2026-10-20 (brief-29.6, D-1): suma repairs y seis tipos de reparación de ejemplo, sin
// precios. Al activar repairs con el perfil, el script crea también el producto de servicio.
//
// Versión 4, del 2026-10-21 (brief-29.7, D-1 y D-3): suma trade_ins y el checklist de un usado, diez
// puntos de ejemplo, dos de ellos obligatorios para aceptar el equipo. La batería no es un punto: es un
// dato de la recepción; y los daños estéticos van en el grado.
//
// Versión 5, del 2026-10-21 (brief-29.7.3, D-1 y D-3): suma los valores sueltos de la cotización, de
// ejemplo (batería bajo 80 %, rango del 10 %, redondeo de 10 USD, la batería con «Cambio de batería»), y
// el tipo de reparación de cuatro puntos. Sin márgenes: son por modelo, y los modelos son de cada
// negocio (U-3). Una organización que ya tiene trade_ins los recibe al volver a correr el script (U-4).
//
// Versión 6, del 2026-10-26 (brief-29.10, D-1 y U-3): suma appointments, con franjas de 30 minutos, un
// turno por franja y cinco motivos de ejemplo, respondidos por el usuario. Una organización que ya activó
// el perfil los recibe al volver a correr el script.
export const IPHONE_PROFILE: Profile = {
  name: "iphone",
  label: "Venta de iPhone",
  capabilities: [
    "variants",
    "serialized_units",
    "repairs",
    "trade_ins",
    "appointments",
  ],
  tradeInChecklist: [
    {
      name: "Cámara trasera",
      isMandatory: false,
      repairType: "Cámara trasera",
    },
    {
      name: "Cámara frontal",
      isMandatory: false,
      repairType: "Cámara frontal",
    },
    { name: "Micrófono", isMandatory: false },
    { name: "True Tone", isMandatory: false },
    { name: "Táctil", isMandatory: false, repairType: "Cambio de pantalla" },
    { name: "Parlantes", isMandatory: false },
    { name: "Face ID", isMandatory: false, repairType: "Face ID" },
    { name: "Sin piezas desconocidas", isMandatory: false },
    { name: "Toma señal", isMandatory: true },
    { name: "iCloud desvinculado", isMandatory: true },
  ],
  tradeInQuote: {
    batteryThreshold: 80,
    rangePercent: "10.00",
    roundingStep: "10.00",
    roundingCurrency: "USD",
    batteryRepairType: "Cambio de batería",
  },
  // «30 días para todo» (ADR 0024, R-7).
  warrantyDays: 30,
  appointments: {
    slotMinutes: 30,
    capacity: 1,
    reasons: [
      "Ver o comprar un equipo",
      "Entregar un usado",
      "Reparación o diagnóstico",
      "Retirar un equipo",
      "Otro",
    ],
  },
  repairTypes: [
    { name: "Cambio de batería" },
    { name: "Cambio de pantalla" },
    { name: "Cámara trasera" },
    { name: "Cámara frontal" },
    { name: "Pin de carga" },
    { name: "Face ID" },
  ],
  grades: [
    { name: "A", description: "Como nuevo" },
    { name: "B", description: "Marcas leves" },
    { name: "C", description: "Marcas visibles" },
  ],
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
