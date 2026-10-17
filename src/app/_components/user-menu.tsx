"use client";

import type { ReactNode } from "react";
import { Avatar } from "./avatar";
import { useDisclosure } from "./disclosure";
import { Icon } from "./icons";

// Menú del usuario de la barra superior (brief-23.1, D-5): el avatar con una flecha despliega el
// nombre, el rol, la organización y «Salir». El contenido llega armado desde el servidor, porque
// «Salir» es un formulario con una acción del servidor. Sin JavaScript queda abierto.
export function UserMenu({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
  const menu = useDisclosure();
  return (
    <div ref={menu.container} onKeyDown={menu.onKeyDown} className="relative">
      <button
        ref={menu.button}
        type="button"
        hidden={!menu.hydrated}
        aria-expanded={menu.open}
        aria-controls="menu-usuario"
        aria-label="Menú del usuario"
        onClick={menu.toggle}
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-2 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Avatar name={userName} />
        <Icon name="chevronDown" className="size-4" />
      </button>
      <div
        id="menu-usuario"
        hidden={!menu.shown}
        className={
          menu.hydrated
            ? "absolute top-full right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg"
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
