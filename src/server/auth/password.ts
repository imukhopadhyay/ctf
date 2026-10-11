import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP Password Storage Cheat Sheet baseline for Argon2id: m=19 MiB, t=2, p=1.
const ARGON2_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (const enum; inlined for isolatedModules)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// A dummy hash verified when the account does not exist, to equalize timing.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("cyberquest-timing-equalizer-not-a-real-password");
  await verifyPassword(await dummyHash, password);
}

export { passwordProblems } from "./password-policy";
