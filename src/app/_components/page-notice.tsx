import Link from "next/link";
import { linkClass, pageTitleClass } from "./form-styles";

// Página que solo muestra un mensaje, sin datos: sin permiso o recurso inexistente (brief-3.7, D-10).
export function PageNotice({
  title,
  message,
  back,
}: {
  title: string;
  message: string;
  back?: { href: string; label: string };
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className={pageTitleClass}>{title}</h1>
      <p className="mt-4 text-foreground">{message}</p>
      {back ? (
        <p className="mt-4">
          <Link href={back.href} className={linkClass}>
            {back.label}
          </Link>
        </p>
      ) : null}
    </main>
  );
}
