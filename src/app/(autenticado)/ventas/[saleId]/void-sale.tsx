"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  cardClass,
  dangerButtonClass,
  formMessageClass,
  labelClass,
  linkClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { voidSaleAction } from "../actions";
import {
  VOID_DOCUMENT_NOTE,
  VOID_NO_REFUND_NOTE,
  VOID_REASON_LABEL,
  type VoidEffect,
  type VoidSaleState,
} from "../messages";

// La confirmación de «Anular venta» (brief-20.4, D-7), en el paso ?confirmar=anular del detalle. El
// motivo es un grupo de opciones obligatorio, de la lista cerrada (D-2). Si la venta ya está
// anulada, el error enlaza la anulación (D-6).
//
// **Desde la 24.6.2-d es la lámina 04**: un diálogo con «Efecto de la anulación» antes de confirmar,
// con el efecto en stock y el efecto en dinero **calculados** —no dos textos fijos que no miraban la
// venta— y con «Conservar venta» primero y con el foco (brief-24.6.2-d, D-3, D-5 y D-6).
//
// **Por qué un `<dialog>` nativo y no estado de cliente** (D-3, opción b). La lámina dibuja un
// diálogo centrado sobre el fondo atenuado, y hacerlo con estado de cliente solo anda con
// JavaScript: **22 archivos de `tests/e2e/` prueban esta aplicación sin él**, `sales.spec.ts` entre
// ellos. El elemento nativo resuelve las dos mitades y es la única pieza que las resuelve juntas:
//
// - **Con JavaScript** se promueve a modal con `showModal()`, que trae el fondo atenuado, el foco
//   atrapado y el cierre con Escape **sin escribirlos**. Es una decisión destructiva de un solo
//   paso: ahí atrapar el foco no es un adorno, es el requisito.
// - **Sin JavaScript** queda el `<dialog open>` del servidor, que es un bloque más de la página, con
//   el mismo formulario y los mismos enlaces. Se pierde la atenuación del fondo, no la operación.
//
// El elemento se dibuja **siempre abierto** y el efecto lo cierra para volver a abrirlo como modal:
// `showModal()` sobre un diálogo ya abierto lanza, así que el orden importa. Y Escape no se deja en
// su conducta por omisión —cerrar el elemento y dejar la página con `?confirmar=anular` en la
// dirección y nada visible—, sino que navega al mismo lugar que «Conservar venta».

const initialState: VoidSaleState = { status: "idle" };

const REASONS = Object.entries(VOID_REASON_LABEL);

export function VoidSaleConfirm({
  saleId,
  displayNumber,
  cancelHref,
  stock,
  money,
  moneyNote,
}: {
  saleId: string;
  displayNumber: string;
  // Adónde vuelve «Conservar venta», la cruz y Escape: la ficha sin el paso de anulación.
  cancelHref: string;
  // Los dos efectos, ya calculados y escritos por la página (D-6 y H-3). El de dinero es null
  // cuando la venta no tiene nada cobrado: no hay efecto que anunciar.
  stock: VoidEffect;
  money: VoidEffect | null;
  // La advertencia de D-5, solo cuando el importe de arriba es uno calculado.
  moneyNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    voidSaleAction,
    initialState,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLAnchorElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.matches(":modal")) {
      dialog.close();
      dialog.showModal();
    }
    // **El foco se pone acá y no con `autoFocus`** (AC-10). Medido el 2026-11-04 sobre el build:
    // el `<a>` que Next renderiza **no lleva el atributo `autofocus`**, así que `showModal()` se
    // queda con el primer elemento enfocable, que es la cruz de cerrar. En una operación que no se
    // deshace, el foco va a la salida segura y no al primero del documento.
    keepRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      open
      aria-labelledby="confirmar-anulacion"
      onCancel={(event) => {
        event.preventDefault();
        router.push(cancelHref);
      }}
      // `static` sin JavaScript —si no, el elemento abierto es `position: absolute` y se dibuja
      // donde el navegador quiera— y `fixed` centrado cuando es modal, que es lo que pide la lámina.
      className={`${cardClass} static m-0 w-full max-w-xl p-0 text-foreground [&:modal]:fixed [&:modal]:inset-0 [&:modal]:m-auto [&:modal]:max-h-[calc(100dvh-2rem)] [&:modal]:overflow-auto [&:modal]:shadow-lg backdrop:bg-overlay`}
    >
      <form action={formAction} className="flex flex-col gap-4 p-5 sm:p-6">
        <input type="hidden" name="saleId" value={saleId} />
        <div className="flex items-start justify-between gap-4">
          <h2
            id="confirmar-anulacion"
            className="text-lg font-bold tracking-tight"
          >
            Anular venta {displayNumber}
          </h2>
          <Link
            href={cancelHref}
            aria-label={`Cerrar sin anular la venta ${displayNumber}`}
            className={`${linkClass} no-underline`}
          >
            <Icon name="close" className="size-5" />
          </Link>
        </div>

        {state.status === "error" ? (
          <div role="alert" className={formMessageClass}>
            <p>{state.message}</p>
            {state.existing ? (
              <p className="mt-1">
                <Link
                  href={`/ventas/${saleId}/anulacion`}
                  className={linkClass}
                >
                  Ver la anulación {state.existing.displayNumber}
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
          <legend className={`${labelClass} mb-1`}>Motivo</legend>
          {REASONS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="reason"
                value={value}
                required
                className={radioClass}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <section
          aria-labelledby="efecto-anulacion"
          className="flex flex-col gap-2 border-t border-border pt-4"
        >
          <h3 id="efecto-anulacion" className={labelClass}>
            Efecto de la anulación
          </h3>
          <EffectRow icon="package" effect={stock} />
          {money ? (
            <EffectRow icon="banknote" effect={money} note={moneyNote} />
          ) : null}
          <p className="flex items-start gap-3 rounded-xl border border-border-strong bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
            <Icon name="alert" className="mt-0.5 size-4" />
            <span>{VOID_NO_REFUND_NOTE}</span>
          </p>
          <EffectRow
            icon="fileText"
            effect={{ title: VOID_DOCUMENT_NOTE, detail: "" }}
          />
        </section>

        {/* «Conservar venta» va primero y con el foco: es la salida segura de una operación que no
            se deshace, y es lo que pide el README del lote. */}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <Link ref={keepRef} href={cancelHref} className={secondaryLinkClass}>
            Conservar venta
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={dangerButtonClass}
          >
            {pending ? "Anulando…" : "Anular venta"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function EffectRow({
  icon,
  effect,
  note,
}: {
  icon: "package" | "banknote" | "fileText";
  effect: VoidEffect;
  note?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface-muted px-3 py-2 text-sm">
      <Icon name={icon} className="mt-0.5 size-4 text-muted" />
      <div>
        <p className="font-semibold">{effect.title}</p>
        {effect.detail ? <p className="text-muted">{effect.detail}</p> : null}
        {note ? <p className="mt-1 text-muted">{note}</p> : null}
      </div>
    </div>
  );
}
