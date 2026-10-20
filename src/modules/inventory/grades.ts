import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";
import {
  UNIT_GRADE_DESCRIPTION_MAX_LENGTH,
  UNIT_GRADE_NAME_MAX_LENGTH,
} from "./schema";
import * as unitRepository from "./unit-repository";

// Los grados de las unidades (ADR 0024, punto 13; brief-29.5, D-5): una lista por organización, de la
// capacidad serialized_units. La copia el perfil de rubro al activar la capacidad, y un admin agrega,
// renombra, ordena y desactiva grados. Un grado no se borra: uno en uso conserva su nombre en las
// unidades que lo tienen. Cada escritura se audita sobre el grado.

export { UNIT_GRADE_DESCRIPTION_MAX_LENGTH, UNIT_GRADE_NAME_MAX_LENGTH };

export type UnitGrade = unitRepository.GradeRow;

const idSchema = z.uuid();

async function allowed(context: AuthContext): Promise<boolean> {
  return hasCapability(context.organizationId, "serialized_units");
}

// Los grados de la organización, activos e inactivos, en su orden. Los dos roles: el formulario del
// alta y la pantalla de los grados los muestran.
export async function listUnitGrades(
  context: AuthContext,
): Promise<
  { ok: true; grades: UnitGrade[] } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const grades = await unitRepository.findGrades(context.organizationId);
  return { ok: true, grades };
}

export type GradeInput = { name: string; description: string };
export type GradeField = keyof GradeInput;

const gradeSchema = z.object({
  name: z.string().trim().min(1).max(UNIT_GRADE_NAME_MAX_LENGTH),
  description: z
    .string()
    .trim()
    .max(UNIT_GRADE_DESCRIPTION_MAX_LENGTH)
    .transform((value) => (value === "" ? null : value)),
});

function validateGrade(
  input: GradeInput,
):
  | { ok: true; values: { name: string; description: string | null } }
  | Failure<"VALIDATION_ERROR", { fields: GradeField[] }> {
  const parsed = gradeSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: (["name", "description"] as const).filter((field) =>
      fields.has(field),
    ),
  };
}

export type GradeWriteResult =
  | { ok: true; gradeId: string; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: GradeField[] }>
  | Failure<"CONFLICT", { field: "name" }>;

const nameTaken: GradeWriteResult = {
  ok: false,
  code: "CONFLICT",
  field: "name",
};

// Un grado nuevo va al final de la lista.
export async function createUnitGrade(
  context: AuthContext,
  input: GradeInput,
): Promise<GradeWriteResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const validated = validateGrade(input);
  if (!validated.ok) return validated;
  const { organizationId, userId } = context;
  return repository.withTransaction(async (tx): Promise<GradeWriteResult> => {
    const existing = await unitRepository.findGrades(organizationId, tx);
    const position =
      existing.reduce((max, grade) => Math.max(max, grade.position), -1) + 1;
    const values = { ...validated.values, position, isActive: true };
    const gradeId = await unitRepository.insertGrade(tx, organizationId, {
      ...values,
      isExample: false,
    });
    if (gradeId === "name_taken") return nameTaken;
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "unit_grade",
      entityId: gradeId,
      action: "create",
      diff: { before: null, after: values },
    });
    return { ok: true, gradeId, changed: true };
  });
}

export async function updateUnitGrade(
  context: AuthContext,
  gradeId: string,
  input: GradeInput,
): Promise<GradeWriteResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(gradeId).success) return failure("VALIDATION_ERROR");
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const validated = validateGrade(input);
  if (!validated.ok) return validated;
  const { organizationId, userId } = context;
  return repository.withTransaction(async (tx): Promise<GradeWriteResult> => {
    const current = await unitRepository.findGrade(
      organizationId,
      gradeId.toLowerCase(),
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    const changed = (["name", "description"] as const).filter(
      (field) => current[field] !== validated.values[field],
    );
    if (changed.length === 0) {
      return { ok: true, gradeId: current.id, changed: false };
    }
    const after = Object.fromEntries(
      changed.map((field) => [field, validated.values[field]]),
    );
    const written = await unitRepository.updateGrade(
      tx,
      organizationId,
      current.id,
      after,
    );
    if (written === "name_taken") return nameTaken;
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "unit_grade",
      entityId: current.id,
      action: "update",
      diff: {
        before: Object.fromEntries(
          changed.map((field) => [field, current[field]]),
        ),
        after,
      },
    });
    return { ok: true, gradeId: current.id, changed: true };
  });
}

// Desactivar un grado lo saca del formulario del alta; las unidades que lo tienen lo conservan.
export async function setUnitGradeActive(
  context: AuthContext,
  gradeId: string,
  isActive: boolean,
): Promise<GradeWriteResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(gradeId).success) return failure("VALIDATION_ERROR");
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const { organizationId, userId } = context;
  return repository.withTransaction(async (tx): Promise<GradeWriteResult> => {
    const current = await unitRepository.findGrade(
      organizationId,
      gradeId.toLowerCase(),
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    if (current.isActive === isActive) {
      return { ok: true, gradeId: current.id, changed: false };
    }
    await unitRepository.updateGrade(tx, organizationId, current.id, {
      isActive,
    });
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "unit_grade",
      entityId: current.id,
      action: isActive ? "reactivate" : "deactivate",
      diff: { before: { isActive: current.isActive }, after: { isActive } },
    });
    return { ok: true, gradeId: current.id, changed: true };
  });
}

export type MoveDirection = "up" | "down";

// Sube o baja un grado un lugar: la lista se renumera de 0 en adelante y el grado cambia de lugar con
// su vecino. Los grados de la organización se bloquean juntos, así que dos movimientos se ordenan.
export async function moveUnitGrade(
  context: AuthContext,
  gradeId: string,
  direction: MoveDirection,
): Promise<GradeWriteResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (
    !idSchema.safeParse(gradeId).success ||
    (direction !== "up" && direction !== "down")
  ) {
    return failure("VALIDATION_ERROR");
  }
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const { organizationId, userId } = context;
  const id = gradeId.toLowerCase();
  return repository.withTransaction(async (tx): Promise<GradeWriteResult> => {
    const grades = await unitRepository.findGrades(organizationId, tx, {
      forUpdate: true,
    });
    const index = grades.findIndex((grade) => grade.id === id);
    if (index < 0) return failure("NOT_FOUND");
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= grades.length) {
      return { ok: true, gradeId: id, changed: false };
    }
    const order = grades.map((grade) => grade.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    // Cada grado cuya posición guardada cambia queda auditado con la posición guardada, no con su
    // índice en la lista: el vecino también se mueve (revisión independiente de la 29.5, m-7).
    for (const [position, otherId] of order.entries()) {
      const grade = grades.find((candidate) => candidate.id === otherId)!;
      if (grade.position !== position) {
        await unitRepository.updateGrade(tx, organizationId, otherId, {
          position,
        });
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "unit_grade",
          entityId: otherId,
          action: "update",
          diff: {
            before: { position: grade.position },
            after: { position },
          },
        });
      }
    }
    return { ok: true, gradeId: id, changed: true };
  });
}

// La copia de los grados de un perfil de rubro (ADR 0024, punto 13; brief-29.5, D-5). La llama solo el
// script de capacidades, con el admin que nombró, dentro de la transacción que activa
// serialized_units: no autoriza nada. Un grado que la organización ya tiene, por nombre, se saltea.
// tests/guards/unit-writes.test.ts fija que nada de src/ fuera de inventory la nombra.
export type GradeTemplate = { name: string; description: string | null };

export async function applyGradeTemplate(
  tx: DbTransaction,
  input: {
    organizationId: string;
    actorUserId: string;
    grades: readonly GradeTemplate[];
  },
): Promise<{ created: string[]; skipped: string[] }> {
  const { organizationId, actorUserId } = input;
  const existing = await unitRepository.findGrades(organizationId, tx);
  const names = new Set(existing.map((grade) => grade.name.toLowerCase()));
  let position =
    existing.reduce((max, grade) => Math.max(max, grade.position), -1) + 1;
  const created: string[] = [];
  const skipped: string[] = [];
  for (const grade of input.grades) {
    if (names.has(grade.name.toLowerCase())) {
      skipped.push(grade.name);
      continue;
    }
    const values = {
      name: grade.name,
      description: grade.description,
      position: position++,
      isActive: true,
      isExample: true,
    };
    const gradeId = await unitRepository.insertGrade(
      tx,
      organizationId,
      values,
    );
    if (gradeId === "name_taken") {
      throw new Error(`grado repetido en la plantilla: ${grade.name}`);
    }
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      entityType: "unit_grade",
      entityId: gradeId,
      action: "create",
      diff: { before: null, after: { ...values, origen: "perfil" } },
    });
    names.add(grade.name.toLowerCase());
    created.push(grade.name);
  }
  return { created, skipped };
}
