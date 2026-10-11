# CyberQuest challenge sources

Illustrative, **intentionally vulnerable or synthetic** challenge material — at
least two examples per category. Everything here is either for the isolated
runner or for offline download. Never deploy these images on the main
application host.

| Category | Challenge | Access | Flag source |
| --- | --- | --- | --- |
| Web | SQL injection login bypass (`web/sqli-login`) | instance | per-instance (`$FLAG`) |
| Web | IDOR notes (`web/idor-notes`) | instance | per-instance (`$FLAG`) |
| Crypto | Caesar intercept (`build/artifacts/crypto-caesar.txt`) | offline | static (seed) |
| Crypto | Multi-stage Base64 → Vigenère (`build/artifacts/crypto-multistage.txt`) | offline | static (seed) |
| Reverse | Hardcoded key (`pwn/hardcoded-key`, ELF) | offline binary | static (compiled in) |
| Reverse | Toy stack bounds write-up (documented) | offline | static |
| Forensics | PCAP credential exfil (`build/artifacts/forensics-exfil.pcap`) | offline | static |
| Forensics | Appended-ZIP steganography (`build/artifacts/forensics-stego.png`) | offline | static |

The vulnerable web apps read their flag from the `$FLAG` environment variable,
which the runner injects as the unique **per-instance** flag — so a flag
captured in one team's instance never validates for another, and submitting
one team's flag from another account raises a `FLAG_SHARING_SUSPECTED` event.

* `build.sh` — builds the two Docker images (requires a Docker daemon).
* `generate-artifacts.ts` — produces the offline crypto / forensics / reverse
  artifacts into `build/artifacts/`, printing each file's SHA-256 and the flag
  to configure in the matching challenge. Run with:
  `npx tsx challenges/generate-artifacts.ts`

The seed script registers these challenges and wires the generated static
flags automatically when the artifacts have been generated.
