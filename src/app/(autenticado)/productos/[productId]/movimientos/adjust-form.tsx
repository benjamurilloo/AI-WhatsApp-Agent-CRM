"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
} from "@/app/_components/form-styles";
import { formatQuantity, parseQuantityInput } from "@/shared/quantity";
import { adjustStockAction } from "../../actions";
import type { AdjustmentState } from "../../messages";

// Formulario de ajuste (wireframe 05). El saldo esperado viaja en el formulario: si cambió,
// el servidor responde CONFLICT y acá se muestra el saldo nuevo para confirmar otra vez
// (brief-4.3.1, D-2; brief-4.4, D-4). El saldo resultante se anuncia con aria-live.

const initialState: AdjustmentState = { status: "idle" };

function preview(
  balance: string,
  type: "adjustment_positive" | "adjustment_negative",
  quantity: string,
): { text: string; negative: boolean } {
  const current = parseQuantityInput(formatQuantity(balance).replace(",", "."));
  const amount = parseQuantityInput(quantity.trim());
  if (current === null || amount === null) {
    return { text: "", negative: false };
  }
  const after =
    type === "adjustment_positive" ? current + amount : current - amount;
  const sign = type === "adjustment_positive" ? "+" : "−";
  const shown = after < 0n ? `−${format(-after)}` : format(after);
  return {
    text: `${formatQuantity(balance)} ${sign} ${format(amount)} = ${shown}`,
    negative: after < 0n,
  };
}

// Milésimas a texto para mostrar, sin pasar por la escala de la base.
function format(value: bigint): string {
  const fraction = (value % 1000n)
    .toString()
    .padStart(3, "0")
    .replace(/0+$/, "");
  const integer = (value / 1000n).toString();
  return fraction ? `${integer},${fraction}` : integer;
}

export function AdjustForm({
  productId,
  quantityOnHand,
  unit,
}: {
  productId: string;
  quantityOnHand: string;
  unit: string;
}) {
  const [state, formAction, pending] = useActionState(
    adjustStockAction,
    initialState,
  );
  const [type, setType] = useState<
    "adjustment_positive" | "adjustment_negative"
  >("adjustment_positive");
  const [quantity, setQuantity] = useState("");
  // Controlado a propósito: React reinicia los campos no controlados al terminar la acción,
  // y un ajuste rechazado tiene que conservar lo que se escribió para confirmarlo de nuevo.
  const [reason, setReason] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Tras un CONFLICT el servidor devuelve el saldo actualizado: es el que hay que confirmar.
  const balance =
    state.status === "error" && state.quantityOnHand
      ? state.quantityOnHand
      : quantityOnHand;
  const failed = state.status === "error";
  const result = preview(balance, type, quantity);

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field) {
      document.getElementById(state.field)?.focus();
    } else {
      errorRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <input
        type="hidden"
        name="expectedQuantityOnHand"
        value={balance}
        readOnly
      />

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Tipo *</legend>
        <div className="flex flex-wrap gap-6">
          {(
            [
              ["adjustment_positive", "Positivo (+)"],
              ["adjustment_negative", "Negativo (−)"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className={radioClass}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="quantity" className={labelClass}>
          Cantidad *
        </label>
        <input
          id="quantity"
          name="quantity"
          required
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          aria-invalid={failed && state.field === "quantity" ? true : undefined}
          aria-describedby={
            failed && state.field === "quantity" ? "quantity-error" : undefined
          }
          className={`${inputClass} sm:w-48`}
        />
        {failed && state.field === "quantity" ? (
          <p id="quantity-error" className={fieldErrorClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className={labelClass}>
          Motivo *
        </label>
        <input
          id="reason"
          name="reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={failed && state.field === "reason" ? true : undefined}
          aria-describedby={
            failed && state.field === "reason" ? "reason-error" : undefined
          }
          className={inputClass}
        />
        {failed && state.field === "reason" ? (
          <p id="reason-error" className={fieldErrorClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <p aria-live="polite" aria-atomic="true" className="text-sm">
        {result.text ? (
          <>
            Saldo resultante: {result.text} {unit}
            {result.negative ? " ✕ No permitido" : ""}
          </>
        ) : (
          <>
            Stock actual: {formatQuantity(balance)} {unit}
          </>
        )}
      </p>

      <div aria-live="polite" aria-atomic="true">
        {failed && !state.field ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || result.negative}
          className={inlineButtonClass}
        >
          {pending ? "Confirmando…" : "Confirmar ajuste"}
        </button>
      </div>
    </form>
  );
}
