"use client";

import { useEffect } from "react";
import { readoutId } from "./chart-frame";

// Interacción de los gráficos del dashboard (brief-15.3, D-6). Se monta una sola vez en la página,
// fuera de las tarjetas, y escucha a todos los contenedores [data-chart-frame] por delegación: así
// sirve también a las tarjetas que llegan después por streaming. Pasar el puntero por una forma, o
// recorrerlas con las flechas (Inicio, Fin, Escape) con el gráfico enfocado, escribe su
// data-readout en la línea de lectura del gráfico. La forma activa se marca atenuando las demás
// con una clase: sin coordenadas ni estilos en línea, que la CSP prohíbe (H-1).

const DIMMED = "opacity-40";

function shapesOf(frame: HTMLElement) {
  return [...frame.querySelectorAll<SVGElement>("[data-index]")].sort(
    (a, b) => Number(a.dataset.index) - Number(b.dataset.index),
  );
}

function setActive(frame: HTMLElement, index: number | null) {
  const shapes = shapesOf(frame);
  const line = document.getElementById(readoutId(frame.id));
  shapes.forEach((shape, position) => {
    shape.classList.toggle(DIMMED, index !== null && position !== index);
  });
  if (index === null) {
    delete frame.dataset.active;
    if (line) line.textContent = line.dataset.hint ?? "";
    return;
  }
  frame.dataset.active = String(index);
  const shape = shapes[index];
  if (line && shape) line.textContent = shape.dataset.readout ?? "";
  shape?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

export function ChartInteractions() {
  useEffect(() => {
    const frameOf = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-chart-frame]")
        : null;

    const onPointerOver = (event: PointerEvent) => {
      const frame = frameOf(event.target);
      const shape =
        event.target instanceof Element
          ? event.target.closest<SVGElement>("[data-index]")
          : null;
      if (frame && shape) setActive(frame, Number(shape.dataset.index));
    };
    const onPointerOut = (event: PointerEvent) => {
      const frame = frameOf(event.target);
      if (frame && !frame.contains(event.relatedTarget as Node | null)) {
        setActive(frame, null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const frame = event.target instanceof HTMLElement ? event.target : null;
      if (!frame?.hasAttribute("data-chart-frame")) return;
      const last = shapesOf(frame).length - 1;
      if (last < 0) return;
      const current =
        frame.dataset.active === undefined
          ? null
          : Number(frame.dataset.active);
      const forward = () =>
        current === null ? 0 : Math.min(last, current + 1);
      const back = () => (current === null ? last : Math.max(0, current - 1));
      const step: Record<string, () => number | null> = {
        ArrowRight: forward,
        ArrowDown: forward,
        ArrowLeft: back,
        ArrowUp: back,
        Home: () => 0,
        End: () => last,
        Escape: () => null,
      };
      const move = step[event.key];
      if (move) {
        event.preventDefault();
        setActive(frame, move());
      }
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
