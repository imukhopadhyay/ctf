import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Rules, help & responsible use" };

const faq: [string, string][] = [
  ["What is a flag?", "A secret string — usually in the form CQ{...} — hidden in a challenge. Submitting it proves you solved the challenge. Exact format requirements are stated on each challenge."],
  ["Are flags case-sensitive?", "By default yes. Organizers may configure individual challenges to ignore case or extra whitespace; leading and trailing spaces are always ignored."],
  ["How is scoring calculated?", "Each challenge awards its points once per participant (individual mode) or once per team (team mode). In dynamic scoring the value decreases as more teams solve it — you keep the value at the moment you solved. Hint costs and optional wrong-answer penalties are deducted. Every change appears in your score history."],
  ["How are ties broken?", "By default, whoever reached their final score first ranks higher. Some competitions instead rank fewer total submissions higher."],
  ["What is first blood?", "The first participant or team to solve a challenge. It is recognised with a badge and notification."],
  ["Why is the leaderboard frozen?", "Organizers may freeze public standings near the end so the final result is a surprise. Scores still count; they are revealed after the event."],
  ["What is an isolated environment?", "Some challenges start a disposable target just for you or your team. It has no internet access, strict CPU/memory limits and expires automatically. Only attack the address shown for your own instance."],
  ["I found a bug in the platform itself.", "Thank you! Do not exploit it. Report it privately to the organizers. Exploiting the platform is grounds for disqualification."],
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader eyebrow="help centre" title="Rules, help & responsible use" description="Everything you need to compete fairly and safely." />

      <Card id="rules">
        <CardHeader><CardTitle>Platform rules</CardTitle></CardHeader>
        <CardContent className="prose-cq text-sm">
          <ol>
            <li>Follow the specific rules published by each competition; they take precedence for that event.</li>
            <li>Flags are personal. Do not share flags, solutions or hints with other participants or teams during a competition.</li>
            <li>One account per person. In team competitions you may belong to only one team.</li>
            <li>Do not attempt to brute-force flags. Submission rates are limited and excessive guessing is logged.</li>
            <li>Organizers may adjust scores, hide teams or disqualify participants for rule violations. Every adjustment is recorded in an audit log.</li>
            <li>Disputes are resolved by the competition organizers; their decision is final.</li>
          </ol>
        </CardContent>
      </Card>

      <Card id="responsible-use" className="border-warning/40">
        <CardHeader><CardTitle className="text-warning">Responsible-use policy</CardTitle></CardHeader>
        <CardContent className="prose-cq text-sm">
          <p>CyberQuest teaches offensive techniques so that you can defend systems. By using the platform you agree to:</p>
          <ul>
            <li><strong>Attack only explicitly authorised targets</strong> — the artifacts and isolated instances a challenge provides to you.</li>
            <li><strong>Never</strong> scan, exploit or disrupt the CyberQuest platform itself, its infrastructure, other participants&apos; instances, or any third-party or institutional system.</li>
            <li>Not use challenge techniques outside the platform without written authorisation from the system owner. Unauthorised access is illegal in most jurisdictions.</li>
            <li>Handle all downloaded artifacts as untrusted. Analyse binaries and archives in a virtual machine or sandbox.</li>
            <li>Report vulnerabilities you discover in the platform privately to the organizers instead of exploiting them.</li>
          </ul>
          <p>All challenge data is synthetic: accounts, credentials, logs, network captures and disk images are fabricated for teaching purposes and contain no real personal data.</p>
          <p>Violations may result in disqualification, account suspension and referral to your institution.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Eligibility</CardTitle></CardHeader>
        <CardContent className="prose-cq text-sm">
          <ul>
            <li><strong>Open</strong> competitions accept anyone with an account.</li>
            <li><strong>Private</strong> competitions require organizer approval, typically restricted to an institution or club.</li>
            <li><strong>Invitation-only</strong> competitions require a code distributed by the organizers.</li>
            <li>Competition staff (organizers and evaluators) cannot compete in events they manage.</li>
          </ul>
        </CardContent>
      </Card>

      <Card id="categories">
        <CardHeader><CardTitle>Challenge categories</CardTitle></CardHeader>
        <CardContent className="prose-cq text-sm">
          <ul>
            <li><strong>Web exploitation</strong> — intentionally vulnerable web apps (SQL injection, XSS, IDOR, broken access control) running in isolated instances.</li>
            <li><strong>Cryptography</strong> — classical ciphers, encodings, hashing and toy encryption. Remember: <em>encoding</em> is reversible without a key, <em>hashing</em> is one-way, <em>encryption</em> needs a key.</li>
            <li><strong>Reverse engineering & binary exploitation</strong> — analyse pre-approved binaries statically or exploit toy vulnerabilities inside disposable, resource-limited containers.</li>
            <li><strong>Digital forensics & steganography</strong> — synthetic PCAPs, logs, images, audio and disk images. Reconstruct timelines and recover hidden data.</li>
          </ul>
        </CardContent>
      </Card>

      <Card id="faq">
        <CardHeader><CardTitle>FAQ</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {faq.map(([q, a]) => (
            <details key={q} className="group rounded-lg border border-border p-3">
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
