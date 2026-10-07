"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import type { ClientTag, Tag } from "@/modules/crm";
import {
  formMessageClass,
  inlineButtonClass,
  labelClass,
  linkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import {
  TagChip,
  tagChipBaseClass,
  tagToneClass,
} from "@/app/_components/tag-chip";
import { assignClientTagAction, removeClientTagAction } from "../actions";
import { NO_TAGS_MESSAGE, type ClientChangeState } from "../messages";

// Etiquetas de la ficha (brief-16.1, D-9). Cualquier rol las ve; un admin agrega desde un selector
// con las activas que el cliente no tiene y quita con un botón por chip. Son formularios con
// Server Actions, como el resto de la ficha: funcionan con el teclado y antes de que cargue
// JavaScript.

const initialState: ClientChangeState = { status: "idle" };

function ErrorMessage({ state }: { state: ClientChangeState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);
  return (
    <div aria-live="polite" aria-atomic="true">
      {state.status === "error" ? (
        <p ref={ref} tabIndex={-1} className={formMessageClass}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function RemoveTag({ clientId, tag }: { clientId: string; tag: ClientTag }) {
  const [state, formAction, pending] = useActionState(
    removeClientTagAction,
    initialState,
  );
  return (
    <li className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="tagId" value={tag.id} />
        <span
          className={`${tagChipBaseClass} ${tagToneClass(tag.color)} pr-1 ${tag.isActive ? "" : "border border-dashed border-current"}`}
        >
          <span className="truncate">{tag.name}</span>
          {tag.isActive ? null : (
            <span className="font-normal">(inactiva)</span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="grid size-5 place-items-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-60"
          >
            <Icon name="close" className="size-3.5" />
            <span className="sr-only">Quitar {tag.name}</span>
          </button>
        </span>
      </form>
      <ErrorMessage state={state} />
    </li>
  );
}

function AddTag({
  clientId,
  available,
}: {
  clientId: string;
  available: Tag[];
}) {
  const [state, formAction, pending] = useActionState(
    assignClientTagAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <label htmlFor="etiqueta-nueva" className={labelClass}>
        Agregar etiqueta
      </label>
      <div className="flex flex-wrap gap-2">
        <select
          id="etiqueta-nueva"
          name="tagId"
          required
          defaultValue=""
          className={`${selectClass} min-w-0 flex-1`}
        >
          <option value="" disabled>
            Elegí una etiqueta
          </option>
          {available.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Agregando…" : "Agregar"}
        </button>
      </div>
      <ErrorMessage state={state} />
    </form>
  );
}

export function ClientTags({
  clientId,
  tags,
  activeTags,
  canEdit,
}: {
  clientId: string;
  tags: ClientTag[];
  // Las activas de la organización; solo hace falta para un admin.
  activeTags: Tag[];
  canEdit: boolean;
}) {
  const assigned = new Set(tags.map((tag) => tag.id));
  const available = activeTags.filter((tag) => !assigned.has(tag.id));

  return (
    <div className="flex flex-col gap-4">
      {tags.length === 0 ? (
        <p className="text-sm text-muted">{NO_TAGS_MESSAGE}</p>
      ) : (
        <ul aria-label="Etiquetas del cliente" className="flex flex-wrap gap-2">
          {tags.map((tag) =>
            canEdit ? (
              <RemoveTag key={tag.id} clientId={clientId} tag={tag} />
            ) : (
              <li key={tag.id}>
                <TagChip
                  name={tag.name}
                  color={tag.color}
                  isActive={tag.isActive}
                />
              </li>
            ),
          )}
        </ul>
      )}
      {canEdit && available.length > 0 ? (
        <AddTag clientId={clientId} available={available} />
      ) : null}
      {canEdit && activeTags.length === 0 ? (
        <p className="text-sm text-muted">
          No hay etiquetas activas para agregar.{" "}
          <Link href="/clientes/etiquetas" className={linkClass}>
            Administrar etiquetas
          </Link>
        </p>
      ) : null}
    </div>
  );
}
