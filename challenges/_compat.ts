// Re-exports so generate-artifacts.ts needs no node: scheme juggling under tsx.
export { createHash } from "node:crypto";
export { execFileSync } from "node:child_process";
