import { expect, test } from "@playwright/test";

// Rama temporal de la 11.0 (D-6): falla a propósito para probar que la CI sube los artefactos
// de Playwright. No se mergea; la rama se borra después de ver el artefacto.
test("falla a propósito para probar la subida de artefactos (brief-11.0, D-6)", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByText("texto que no existe en la pantalla"),
  ).toBeVisible({
    timeout: 2_000,
  });
});
