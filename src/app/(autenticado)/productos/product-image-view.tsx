import type { ProductImageVersion } from "@/modules/catalog";
import { Icon } from "@/app/_components/icons";

// La imagen principal de un producto o su recuadro vacío (brief-17.5, D-7). Se pide con la versión
// en la dirección (?v=<sha256>): reemplazar la imagen cambia la dirección y el navegador no
// muestra la anterior (D-6). Es un <img> y no next/image: el optimizador de Next pediría la imagen
// desde el servidor, sin la cookie de sesión.

export function ProductThumbnail({
  productId,
  version,
}: {
  productId: string;
  version: ProductImageVersion | undefined;
}) {
  if (!version) {
    return (
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-muted"
      >
        <Icon name="package" className="size-5" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ver el comentario del archivo
    <img
      src={`/productos/${productId}/imagen/miniatura?v=${version.sha256}`}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      className="size-10 shrink-0 rounded-lg border border-border bg-surface object-contain"
    />
  );
}

export function ProductImage({
  productId,
  name,
  version,
}: {
  productId: string;
  name: string;
  version: ProductImageVersion | undefined;
}) {
  if (!version) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-lg border border-dashed border-border-strong bg-surface-muted text-muted">
        <div className="flex flex-col items-center gap-2">
          <Icon name="package" className="size-10" />
          <p className="text-sm">Sin imagen</p>
        </div>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ver el comentario del archivo
    <img
      src={`/productos/${productId}/imagen?v=${version.sha256}`}
      alt={`Imagen de ${name}`}
      width={version.width}
      height={version.height}
      className="h-auto w-full rounded-lg border border-border bg-surface object-contain"
    />
  );
}
