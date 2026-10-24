# Saber Legion Rules Helper — event kiosk (Ollama + Open WebUI)

The offline version: runs locally on a laptop with the **complete** Saber
Legion rulebook (Version 4.0B, about 32,000 tokens) as its knowledge source.
It needs no internet at all once set up, so it suits an event info table
with unreliable WiFi. For the free, install-nothing web version people can
use from anywhere, see `../web/`.

## One-time setup (do this before the event, on the laptop that will run the kiosk)

1. **Install Ollama**: https://ollama.com/download (Mac/Windows/Linux).
2. **Build the rules-aware model**:
   ```
   cd kiosk
   bash build-model.sh
   ```
   (Using `bash build-model.sh` rather than `./build-model.sh` avoids
   needing the file's executable permission bit set, which some download/
   upload methods don't preserve.)

   This pulls a base model (`llama3.1:8b` by default) and bakes the full
   rulebook in as its system prompt, producing a model called
   `saber-legion-rules`. It uses a 49,152-token context so the whole
   rulebook fits, which needs a fair amount of memory (16 GB of RAM or
   more is comfortable). On a weaker laptop, use a smaller base model:
   ```
   bash build-model.sh llama3.2:3b
   ```
   (or `llama3.2:1b` for the lightest option — lower answer quality, but
   noticeably faster on old hardware).
3. **Install Open WebUI** (a free, point-and-click chat interface for
   Ollama models — this is what the non-technical volunteer actually uses
   on the day):
   ```
   docker run -d -p 3000:8080 --add-host=host.docker.internal:host-gateway \
     -v open-webui:/app/backend/data --name open-webui \
     --restart always ghcr.io/open-webui/open-webui:main
   ```
   (Requires Docker Desktop. If Docker isn't available, Open WebUI also
   installs via `pip install open-webui && open-webui serve` — see
   https://docs.openwebui.com for current options.)
4. Open `http://localhost:3000`, create a local admin account (this stays
   on the laptop, no internet needed after Docker/pip install), and select
   **saber-legion-rules** as the model in a new chat. Confirm it answers
   correctly and declines out-of-scope questions.
5. Optional but recommended for a walk-up kiosk: set the browser to open
   directly to that chat in full-screen/kiosk mode, so a volunteer never
   needs to touch a model picker or settings menu.

## Running on the day

Just have the laptop on, with Open WebUI already running (step 3 stays up
in the background) and the browser open to the chat. No internet needed —
everything (model + rulebook + interface) runs locally.

## Before the event: test on the actual hardware you'll use

- Confirm response speed is acceptable with a real conversation, on the
  actual laptop (not a faster dev machine). If `llama3.1:8b` is too slow,
  drop to `llama3.2:3b` and rebuild.
- Confirm it stays grounded in the rulebook and doesn't answer from general
  saber or fencing knowledge when the rulebook doesn't cover something.

## Updating the rules (e.g. for a new rulebook version)

1. Convert the new rulebook PDF to plain text in the same format as
   `rules-full.txt`: `## Section N` and `### Section N.NN` headers, the
   table of contents and repeated page footer removed, tables written as
   lists, and anything shown only in a picture described as
   `[Figure: ...]`. (Asking Claude to do this works well.)
2. Replace `rules-full.txt` with the new version.
3. Re-run `bash build-model.sh` to rebuild the `saber-legion-rules` model
   with the updated content.
4. Commit the new `rules-full.txt` to GitHub — the web version reads this
   same file and picks up the change automatically within about an hour.
