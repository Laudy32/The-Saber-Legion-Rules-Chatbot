# Saber Legion Rules Helper — web page

A single static page (`index.html`) with a chat box. It sends each question to
the answer service in `../worker/` (a free Cloudflare Worker), which asks Google
Gemini to answer from the **complete Saber Legion rulebook, Version 4.0B**
(`../kiosk/rules-full.txt`). Published for free with GitHub Pages at
https://laudy32.github.io/The-Saber-Legion-Rules-Chatbot/. The page has two
settings, `WORKER_URL` and `TURNSTILE_SITE_KEY` — see `../worker/README.md` for
setup.

The look follows the rulebook PDF: white background, Calibri-style headings,
Times-style body text, and its warm tan and cream colours. `emblem.png` is the emblem from the PDF's page watermark (low resolution).
To use an official, sharper logo, upload it to this folder and change the
`src` of the `<img class="logo">` tag in `index.html`.

## Why it works this way
This page is copied from the SoCal Swordfight rules chatbot. Its first version
ran a small AI model inside the browser, which could only see a short summary
of the rules and made real mistakes (inventing point values, refusing questions
the rules clearly answer). Gemini's context window fits the entire rulebook
with plenty of room, and it's a far more capable model.

Trade-offs of this approach:
- **Needs internet** to answer (only a small question/answer is sent, so weak
  WiFi is usually fine). The kiosk (`../kiosk/`) remains the offline option.
- **Free-tier limits** on Gemini cap how many questions can be answered per day.
- **Privacy:** questions go to Google. The page says so.
- In exchange: works in any modern browser on any device (no model download),
  and follow-up questions work because recent conversation is sent along.

## Running locally
Serve this folder over HTTP and open it:
```
cd web
python3 -m http.server 8000
```
Then open `http://localhost:8000`. `localhost:8000` is already allowed by the
Worker, so this works against the deployed Worker once `WORKER_URL` is set.
(The Turnstile human check only works on `laudy32.github.io`, so leave
`TURNSTILE_SITE_KEY` empty when testing locally, or test on the live page.)

## Updating the rules
Nothing to change here — replace `../kiosk/rules-full.txt` and the Worker picks
it up within about an hour.
