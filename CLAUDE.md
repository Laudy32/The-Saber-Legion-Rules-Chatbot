# Notes for Claude

Rules chatbot for The Saber Legion (TSL), an LED saber combat organization. Answers must come only from the official TSL rulebook (Rules and Regulations, Version 4.0B). Copied from the maintainer's SoCal Swordfight chatbot (github.com/Laudy32/SoCal-Swordfight-Rules-Chatbot), which shares the same code.

## Working with the maintainer
- The maintainer is not technical. Anything they must do themselves (GitHub, Cloudflare, Google AI Studio) gets click-by-click instructions: where to go, which button, what they should see. Never assume they know terms like commit, deploy, repo, or API key. They prefer instructions in chat rather than separate documents.
- Commit and push directly to `main`, no branches or pull requests. Pushing `web/**` republishes the site via GitHub Pages (Settings > Pages > Source must be "GitHub Actions"; Claude can't change that setting through the API).
- Settings that need the maintainer's own accounts (Cloudflare Worker deploy, secrets, bindings) can't be done by Claude; changes to `worker/worker.js` only take effect after they paste it into Cloudflare and click Deploy. Say so whenever it changes.

## Layout
- `web/index.html` — chat page (GitHub Pages, https://laudy32.github.io/The-Saber-Legion-Rules-Chatbot/). `WORKER_URL` points at the Cloudflare Worker; `TURNSTILE_SITE_KEY` is the public Turnstile key. The page is styled after the rulebook PDF: Carlito (Calibri-like) headings, Tinos (Times-like) body text, Orbitron for the "United Through Sabers" tagline, white background with the rulebook's warm tan/cream colours. `web/emblem.png` (header) and `web/watermark.png` (faint background) are the TSL emblem lifted from the PDF's page watermark; swap in a higher-resolution official logo if the maintainer provides one.
- `worker/worker.js` — Cloudflare Worker `saber-legion-rules`: holds the Gemini key, owns the system prompt (`GUARDRAILS`), fetches `kiosk/rules-full.txt` from raw.githubusercontent.com (cached ~1h), calls Gemini `generateContent`. Setup guide: `worker/README.md`.
- `kiosk/` — offline Ollama + Open WebUI version for an event info table; `build-model.sh` bakes `rules-full.txt` + `guardrail-preamble.txt` into a model called `saber-legion-rules` (num_ctx 49152, since the rulebook is ~32k tokens).
- `kiosk/rules-full.txt` — single source of truth for the rulebook. Converted from the official PDF `version_4.0b_ruleset_update_9-5.pdf` (60 pages): text verbatim, table of contents and repeated footer removed, tables laid out as lists, diagram-only information written as `[Figure: ...]`, conversion notes as `[Note: ...]`. Sections use `## Section N` and `### Section N.NN` headers. Both web and kiosk read it.
- `kiosk/clarifications.txt` — official rulings from the TSL rules team ("## " title per ruling). Starts empty. Appended after the rulebook under an OFFICIAL CLARIFICATIONS header by both the Worker (`CLARIFICATIONS_URL`, same ~1h cache) and `build-model.sh` (only if the file isn't empty). When the bot gets a tricky scenario wrong and the rules team gives the answer, add a ruling here rather than special-casing the prompt. Suggested shape: `## Title`, then `Situation:`, `Ruling:`, `Why:`, `Source:` lines.

## Rulebook pitfalls worth checking after any prompt change
- Four rulesets: Standard (First Light Touch, 1 point per valid touch, no weighted targets), Exotics (Exotics Weapons Division and Heavy Exotics; reset to opposite corners after every exchange and every hold), Tag Team (Section 8), Unity (Section 9: solid contact, chambered strikes, 1-second afterblows that cancel the initial point, mandatory disengagement, Ring Marshall instead of Ring Director). "Afterblow" means opposite things in Standard and Unity.
- Section 4.01 lists the hilt as a neutral target but Section 4.04 lists it as an invalid target; the prompt tells the bot to flag this.
- Two timekeeping methods: Guaranteed Fight Time (current, 2:30) and Total Bout Time (original, 5:00); both default to 10 points to win.
- Gear has Solo/Partner, Medium Intensity (charter sparring) and High Intensity (tournament) levels.
- Section 11 is the change history; its section numbers are old.

## Abuse protection
- Cloudflare D1 database `saber-legion-rules-limits` (id 7cc98a8a-e95c-4f60-8c99-5f40794eecee, table `rate_limits(key, count, expires_at)`), bound to the Worker as `LIMITS_DB`. Limits in `LIMITS` in worker.js; keys are HMAC-scrambled device IDs / IPs. Fails open if the DB errors.
- Cloudflare Turnstile: page constant `TURNSTILE_SITE_KEY`, Worker secret `TURNSTILE_SECRET_KEY`. Both optional; each is enforced only when set. The secret must go in only after the page has the site key, or every question is rejected.
- The Cloudflare connector (when enabled in a session) can read deployed Worker code and query D1, but can't deploy code or set secrets/bindings — those stay manual for the maintainer.

## History worth knowing
- The SoCal version originally ran WebLLM in-browser; small models with a 4,096-token context invented point values and over-refused, so it moved to the Worker + Gemini with the full verbatim ruleset. This repo started from that design.
- github.io is blocked by the Claude sandbox network policy; the Gemini API and raw.githubusercontent.com are reachable.
