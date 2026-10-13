// Las reglas de línea de los comprobantes (ADR 0019; brief-20.3, D-1): el total de una línea, la
// suma y, para el pedido de la app y la venta sin pedido, la validación y la evaluación de las
// líneas contra los productos bloqueados. Puro, sin la base: lo puede importar el navegador.
export {
  computeLineTotal,
  roundLineTotal,
  sumLineTotals,
  type LineTotalResult,
} from "./line-total";
export {
  duplicateLines,
  evaluateLines,
  parseLines,
  type LineField,
  type LineInput,
  type LinePrice,
  type LineProduct,
  type LineRule,
  type LineRuleIssue,
  type LinesEvaluation,
  type LinesValidation,
  type ParsedLine,
  type PricedLine,
} from "./rules";
