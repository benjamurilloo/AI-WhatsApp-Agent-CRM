import type { IconName } from "@/app/_components/icons";

// Nombre y definición corta de cada métrica, para el desplegable de su tarjeta (brief-7.4, D-3).
// El catálogo sigue siendo la fuente de verdad: si un texto de acá lo contradice, manda
// docs/analytics/MetricsCatalog.md y este archivo se corrige. Viven todos juntos a propósito, para
// que la comparación con el catálogo sea una sola lectura.

export type MetricNumber =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type MetricInfo = {
  number: MetricNumber;
  name: string;
  definition: string;
};

export const METRIC_INFO: Record<MetricNumber, MetricInfo> = {
  1: {
    number: 1,
    name: "Conversaciones iniciadas",
    definition:
      "Conversaciones cuyo inicio cae en el período, en la zona horaria de la organización.",
  },
  2: {
    number: 2,
    name: "Conversaciones con actividad",
    definition:
      "Conversaciones con al menos un mensaje en el período, sin importar cuándo empezaron.",
  },
  3: {
    number: 3,
    name: "Clientes únicos",
    definition:
      "Clientes distintos con conversaciones activas en el período. Las conversaciones sin cliente asociado se cuentan aparte.",
  },
  4: {
    number: 4,
    name: "Mensajes entrantes",
    definition: "Mensajes recibidos del cliente con fecha en el período.",
  },
  5: {
    number: 5,
    name: "Mensajes salientes",
    definition: "Mensajes enviados al cliente con fecha en el período.",
  },
  6: {
    number: 6,
    name: "Mensajes por conversación",
    definition:
      "Promedio y mediana de mensajes de las conversaciones con actividad en el período. Sin conversaciones activas no hay valor que mostrar.",
  },
  7: {
    number: 7,
    name: "Conversaciones respondidas",
    definition:
      "Conversaciones con un mensaje entrante y una respuesta posterior, las dos dentro del período. Dos mensajes con la misma hora exacta no cuentan como respuesta.",
  },
  8: {
    number: 8,
    name: "Cobertura de respuesta",
    definition:
      "Respondidas sobre las conversaciones que tenían algo que responder, es decir las que recibieron al menos un mensaje entrante en el período.",
  },
  9: {
    number: 9,
    name: "Mediana de primera respuesta",
    definition:
      "Tiempo hasta la primera respuesta de las conversaciones cuyo primer mensaje entrante cae en el período. La respuesta puede llegar después del fin del período, así que el valor de los días recientes todavía puede cambiar.",
  },
  10: {
    number: 10,
    name: "Evolución diaria",
    definition:
      "Conversaciones iniciadas, con actividad y mensajes por día del período. Los días sin actividad se muestran en 0.",
  },
  11: {
    number: 11,
    name: "Conversaciones por estado",
    definition:
      "Conversaciones con actividad en el período, agrupadas por su estado actual, que puede haber cambiado después del período.",
  },
  12: {
    number: 12,
    name: "Errores de ingestión",
    definition:
      "Eventos de ingestión que fallaron al procesarse, por origen y código, con su porcentaje sobre el total de eventos del período. Cuenta solo los eventos que el CRM aceptó procesar: un envío mal formado, con credencial inválida o por encima del límite de tasa se rechaza sin registrarse, así que no aparece acá.",
  },
  // Métricas 13 y 14 (brief-15.3, D-4 y D-5), con los nombres del boceto.
  13: {
    number: 13,
    name: "Tipos de mensajes",
    definition:
      "Mensajes entrantes del período por su tipo original: texto, audio, imagen, video, documento u otro. Los que llegaron sin tipo (por la versión 1 de la ingestión) se cuentan como «Sin dato». Suman los mensajes entrantes.",
  },
  14: {
    number: 14,
    name: "Tiempo de primera respuesta",
    definition:
      "Las conversaciones de la mediana de primera respuesta, repartidas por cuánto tardó esa respuesta. Las que no tienen respuesta se cuentan aparte. Cada rango incluye su inicio y no su fin: 5 minutos exactos caen en «5 a 30 min».",
  },
};

export function metricLabel(number: MetricNumber): string {
  return `${number}. ${METRIC_INFO[number].name}`;
}

// Ícono de cada tarjeta (brief-15.1). Es solo presentación: no forma parte de la definición.
export const METRIC_ICON: Record<MetricNumber, IconName> = {
  1: "messageCircle",
  2: "chartColumn",
  3: "users",
  4: "mail",
  5: "send",
  6: "messagesSquare",
  7: "circleCheck",
  8: "pieChart",
  9: "timer",
  10: "chartColumn",
  11: "list",
  12: "alert",
  13: "mail",
  14: "clock",
};
