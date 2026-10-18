import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionNotice } from "./action-notice";
import { EmptyState } from "./empty-state";
import {
  ERROR_MESSAGE,
  ERROR_TITLE,
  ErrorPanel,
  NOT_FOUND_TITLE,
  NotFoundPanel,
} from "./error-panel";
import { InlineSkeleton, LOADING_TEXT } from "./skeleton";

// brief-23.2: los estados compartidos, renderizados a texto (sin DOM; H-6). Fijan lo que un
// lector de pantalla recibe y que el error nunca muestra el mensaje de la excepción.

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

describe("EmptyState (D-2)", () => {
  it("muestra el título como párrafo, la descripción y las acciones en orden", () => {
    const out = html(
      createElement(EmptyState, {
        icon: "users",
        title: "Todavía no hay clientes.",
        description: "Cada cliente aparece acá.",
        actions: [
          { href: "/clientes", label: "Limpiar filtros", variant: "outline" },
          {
            href: "/clientes/nuevo",
            label: "Crear el primero",
            variant: "primary",
          },
        ],
      }),
    );
    expect(out).toContain("<p");
    expect(out).toContain("Todavía no hay clientes.");
    expect(out).toContain("Cada cliente aparece acá.");
    expect(out).not.toMatch(/<h[1-6]/);
    expect(out.indexOf("Limpiar filtros")).toBeLessThan(
      out.indexOf("Crear el primero"),
    );
    expect(out).toContain('href="/clientes/nuevo"');
  });

  it("el ícono es decorativo", () => {
    const out = html(
      createElement(EmptyState, { icon: "users", title: "Vacío." }),
    );
    expect(out).toContain('aria-hidden="true"');
  });

  it("sin acciones no dibuja enlaces", () => {
    const out = html(
      createElement(EmptyState, { icon: "users", title: "Vacío." }),
    );
    expect(out).not.toContain("<a");
  });
});

describe("ActionNotice (D-5)", () => {
  it("lleva el tilde decorativo y el texto", () => {
    const out = html(createElement(ActionNotice, null, "Se guardó."));
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain("Se guardó.");
  });
});

describe("esqueletos (D-3)", () => {
  it("en línea, con su texto accesible y sin animación si se pide movimiento reducido", () => {
    const out = html(createElement(InlineSkeleton));
    expect(out).toContain('role="status"');
    expect(out).toContain(LOADING_TEXT);
    expect(out).toContain("motion-reduce:animate-none");
  });
});

describe("ErrorPanel (D-4)", () => {
  it("ofrece reintentar, ir al inicio y el código", () => {
    const out = html(
      createElement(ErrorPanel, { digest: "123456", onRetry: () => {} }),
    );
    expect(out).toContain(ERROR_TITLE);
    expect(out).toContain(ERROR_MESSAGE);
    expect(out).toContain("Reintentar");
    expect(out).toContain('href="/"');
    expect(out).toContain("Ir al inicio");
    expect(out).toContain("123456");
  });

  it("sin digest no muestra la línea del código", () => {
    const out = html(createElement(ErrorPanel, { onRetry: () => {} }));
    expect(out).not.toContain("Código");
  });

  it("nunca muestra el mensaje de la excepción", () => {
    // El panel no recibe el error: solo el digest. Si alguien le pasa el objeto, no se dibuja.
    const error = Object.assign(new Error("password=secreta"), {
      digest: "999",
    });
    const out = html(
      createElement(ErrorPanel, {
        digest: error.digest,
        onRetry: () => {},
        ...({ error } as object),
      }),
    );
    expect(out).not.toContain("secreta");
    expect(out).toContain("999");
  });
});

describe("NotFoundPanel (D-4)", () => {
  it("en castellano y con el camino al inicio", () => {
    const out = html(createElement(NotFoundPanel));
    expect(out).toContain(NOT_FOUND_TITLE);
    expect(out).toContain('href="/"');
  });
});
