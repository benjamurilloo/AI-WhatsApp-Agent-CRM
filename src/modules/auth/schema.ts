import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// docs/architecture/DataModel.md, tabla users (brief-3.1).
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Lo mantiene la aplicación, no un trigger: un UPDATE en SQL crudo no lo actualiza (brief-3.1, D-3).
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Email único sin distinguir mayúsculas, garantizado por la base (brief-3.1, D-5).
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
  ],
);

// ADR 0012: el id es el SHA-256 del token de la cookie; el token nunca se guarda.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// Límite de intentos de login: solo fallos, con la clave hasheada (brief-3.3, D-3).
export const loginAttemptScope = pgEnum("login_attempt_scope", [
  "account",
  "ip",
]);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: loginAttemptScope("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("login_attempts_scope_key_attempted_idx").on(
      table.scope,
      table.keyHash,
      table.attemptedAt,
    ),
  ],
);
