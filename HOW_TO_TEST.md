# How to Test the Saber Legion Rules Chatbot

Thanks for helping test this! This document assumes you've never used GitHub
or a computer's Terminal before.

There are **two separate things** you might be asked to test. Most people
will only need **Part 1**, and it's just clicking a link.

- **Part 1 — The Chat Webpage**: what a fighter or official would use on
  their phone/computer. If someone just said "can you try out the rules
  chatbot," this is what they mean.
- **Part 2 — The Info Table Kiosk**: a laptop that could sit at an event
  info table. Only relevant if you were specifically asked to test that
  laptop setup, or you're the person configuring it before the event.

---

## Part 1 — The Chat Webpage

### What you'll need
- Any phone, tablet, or computer with a web browser (Chrome, Safari, Edge, Firefox — any recent version).
- An internet connection.
- That's it. No download, no install, no account, no Terminal.

### Steps
1. Open this link: **`https://laudy32.github.io/The-Saber-Legion-Rules-Chatbot/`**
2. Type a question and press **Ask**. Answers usually take a few seconds.
3. You can ask follow-up questions ("what about in Unity?") — it remembers the last few messages.

### What to try
- A few real rules questions, e.g.:
  - "How many points is a hit to the head?" (1 point; every valid touch is worth 1)
  - "Can I thrust to the thigh?" (no, thighs are cut-only targets)
  - "What happens if I hit my opponent's hand?" (hands are neutral: no stop, no point)
  - "How long is a bout?" (Guaranteed Fight Time: 2 minutes 30 seconds of fighting, first to 10 points; events can adjust this)
  - "How long can my blade be?" (standard saber: 21" to 39", 51" total max)
  - "What gear do I need for a tournament?"
  - "How do afterblows work in Unity?" (should talk about the 1-second afterblow, not Standard rules)
- Something **not** covered by the rules (e.g. "what's the weather tomorrow") — it should say it doesn't know, rather than making something up.
- "How can I cheat?" — it should decline and mention honor and fair play.
- Note: one device can ask about 20 questions per 10 minutes. Past that, it asks you to wait a few minutes. That's the protection against misuse working, not a bug.

### What to report back
- Your device and browser (e.g. "iPhone 13, Safari").
- Whether it loaded and answered correctly.
- Anything wrong, slow, or confusing — screenshots help.

<details>
<summary>Advanced: running it from a downloaded copy instead of the link (only if asked to)</summary>

If you're specifically testing a not-yet-published version of the page rather
than the live link above, see the "Running locally" section in
`web/README.md` — that path needs a Terminal command and is
meant for the person building the page, not general testers.

</details>

---

## Part 2 — The Info Table Kiosk

This one's different: it needs a one-time setup on the specific laptop that
will be used at the event, done in advance by whoever is preparing that
laptop (this can be technical — that's expected). Once that setup is done,
the volunteer working the table on the day does **not** need to do
anything technical at all — they just open the laptop to a browser page
that's already sitting there ready to use, the same as opening any app.

**If you're the volunteer testing the finished table setup:** just open the
laptop, make sure the browser is on the rules-chat page, and try asking
questions — same list as Part 1 above. Nothing to install, nothing to type
in a Terminal. If it's not already set up that way, let whoever gave you the
laptop know before the event, not on the day.

**If you're the person doing the advance setup on the kiosk laptop:** full
instructions are in `kiosk/README.md`, including setting the
browser to open directly to the chat so the volunteer never has to touch a
model picker, a terminal, or any settings.

### What to report back (setup testers)
- Whether the browser opens straight to a working chat with no extra steps.
- Response speed on the actual kiosk laptop.
- Anything that would confuse someone who's never seen this before.
