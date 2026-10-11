// Interfaz pública del módulo numbering: la numeración sin huecos de los documentos (brief-19.2;
// ADR 0019, punto 2; ADR 0020, punto 2).
export {
  formatDocumentNumber,
  nextDocumentNumber,
  type DocumentKind,
} from "./service";
