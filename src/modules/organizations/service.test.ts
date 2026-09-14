import { describe, expect, it } from "vitest";
import {
  authorize,
  composeMemberPage,
  MEMBERS_PAGE_SIZE,
  removesLastActiveAdmin,
  type AuthContext,
} from "./service";

function context(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    role: "admin",
    mustChangePassword: false,
    sessionExpiresAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  };
}

describe("authorize", () => {
  it("un admin sin contraseña pendiente pasa con o sin requisito de rol", () => {
    expect(authorize(context(), { role: "admin" })).toEqual({ ok: true });
    expect(authorize(context())).toEqual({ ok: true });
  });

  it("un viewer pasa sin requisito de rol y recibe FORBIDDEN en una acción de admin", () => {
    const viewer = context({ role: "viewer" });
    expect(authorize(viewer)).toEqual({ ok: true });
    expect(authorize(viewer, { role: "admin" })).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("la contraseña pendiente da FORBIDDEN antes de mirar el rol", () => {
    expect(authorize(context({ mustChangePassword: true }))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      authorize(context({ mustChangePassword: true }), { role: "admin" }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});

describe("removesLastActiveAdmin", () => {
  const activeAdmin = { role: "admin", isActive: true } as const;

  it("quitar el rol o desactivar al único admin activo viola la regla", () => {
    expect(
      removesLastActiveAdmin(1, activeAdmin, {
        role: "viewer",
        isActive: true,
      }),
    ).toBe(true);
    expect(
      removesLastActiveAdmin(1, activeAdmin, {
        role: "admin",
        isActive: false,
      }),
    ).toBe(true);
  });

  it("con otro admin activo no la viola", () => {
    expect(
      removesLastActiveAdmin(2, activeAdmin, {
        role: "viewer",
        isActive: true,
      }),
    ).toBe(false);
  });

  it("reactivar, ascender o tocar a un admin inactivo nunca la viola", () => {
    expect(
      removesLastActiveAdmin(
        0,
        { role: "admin", isActive: false },
        { role: "admin", isActive: true },
      ),
    ).toBe(false);
    expect(
      removesLastActiveAdmin(
        1,
        { role: "viewer", isActive: true },
        { role: "admin", isActive: true },
      ),
    ).toBe(false);
    expect(
      removesLastActiveAdmin(
        1,
        { role: "admin", isActive: false },
        { role: "viewer", isActive: false },
      ),
    ).toBe(false);
  });
});

describe("composeMemberPage", () => {
  const self = "00000000-0000-4000-8000-000000000100";
  const createdAt = new Date("2026-09-14T00:00:00Z");

  function fixture(count: number) {
    const members = Array.from({ length: count }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      userId: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      role: i % 3 === 0 ? ("admin" as const) : ("viewer" as const),
      createdAt,
    }));
    const users = members.map((member, i) => ({
      id: member.userId,
      name: `Persona ${String(count - i).padStart(2, "0")}`,
      email: `persona${i}@example.com`,
      isActive: i % 4 !== 3,
    }));
    return { members, users };
  }

  it("ordena por nombre sin distinguir mayúsculas ni acentos y marca al propio usuario", () => {
    const members = [
      { id: "m1", userId: "u1", role: "viewer" as const, createdAt },
      { id: "m2", userId: self, role: "admin" as const, createdAt },
      { id: "m3", userId: "u3", role: "viewer" as const, createdAt },
    ];
    const users = [
      { id: "u1", name: "zoe", email: "z@example.com", isActive: true },
      { id: self, name: "Álvaro", email: "a@example.com", isActive: true },
      { id: "u3", name: "Bruno", email: "b@example.com", isActive: true },
    ];
    const page = composeMemberPage(
      members,
      users,
      { role: "all", status: "all", page: 1 },
      self,
    );
    expect(page.members.map((member) => member.name)).toEqual([
      "Álvaro",
      "Bruno",
      "zoe",
    ]);
    expect(page.members.map((member) => member.isSelf)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("filtra por rol y estado", () => {
    const { members, users } = fixture(12);
    const page = composeMemberPage(
      members,
      users,
      { role: "viewer", status: "inactive", page: 1 },
      self,
    );
    expect(page.members.length).toBeGreaterThan(0);
    expect(
      page.members.every(
        (member) => member.role === "viewer" && !member.isActive,
      ),
    ).toBe(true);
    expect(page.total).toBe(page.members.length);

    const active = composeMemberPage(
      members,
      users,
      { role: "all", status: "active", page: 1 },
      self,
    );
    expect(active.members.every((member) => member.isActive)).toBe(true);
  });

  it("pagina de a 25 y lleva una página fuera de rango a la última", () => {
    const { members, users } = fixture(30);
    const filters = { role: "all", status: "all" } as const;
    const first = composeMemberPage(
      members,
      users,
      { ...filters, page: 1 },
      self,
    );
    expect(MEMBERS_PAGE_SIZE).toBe(25);
    expect(first).toMatchObject({ total: 30, page: 1, pageCount: 2 });
    expect(first.members).toHaveLength(25);

    const second = composeMemberPage(
      members,
      users,
      { ...filters, page: 2 },
      self,
    );
    expect(second.members).toHaveLength(5);
    expect(
      composeMemberPage(members, users, { ...filters, page: 9 }, self).page,
    ).toBe(2);
    expect(
      composeMemberPage(members, users, { ...filters, page: 0 }, self).page,
    ).toBe(1);

    const empty = composeMemberPage([], [], { ...filters, page: 3 }, self);
    expect(empty).toMatchObject({
      members: [],
      total: 0,
      page: 1,
      pageCount: 1,
    });
  });

  it("no expone hashes ni columnas fuera de las previstas", () => {
    const { members, users } = fixture(1);
    const [member] = composeMemberPage(
      members,
      users,
      { role: "all", status: "all", page: 1 },
      self,
    ).members;
    expect(Object.keys(member!).sort()).toEqual([
      "email",
      "id",
      "isActive",
      "isSelf",
      "name",
      "role",
      "userId",
    ]);
  });
});
