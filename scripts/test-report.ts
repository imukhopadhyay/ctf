/**
 * Produces an honest test report from the Vitest JSON output, distinguishing
 * passed / failed / skipped / todo, grouped by suite. Writes reports/TEST-REPORT.md.
 * Run after `npm test` (or any vitest run): npm run test:report
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const jsonPath = path.join(process.cwd(), "reports", "vitest-results.json");
if (!existsSync(jsonPath)) {
  console.error("No reports/vitest-results.json found. Run `npm test` first.");
  process.exit(1);
}
const data = JSON.parse(readFileSync(jsonPath, "utf8"));
const results: { name: string; assertionResults: { title: string; fullName: string; status: string }[] }[] = data.testResults ?? [];

const counts = { passed: 0, failed: 0, skipped: 0, todo: 0 };
const lines: string[] = [];
const category = (f: string) =>
  f.includes("/unit/") ? "Unit" : f.includes("/integration/") ? "Integration" : f.includes("/security/") ? "Security" : f.includes("/runner/") ? "Runner (live)" : "Other";
const groups: Record<string, { file: string; tests: { title: string; status: string }[] }[]> = {};

for (const file of results) {
  const cat = category(file.name);
  (groups[cat] ??= []).push({ file: path.relative(process.cwd(), file.name), tests: file.assertionResults.map((a) => ({ title: a.fullName || a.title, status: a.status })) });
  for (const a of file.assertionResults) {
    if (a.status === "passed") counts.passed++;
    else if (a.status === "failed") counts.failed++;
    else if (a.status === "todo") counts.todo++;
    else counts.skipped++;
  }
}

const icon: Record<string, string> = { passed: "✅", failed: "❌", skipped: "⏭️ (skipped)", todo: "📝 (todo)", pending: "⏭️ (skipped)" };
lines.push("# CyberQuest CTF — Test Execution Report", "", `Generated: ${new Date().toISOString()}`, "");
lines.push("## Summary", "", "| Result | Count |", "| --- | --- |", `| ✅ Passed | ${counts.passed} |`, `| ❌ Failed | ${counts.failed} |`, `| ⏭️ Skipped | ${counts.skipped} |`, `| 📝 Todo / not implemented | ${counts.todo} |`, `| **Total** | **${counts.passed + counts.failed + counts.skipped + counts.todo}** |`, "");
lines.push(counts.failed === 0 ? "All executed tests passed." : `⚠️ ${counts.failed} test(s) failed — see below.`, "");
lines.push("> Skipped suites are integration tests gated on external infrastructure (e.g. the live Docker runner tests run only with `RUN_DOCKER_TESTS=1`). They are reported here as skipped, never as passed.", "");

for (const [cat, files] of Object.entries(groups)) {
  lines.push(`## ${cat}`, "");
  for (const f of files) {
    lines.push(`### \`${f.file}\``, "");
    for (const t of f.tests) lines.push(`- ${icon[t.status] ?? t.status} ${t.title}`);
    lines.push("");
  }
}

const out = path.join(process.cwd(), "reports", "TEST-REPORT.md");
writeFileSync(out, lines.join("\n"));
console.log(`Wrote ${out}`);
console.log(`Passed ${counts.passed}, failed ${counts.failed}, skipped ${counts.skipped}, todo ${counts.todo}`);
if (counts.failed > 0) process.exit(1);
