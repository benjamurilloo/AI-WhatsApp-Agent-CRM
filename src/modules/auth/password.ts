import { randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

// argon2id con el mínimo de OWASP, en formato PHC (brief-3.3, D-1).
// argon2id es el algoritmo por defecto de @node-rs/argon2; password.test.ts lo verifica.
const hashOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Largo sin reglas de composición (brief-3.3, D-5).
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

// Contraseña inicial de un alta (brief-3.7, D-5): 16 caracteres de un alfabeto de 32 sin
// símbolos ambiguos (sin 0, O, 1, I ni minúsculas), 80 bits, en 4 grupos separados por guion.
// El guion es parte de la contraseña: se guarda el hash de lo que se muestra.
export const INITIAL_PASSWORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INITIAL_PASSWORD_GROUPS = 4;
const INITIAL_PASSWORD_GROUP_LENGTH = 4;

export function generateInitialPassword(): string {
  return Array.from({ length: INITIAL_PASSWORD_GROUPS }, () =>
    Array.from(
      { length: INITIAL_PASSWORD_GROUP_LENGTH },
      () =>
        INITIAL_PASSWORD_ALPHABET[randomInt(INITIAL_PASSWORD_ALPHABET.length)],
    ).join(""),
  ).join("-");
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, hashOptions);
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    // Un hash almacenado ilegible no autentica a nadie.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Para un email inexistente se verifica igual contra un hash ficticio,
// así el tiempo de respuesta no revela si la cuenta existe.
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("hash-ficticio-para-igualar-tiempos");
  await verifyPassword(await dummyHash, password);
  return false;
}
