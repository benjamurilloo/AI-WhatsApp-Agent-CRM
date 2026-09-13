import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de CLAUDE.md: nada de Airtable ni del repositorio del agente de WhatsApp
// fuera de la documentación (brief-2.5, D-1 y D-2).
const FORBIDDEN = [
  { name: "Airtable", pattern: /airtable/i },
  {
    name: "repositorio del agente de WhatsApp",
    pattern: /ai-whatsapp-agent(?!-crm)/i,
  },
];

// Este archivo contiene los patrones como casos de prueba.
const SELF = "tests/guards/forbidden-references.test.ts";

type Hit = { line: number; name: string };

function findForbiddenReferences(text: string): Hit[] {
  return text.split(/\r?\n/).flatMap((content, index) =>
    FORBIDDEN.filter(({ pattern }) => pattern.test(content)).map(
      ({ name }) => ({
        line: index + 1,
        name,
      }),
    ),
  );
}

describe("detección de referencias prohibidas", () => {
  it.each([
    'import Airtable from "airtable";',
    "AIRTABLE_API_KEY=xxx",
    'fetch("https://api.airtable.com/v0/base")',
    "https://github.com/benjamurilloo/AI-WhatsApp-Agent",
    'import { agent } from "../AI-WhatsApp-Agent/src/agent";',
  ])("detecta: %s", (text) => {
    expect(findForbiddenReferences(text)).not.toEqual([]);
  });

  it.each([
    '"name": "ai-whatsapp-agent-crm"',
    "benjamurilloo/AI-WhatsApp-Agent-CRM",
    "WhatsApp agent",
  ])("permite: %s", (text) => {
    expect(findForbiddenReferences(text)).toEqual([]);
  });

  it("informa la línea de cada referencia", () => {
    expect(findForbiddenReferences("ok\nAIRTABLE_TOKEN=1")).toEqual([
      { line: 2, name: "Airtable" },
    ]);
  });
});

describe("repositorio", () => {
  it("ningún archivo versionado fuera de la documentación tiene referencias prohibidas", () => {
    const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter((file) => file && !file.endsWith(".md") && file !== SELF);

    const hits = files.flatMap((file) =>
      findForbiddenReferences(readFileSync(file, "utf8")).map(
        ({ line, name }) => `${file}:${line} (${name})`,
      ),
    );

    expect(files.length).toBeGreaterThan(0);
    expect(hits, `Referencias prohibidas:\n${hits.join("\n")}`).toEqual([]);
  });
});
