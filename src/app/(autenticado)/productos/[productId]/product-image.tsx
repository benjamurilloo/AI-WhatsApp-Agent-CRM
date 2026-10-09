"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  labelClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { removeProductImageAction } from "../actions";
import {
  IMAGE_PEOPLE_NOTICE,
  IMAGE_RULES_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  imageUploadMessage,
  type ImageUploadError,
  type ProductChangeState,
} from "../messages";

// Subir o reemplazar la imagen principal (brief-17.5, D-2 y D-7). El archivo va como cuerpo de un
// PUT al Route Handler, que comprueba la sesión, el Origin y el rol antes de leerlo. El tamaño se
// avisa también acá, antes de mandar nada; la regla la hace cumplir el servidor.

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export function ProductImageUpload({
  productId,
  hasImage,
}: {
  productId: string;
  hasImage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Elegí un archivo.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(IMAGE_TOO_LARGE_MESSAGE);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/productos/${productId}/imagen`, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      const body = (await response.json().catch(() => null)) as {
        ok: boolean;
        error?: ImageUploadError;
      } | null;
      if (response.ok && body?.ok) {
        router.replace(`/productos/${productId}?aviso=imagen-subida`);
        router.refresh();
        return;
      }
      setError(imageUploadMessage(body?.error ?? "internal"));
    } catch {
      setError(imageUploadMessage("internal"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={upload} className="mt-4 flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="imagen-archivo" className={labelClass}>
          {hasImage ? "Reemplazar imagen" : "Subir imagen"}
        </label>
        <input
          ref={inputRef}
          id="imagen-archivo"
          name="imagen"
          type="file"
          accept={ACCEPT}
          aria-describedby="imagen-reglas imagen-personas"
          aria-invalid={error ? true : undefined}
          className="w-full min-w-0 text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-foreground hover:file:bg-surface-muted"
        />
        <p id="imagen-reglas" className="text-sm text-muted">
          {IMAGE_RULES_MESSAGE}
        </p>
        <p id="imagen-personas" className="text-sm text-muted">
          {IMAGE_PEOPLE_NOTICE}
        </p>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {error ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {error}
          </p>
        ) : null}
      </div>
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando imagen…" : "Guardar imagen"}
        </button>
      </div>
    </form>
  );
}

const initialState: ProductChangeState = { status: "idle" };

// Quitar con confirmación en un segundo paso de la URL, como desactivar (wireframe 04).
export function RemoveImageConfirm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(
    removeProductImageAction,
    initialState,
  );
  const titleRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  useEffect(() => {
    if (state.status === "error") messageRef.current?.focus();
  }, [state]);

  return (
    <div
      role="group"
      aria-labelledby="confirmar-quitar-imagen"
      className="mt-4 flex flex-col gap-3 rounded-lg border border-danger bg-danger-soft p-4"
    >
      <p
        id="confirmar-quitar-imagen"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold text-on-danger-soft"
      >
        ¿Quitar la imagen?
      </p>
      <p className="text-sm text-on-danger-soft">
        Se borra del CRM. Podés subir otra cuando quieras.
      </p>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p ref={messageRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="productId" value={productId} />
        <Link href={`/productos/${productId}`} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Quitando…" : "Sí, quitar"}
        </button>
      </form>
    </div>
  );
}
