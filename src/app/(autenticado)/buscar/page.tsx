import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/app/_auth/session";
import { EmptyState } from "@/app/_components/empty-state";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  mutedTextClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { logEvent, newRequestId } from "@/shared/log";
import { KIND_TEXT } from "./groups";
import { normalizeSearchText, searchEverything } from "./search";

export const metadata: Metadata = {
  title: "Buscar — AI WhatsApp Agent CRM",
};

const TITLE = "Buscar";

type SearchParams = Record<string, string | string[] | undefined>;

// La página de resultados de la búsqueda global (brief-23.3, D-1): hasta ocho por tipo, con «Ver
// todos en …» hacia la lista de cada módulo. Es un formulario GET: funciona sin JavaScript, y es
// adonde lleva la lupa de la barra en el teléfono (D-5). Solo muestra el nombre o el número de cada
// resultado, nunca un dato de contacto (D-3).
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();
  const params = await searchParams;
  const text = normalizeSearchText(
    Array.isArray(params.q) ? params.q[0] : params.q,
  );
  const result =
    text === "" ? null : await searchEverything(context, text, "page");
  if (result && result.failed.length > 0) {
    logEvent({
      level: "error",
      requestId,
      route: "buscar.pagina",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error: result.error,
    });
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Clientes, pedidos, productos, ventas y más, desde un solo lugar."
      />
      <form
        method="get"
        action="/buscar"
        role="search"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="buscar-q" className={labelClass}>
            Buscar en el sistema
          </label>
          <div className="relative">
            <input
              id="buscar-q"
              name="q"
              type="search"
              defaultValue={text}
              // Desde la lupa de la barra se llega para escribir (D-5).
              autoFocus={text === ""}
              placeholder="Nombre, número, SKU o CUIT"
              className={`${inputClass} pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        <button type="submit" className={inlineButtonClass}>
          Buscar
        </button>
      </form>

      {result === null ? (
        <p className={`mt-6 ${mutedTextClass}`}>
          Escribí un nombre, el número de un pedido, una venta o una compra, un
          SKU o un CUIT.
        </p>
      ) : (
        <>
          {result.failed.length > 0 ? (
            <p role="alert" className={`mt-6 ${mutedTextClass}`}>
              No pudimos buscar en{" "}
              {result.failed.map((kind) => KIND_TEXT[kind].title).join(", ")}.
              Probá de nuevo. Código: {requestId}
            </p>
          ) : null}
          {result.groups.length === 0 && result.failed.length === 0 ? (
            <EmptyState
              icon="search"
              title={`No encontramos nada para «${text}».`}
              description="Probá con el comienzo del nombre de un cliente, el número completo de un pedido o el SKU de un producto."
            />
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              {result.groups.map((group) => (
                <section
                  key={group.kind}
                  aria-labelledby={`grupo-${group.kind}`}
                  className={`${cardClass} p-5`}
                >
                  <h2 id={`grupo-${group.kind}`} className={sectionTitleClass}>
                    {group.title}
                  </h2>
                  <ul className="mt-3 divide-y divide-border">
                    {group.hits.map((hit) => (
                      <li key={hit.id} className="py-2">
                        <Link href={hit.href} className={linkClass}>
                          {hit.label}
                        </Link>
                        {hit.detail ? (
                          <span
                            className={
                              hit.detailStyle === "text"
                                ? `block ${mutedTextClass}`
                                : "block font-mono text-xs text-muted"
                            }
                          >
                            {hit.detail}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {group.moreHref ? (
                    <p className="mt-3 text-sm">
                      <Link href={group.moreHref} className={linkClass}>
                        {group.moreLabel}
                      </Link>
                    </p>
                  ) : null}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
