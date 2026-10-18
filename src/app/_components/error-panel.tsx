import type { ReactNode } from "react";
import Link from "next/link";
import {
  inlineButtonClass,
  mutedTextClass,
  outlineButtonClass,
  pageTitleClass,
} from "./form-styles";
import { Icon } from "./icons";

export const ERROR_TITLE = "No pudimos cargar esta pantalla";
export const ERROR_MESSAGE =
  "Puede ser un problema momentáneo. Probá de nuevo; si se repite, avisá con el código de abajo.";
export const NOT_FOUND_TITLE = "No encontramos esta página";
export const NOT_FOUND_MESSAGE =
  "La dirección no existe o cambió. Volvé al inicio para seguir.";

function Panel({
  tone,
  title,
  message,
  children,
}: {
  tone: "danger" | "primary";
  title: string;
  message: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <span
        className={`flex size-14 items-center justify-center rounded-full ${
          tone === "danger"
            ? "bg-danger-soft text-danger"
            : "bg-primary-soft text-primary"
        }`}
      >
        <Icon
          name={tone === "danger" ? "alert" : "search"}
          className="size-7"
        />
      </span>
      <h1 className={`mt-4 ${pageTitleClass}`}>{title}</h1>
      <p className="mt-2 max-w-md text-muted">{message}</p>
      {children}
    </div>
  );
}

// Error recuperable (brief-23.2, D-4). Nunca muestra el mensaje de la excepción, que puede traer
// datos: solo el `digest`, el mismo identificador que queda en el log del servidor.
export function ErrorPanel({
  digest,
  onRetry,
}: {
  digest?: string;
  onRetry: () => void;
}) {
  return (
    <Panel tone="danger" title={ERROR_TITLE} message={ERROR_MESSAGE}>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onRetry} className={inlineButtonClass}>
          Reintentar
        </button>
        <Link href="/" className={outlineButtonClass}>
          <Icon name="home" className="size-4" />
          Ir al inicio
        </Link>
      </div>
      {digest ? (
        <p className={`mt-6 ${mutedTextClass}`}>
          Código: <code className="font-mono">{digest}</code>
        </p>
      ) : null}
    </Panel>
  );
}

// Una dirección que no existe (brief-23.2, D-4). Las rutas con id siguen con su PageNotice.
export function NotFoundPanel() {
  return (
    <Panel tone="primary" title={NOT_FOUND_TITLE} message={NOT_FOUND_MESSAGE}>
      <div className="mt-6">
        <Link href="/" className={outlineButtonClass}>
          <Icon name="home" className="size-4" />
          Ir al inicio
        </Link>
      </div>
    </Panel>
  );
}
