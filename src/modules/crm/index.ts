// Interfaz pública del módulo crm (brief-5.2).
export { type ClientPhone } from "./phone";
export {
  CLIENTS_PAGE_SIZE,
  createClient,
  deactivateClient,
  getClient,
  listClientAudit,
  reactivateClient,
  searchClients,
  updateClient,
  type Client,
  type ClientActiveResult,
  type ClientActivityFilter,
  type ClientAuditEntry,
  type ClientAuditResult,
  type ClientField,
  type ClientInput,
  type ClientListFilters,
  type ClientPage,
  type CreateClientResult,
  type UpdateClientResult,
} from "./service";
