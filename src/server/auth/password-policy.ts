// Small denylist of the most common passwords (full breach-corpus checks are a
// recommended production enhancement — see docs/SECURITY.md).
const COMMON = new Set([
  "password1234",
  "123456789012",
  "qwertyuiop12",
  "letmein12345",
  "administrator",
  "passwordpassword",
  "iloveyou1234",
  "welcome12345",
  "changeme1234",
  "cyberquest123",
]);

/** NIST SP 800-63B-style policy: length over composition rules. */
export function passwordProblems(password: string, context: { email?: string; username?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push("Password must be at least 12 characters long.");
  if (password.length > 128) problems.push("Password must be at most 128 characters long.");
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) problems.push("Password is too common.");
  if (/^(.)\1+$/.test(password)) problems.push("Password must not be a single repeated character.");
  if (context.username && context.username.length >= 3 && lower.includes(context.username.toLowerCase()))
    problems.push("Password must not contain your username.");
  const local = context.email?.split("@")[0];
  if (local && local.length >= 3 && lower.includes(local.toLowerCase()))
    problems.push("Password must not contain your email address.");
  return problems;
}
