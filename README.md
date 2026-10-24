# Saber Legion Rules Helper

**Asked to test this out? Start here → [`HOW_TO_TEST.md`](./HOW_TO_TEST.md)**
(step-by-step, no GitHub or Terminal experience needed)

A chatbot that answers questions using only the official Saber Legion rulebook
(TSL Rules and Regulations, Version 4.0B) — free to run, with an offline option
for an event info table. Three pieces:

- **`web/`** — the chat page people use (published free on GitHub Pages at
  **laudy32.github.io/The-Saber-Legion-Rules-Chatbot**). Works in any modern
  browser; needs internet.
- **`worker/`** — the free Cloudflare Worker the page talks to. It sends each
  question plus the complete rulebook to Google Gemini's free tier and returns
  the answer, keeping the API key out of the public page.
  **One-time setup instructions: [`worker/README.md`](./worker/README.md).**
- **`kiosk/`** — Ollama + Open WebUI on a laptop at an event info table, with
  the same complete rulebook, running fully offline.

Both the web answers and the kiosk read the same file, `kiosk/rules-full.txt`
(the whole 60-page Version 4.0B rulebook, converted from the official PDF to
text; diagrams are described in words). Updating the rules for a new version
means replacing that one file and rebuilding the kiosk model — the web version
picks it up automatically.

Both are instructed to answer only from the rulebook, say so and point to a
Ring Director or event staff when something isn't covered, and decline "how do
I cheat" style questions — see `GUARDRAILS` in `worker/worker.js` and
`kiosk/guardrail-preamble.txt`.

## Adding an official clarification

When the rules team settles a situation the rulebook doesn't spell out, add it to `kiosk/clarifications.txt`. The chatbot treats these rulings as official and applies their reasoning to similar situations. No Cloudflare step is needed.

1. Go to **github.com/Laudy32/The-Saber-Legion-Rules-Chatbot**, click the folder **kiosk**, then the file **clarifications.txt**.
2. Click the **pencil icon** ("Edit this file"), near the top right of the file's contents.
3. Click at the very end of the file (if it's empty, just click inside it). If there are rulings already, press **Enter** twice first. Then type the new ruling in this shape:
   ```
   ## A short title for the situation
   Situation: What happened, step by step, and in what order.
   Ruling: The correct call — who scores, and any penalty.
   Why: The rule text it's based on (optional but helpful).
   Source: Who made the ruling, and when.
   ```
   Keep the `## ` at the start of the title line; that's how the chatbot tells rulings apart.
4. Click the green **Commit changes…** button, then **Commit changes** in the box that pops up.
5. The web chatbot picks it up by itself within about an hour.
6. The offline kiosk laptop only picks it up after its model is rebuilt: run `bash build-model.sh` again (see `kiosk/README.md`).

To check the web chatbot has loaded it, open the Worker's address (see `worker/README.md`, Part 4) and look for `"clarifications":{"loaded":true,"rulings":` followed by the number of rulings.
