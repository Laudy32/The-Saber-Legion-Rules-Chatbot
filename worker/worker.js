// Saber Legion Rules Helper — Cloudflare Worker.
// Receives a question from the web page, sends it to Google Gemini together with
// the full official ruleset, and returns the answer. The Gemini API key lives only
// here (as the GEMINI_API_KEY secret), never in the public web page.

// ---- Settings you may need to change ----------------------------------------
// Preferred Gemini model. If it's retired, overloaded, or out of free quota, the
// Worker falls back to other available Flash (then Flash-Lite) models by itself.
const MODEL = "gemini-flash-latest";
const RULES_URL =
  "https://raw.githubusercontent.com/Laudy32/The-Saber-Legion-Rules-Chatbot/main/kiosk/rules-full.txt";
// Official rulings from the rules team on situations the ruleset doesn't spell out.
const CLARIFICATIONS_URL =
  "https://raw.githubusercontent.com/Laudy32/The-Saber-Legion-Rules-Chatbot/main/kiosk/clarifications.txt";
const ALLOWED_ORIGINS = [
  "https://laudy32.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

// Abuse protection (active once the LIMITS_DB database is connected to this Worker).
// "device" = one browser; "network" = one internet address, which a whole venue WiFi or
// phone carrier can share — so network limits are loose, only a backstop against floods.
const LIMITS = [
  { name: "device-10min", by: "device", windowSeconds: 600, max: 20,
    message: "You've asked a lot of questions in a short time. Please wait a few minutes, then try again." },
  { name: "device-day", by: "device", windowSeconds: 86400, max: 100,
    message: "You've reached today's question limit on this device. It resets tomorrow; for anything urgent, please ask event staff." },
  { name: "network-10min", by: "network", windowSeconds: 600, max: 150,
    message: "A lot of questions are coming from your network right now. Please try again in a few minutes, or ask event staff." },
  { name: "network-day", by: "network", windowSeconds: 86400, max: 600,
    message: "A lot of questions are coming from your network right now. Please try again later, or ask event staff." },
];
// -----------------------------------------------------------------------------

const RULES_CACHE_SECONDS = 3600;
const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_TURN_CHARS = 2000;
const TRANSIENT_STATUSES = [500, 502, 503, 504];
const RETRY_DELAYS_MS = [1000, 2500];
// Models tried per question: at most MAX_MODEL_FAILURES that are overloaded or retired
// (slow), but quick "out of free quota" answers are skipped past, up to MAX_MODELS_TRIED.
const MAX_MODEL_FAILURES = 4;
const MAX_MODELS_TRIED = 15;
const MODEL_LIST_CACHE_SECONDS = 3600;

const GUARDRAILS = `You answer questions about The Saber Legion (TSL) LED saber combat rules for fighters, officials, and spectators.

- Answer using ONLY the official rulebook below (TSL Rules and Regulations, Version 4.0B). Do not use outside knowledge about saber combat, HEMA, fencing, other lightsaber leagues, or other events' rules.
- When the rulebook states the answer, give it directly and confidently, even if the question is worded differently from the text. Mention the section number when it helps (for example, "Section 5.11").
- If the rulebook doesn't cover it, say so plainly and suggest asking a Ring Director or event staff. Never invent point values, measurements, times, or other specifics.
- TSL has several rulesets: Standard (First Light Touch), Exotics (the Exotics Weapons Division and Heavy Exotics), Tag Team, and Unity. If the question doesn't say which, answer for Standard and mention when Exotics, Tag Team, or Unity work differently. Tag Team and Unity follow the Standard rules except where their own sections say otherwise.
- Scoring differs by ruleset. In Standard, any touch to a valid target scores 1 point no matter how light, there are no weighted targets, and strikes after a valid touch are afterblows that do not score. In Unity, only solid contact from a chambered strike scores, and an afterblow already in motion that lands within 1 second cancels the initial point. Use the section that matches the question.
- For target questions, use the contact types in Section 4.01 to 4.04: cut-or-thrust targets, cut-only targets, neutral targets (hands, hilt or saber), and invalid targets. If two sections disagree (for example, the hilt is listed as neutral in 4.01 but as an invalid target in 4.04), say so and suggest confirming with the Ring Director.
- Timekeeping: Guaranteed Fight Time (Section 5.05) is the current method and Total Bout Time (Section 5.04) is the original one. Give the current method unless asked about the original, and note that events may adjust times and winning scores.
- Gear: tournaments and official events use the High Intensity (Tournament Level) requirements; Medium Intensity is for sparring at charter meets. Give the level that matches the question. Final gear and saber approval always rests with the gear inspector and the onsite Tournament Director, so say so for "is my gear/saber allowed" questions.
- The rulebook covers Official TSL Events. Charter meets have flexibility to run their own games and formats, so for meet-specific questions suggest checking with the local Charter Representative.
- Text in square brackets marked [Figure: ...] describes a diagram in the PDF, and [Note: ...] is a conversion note; you may use both. Section 11 is the document's change history: use the earlier sections for current rules.
- The OFFICIAL CLARIFICATIONS section after the rulebook holds rulings from the Saber Legion rules team. They are official: where one applies, follow it over your own reading of the rulebook, and apply its reasoning to similar situations.
- If asked how to cheat, break the rules, or gain an unfair advantage, decline and note that TSL expects honor, good sportsperson-ship, and following event staff instructions.
- For safety concerns, injuries, disputed calls, or gear approval, point the person to the Ring Director or event staff even when the rulebook has relevant text.
- Keep answers short: a few sentences or a brief list. Plain text only, no markdown formatting.

--- OFFICIAL RULEBOOK ---
`;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

let rulesCache = { text: null, clarifications: "", fetchedAt: 0 };
let activeModel = MODEL;
let modelListCache = { lists: null, fetchedAt: 0 };
// model name -> { until: timestamp ms, daily: boolean } for models out of free quota
const exhausted = new Map();

// Returns { text, clarifications }. The ruleset is required; clarifications are optional.
async function loadRules() {
  const now = Date.now();
  if (rulesCache.text && now - rulesCache.fetchedAt < RULES_CACHE_SECONDS * 1000) {
    return rulesCache;
  }
  const [res, clarRes] = await Promise.all([
    fetch(RULES_URL, { cf: { cacheTtl: RULES_CACHE_SECONDS } }),
    fetch(CLARIFICATIONS_URL, { cf: { cacheTtl: RULES_CACHE_SECONDS } }).catch(() => null),
  ]);
  if (!res.ok) throw new Error(`Rules fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error("Rules file is empty");
  let clarifications = "";
  if (clarRes && clarRes.ok) {
    clarifications = (await clarRes.text()).trim();
  } else {
    console.log("No clarifications loaded:", clarRes ? `HTTP ${clarRes.status}` : "fetch failed");
  }
  rulesCache = { text, clarifications, fetchedAt: now };
  return rulesCache;
}

function knowledgeText({ text, clarifications }) {
  return clarifications
    ? `${text}\n\n--- OFFICIAL CLARIFICATIONS FROM THE SABER LEGION RULES TEAM ---\n${clarifications}`
    : text;
}

// ---- Choosing a model --------------------------------------------------------

function modelVersion(name) {
  return parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || "0");
}

// Best first: a "-latest" alias, then the newest version, then the plainest name.
function rankModels(names) {
  return [...names].sort(
    (a, b) =>
      Number(b.endsWith("-latest")) - Number(a.endsWith("-latest")) ||
      modelVersion(b) - modelVersion(a) ||
      a.length - b.length,
  );
}

function preferStable(names) {
  const stable = names.filter((name) => !/preview|exp/i.test(name));
  return rankModels(stable.length ? stable : names);
}

async function listModels(apiKey) {
  const now = Date.now();
  if (modelListCache.lists && now - modelListCache.fetchedAt < MODEL_LIST_CACHE_SECONDS * 1000) {
    return modelListCache.lists;
  }
  const res = await fetch(`${GEMINI_BASE}/models?pageSize=1000`, {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`Model list failed: HTTP ${res.status}`);
  const data = await res.json();
  const usable = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter((name) => /flash/i.test(name) && !/tts|image|live|audio|embed/i.test(name));
  const lists = {
    flash: preferStable(usable.filter((name) => !/lite/i.test(name))),
    lite: preferStable(usable.filter((name) => /lite/i.test(name))),
  };
  modelListCache = { lists, fetchedAt: now };
  return lists;
}

function isExhausted(model, now = Date.now()) {
  const entry = exhausted.get(model);
  if (entry && entry.until > now) return true;
  exhausted.delete(model);
  return false;
}

// Google's free daily quotas reset at midnight Pacific time.
function msUntilPacificMidnight(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const secondsIntoDay = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return (86400 - secondsIntoDay) * 1000;
}

function describeQuota(quotaId) {
  const id = quotaId || "";
  const what = /Token/i.test(id) ? "input tokens" : "requests";
  const per = /PerDay/i.test(id) ? "per day" : /PerMinute/i.test(id) ? "per minute" : "";
  return `${what} ${per}`.trim();
}

// Reads Google's "out of quota" (429) error: which limit, for which model, and when to retry.
function parseQuotaError(bodyText) {
  let error;
  try {
    error = JSON.parse(bodyText).error || {};
  } catch {
    error = {};
  }
  const details = error.details || [];
  const violations = details.flatMap((d) => d.violations || []);
  const retryDelay = details.find((d) => d.retryDelay)?.retryDelay;
  return {
    daily: violations.some((v) => /PerDay/i.test(v.quotaId || "")),
    retrySeconds: retryDelay ? parseFloat(retryDelay) : null,
    quotaModel: violations.find((v) => v.quotaDimensions?.model)?.quotaDimensions.model || null,
    summary: violations.map((v) => `${describeQuota(v.quotaId)} limit ${v.quotaValue}`).join("; "),
  };
}

function markExhausted(models, quota) {
  const until = Date.now() + (quota.daily ? msUntilPacificMidnight() : (quota.retrySeconds || 60) * 1000);
  for (const model of models) {
    if (model) exhausted.set(model, { until, daily: quota.daily });
  }
}

// ---- Calling Gemini ------------------------------------------------------------

function callGemini(model, apiKey, payload) {
  return fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload),
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Google's free tier is sometimes briefly overloaded; wait and try again before giving up.
async function callGeminiWithRetry(model, apiKey, payload) {
  let res = await callGemini(model, apiKey, payload);
  for (const delay of RETRY_DELAYS_MS) {
    if (!TRANSIENT_STATUSES.includes(res.status)) break;
    const errText = await res.text().catch(() => "");
    console.log(`Gemini ${res.status} on "${model}", retrying in ${delay}ms:`, errText.slice(0, 200));
    await sleep(delay);
    res = await callGemini(model, apiKey, payload);
  }
  return res;
}

// Tries the preferred model, then other Flash models, then Flash-Lite, skipping any that are
// retired or out of free quota. Returns { res, model, preferredRetired } or { failure }.
async function askGemini(apiKey, payload) {
  const tried = new Set();
  let preferredRetired = false;
  let lists = null;
  let failure = null;
  let slowFailures = 0;

  while (tried.size < MAX_MODELS_TRIED && slowFailures < MAX_MODEL_FAILURES) {
    let model = null;
    if (tried.size === 0 && !isExhausted(activeModel)) {
      model = activeModel;
    } else {
      if (!lists) {
        try {
          lists = await listModels(apiKey);
        } catch (err) {
          console.log("Model list failed:", err.message);
          break;
        }
      }
      model = [activeModel, ...lists.flash, ...lists.lite].find((m) => !tried.has(m) && !isExhausted(m));
    }
    if (!model) break;
    tried.add(model);

    const res = await callGeminiWithRetry(model, apiKey, payload);
    if (res.ok) return { res, model, preferredRetired };

    const text = await res.text().catch(() => "");
    failure = { status: res.status, text, model };
    console.log(`Gemini ${res.status} on "${model}":`, text.slice(0, 500));

    if (res.status === 404 && model === activeModel) preferredRetired = true;
    if (res.status === 429) {
      const quota = parseQuotaError(text);
      failure.quota = quota;
      markExhausted([model, quota.quotaModel], quota);
    } else if (res.status === 404 || TRANSIENT_STATUSES.includes(res.status)) {
      slowFailures++;
    } else {
      break; // key or request problem: another model won't help
    }
  }
  return { failure };
}

// ---- Abuse protection ----------------------------------------------------------------

// Cloudflare Turnstile: proves the question came from a real browser on the rules page.
// Only enforced once the TURNSTILE_SECRET_KEY secret is set on this Worker.
async function verifyHuman(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true };
  if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, reason: "missing token" };
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  let data;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    data = await res.json();
  } catch (err) {
    // Cloudflare's checker itself is unreachable: let the question through rather than
    // take the chatbot down; the per-device limits still apply.
    console.log("Turnstile verify unavailable (allowing):", err.message);
    return { ok: true };
  }
  if (data.success) return { ok: true };
  return { ok: false, reason: (data["error-codes"] || []).join(", ") || "rejected" };
}

// Scrambles device IDs and internet addresses before storing them, so the database never
// holds anyone's real address.
async function scramble(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return [...signature.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const COUNT_SQL =
  "INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2) " +
  "ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count";

// Counts this question against each limit; returns the first limit exceeded, or null.
async function checkLimits(env, ctx, deviceId, ip) {
  if (!env.LIMITS_DB) return null;
  try {
    const secret = env.GEMINI_API_KEY;
    const network = await scramble(secret, `ip:${ip || "unknown"}`);
    const device = deviceId ? await scramble(secret, `device:${deviceId}`) : `net-${network}`;
    const now = Date.now();
    const statements = LIMITS.map((limit) => {
      const window = Math.floor(now / 1000 / limit.windowSeconds);
      const who = limit.by === "device" ? device : network;
      const expiresAt = (window + 1) * limit.windowSeconds * 1000;
      return env.LIMITS_DB.prepare(COUNT_SQL).bind(`${limit.name}:${who}:${window}`, expiresAt);
    });
    const results = await env.LIMITS_DB.batch(statements);
    if (Math.random() < 0.02 && ctx) {
      ctx.waitUntil(
        env.LIMITS_DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?1").bind(now).run().catch(() => {}),
      );
    }
    return LIMITS.find((limit, i) => (results[i]?.results?.[0]?.count ?? 0) > limit.max) || null;
  } catch (err) {
    console.log("Limit check failed (allowing):", err.message);
    return null;
  }
}

function validDeviceId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;
}

// ---- Responses -------------------------------------------------------------------

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const turns = history
    .filter(
      (t) =>
        t &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.text === "string" &&
        t.text.trim(),
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.text.slice(0, MAX_HISTORY_TURN_CHARS) }],
    }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

function googleDetail(status, model, bodyText) {
  let message = bodyText;
  try {
    message = JSON.parse(bodyText).error?.message || bodyText;
  } catch {}
  return `Google ${status} (${model}): ${String(message).replace(/\s+/g, " ").slice(0, 150)}`;
}

const QUOTA_MESSAGES = {
  daily:
    "The rules helper has used up its free questions for today. It resets overnight (midnight Pacific time). Until then, please ask event staff.",
  minute: "The rules helper is getting a lot of questions right now. Please try again in about a minute.",
};

// Every model is out of free quota (so nothing was even tried this time).
function allExhaustedResponse(origin) {
  const now = Date.now();
  const entries = [...exhausted.entries()].filter(([, e]) => e.until > now);
  const anyMinute = entries.some(([, e]) => !e.daily);
  const detail = `All models out of free quota: ${entries
    .map(([m, e]) => `${m} until ${new Date(e.until).toISOString()}`)
    .join(", ")}`;
  return json({ error: anyMinute ? QUOTA_MESSAGES.minute : QUOTA_MESSAGES.daily, detail }, 429, origin);
}

function failureResponse(failure, origin) {
  const { status, text, model, quota } = failure;
  if (status === 429) {
    const detail = quota.summary
      ? `Google 429 (${model}): ${quota.summary}${quota.retrySeconds ? `; retry in ${Math.ceil(quota.retrySeconds)}s` : ""}`
      : googleDetail(status, model, text);
    const now = Date.now();
    const onlyDaily = [...exhausted.values()].every((e) => e.until <= now || e.daily);
    return json({ error: onlyDaily ? QUOTA_MESSAGES.daily : QUOTA_MESSAGES.minute, detail }, 429, origin);
  }
  let error = "The AI service had a problem answering. Please try again in a moment.";
  let httpStatus = 502;
  if (status === 404) {
    error = `Setup problem: the AI model "${model}" isn't available and no replacement was found. Please let event staff know.`;
  } else if (status === 400 && /API key/i.test(text)) {
    error = "Setup problem: the AI service key isn't valid. Please let event staff know.";
  } else if (status === 401 || status === 403) {
    error = "Setup problem: the AI service rejected this helper's key. Please let event staff know.";
  }
  return json({ error, detail: googleDetail(status, model, text) }, httpStatus, origin);
}

// ---- Request handlers -------------------------------------------------------------

async function limitsStatus(env) {
  if (!env.LIMITS_DB) return "off (LIMITS_DB database not connected)";
  try {
    await env.LIMITS_DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first();
    return "on";
  } catch (err) {
    return `error: ${err.message}`;
  }
}

async function handleHealth(env, origin) {
  let rules = { ok: false };
  let clarifications = { loaded: false, rulings: 0 };
  try {
    const loaded = await loadRules();
    rules = { ok: true, characters: loaded.text.length };
    clarifications = {
      loaded: Boolean(loaded.clarifications),
      rulings: (loaded.clarifications.match(/^## /gm) || []).length,
    };
  } catch (err) {
    rules = { ok: false, error: err.message };
  }
  const now = Date.now();
  const model = {
    preferred: MODEL,
    inUse: activeModel,
    outOfFreeQuota: Object.fromEntries(
      [...exhausted.entries()]
        .filter(([, e]) => e.until > now)
        .map(([m, e]) => [m, { until: new Date(e.until).toISOString(), daily: e.daily }]),
    ),
  };
  if (env.GEMINI_API_KEY) {
    try {
      const lists = await listModels(env.GEMINI_API_KEY);
      model.availableFlashModels = lists.flash;
      model.availableFlashLiteModels = lists.lite;
    } catch (err) {
      model.availableFlashModels = { error: err.message };
    }
  }
  return json(
    {
      status: "ok",
      message: "Saber Legion rules helper is running. The web page sends questions here with POST.",
      apiKeyConfigured: Boolean(env.GEMINI_API_KEY),
      rules,
      clarifications,
      model,
      protection: {
        humanCheck: env.TURNSTILE_SECRET_KEY ? "on" : "off (TURNSTILE_SECRET_KEY not set)",
        limits: await limitsStatus(env),
        limitRules: LIMITS.map((l) => `${l.max} per ${l.windowSeconds === 86400 ? "day" : `${l.windowSeconds / 60} minutes`} per ${l.by}`),
      },
    },
    200,
    origin,
  );
}

async function handleAsk(request, env, ctx, origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "Requests are only accepted from the Saber Legion rules page." }, 403, origin);
  }
  if (!env.GEMINI_API_KEY) {
    return json({ error: "Setup problem: no AI service key configured. Please let event staff know." }, 500, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400, origin);
  }
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return json({ error: "Please type a question." }, 400, origin);
  if (question.length > MAX_QUESTION_CHARS) {
    return json({ error: `Please keep questions under ${MAX_QUESTION_CHARS} characters.` }, 400, origin);
  }

  const ip = request.headers.get("CF-Connecting-IP");
  const human = await verifyHuman(env, body.humanToken, ip);
  if (!human.ok) {
    return json(
      {
        error: "Couldn't confirm this question came from a person using the rules page. Please reload the page and try again.",
        code: "human_check_failed",
        detail: `Human check: ${human.reason}`,
      },
      403,
      origin,
    );
  }
  const limitHit = await checkLimits(env, ctx, validDeviceId(body.deviceId), ip);
  if (limitHit) {
    return json({ error: limitHit.message, code: "rate_limited", detail: `Limit: ${limitHit.name}` }, 429, origin);
  }

  let rules;
  try {
    rules = await loadRules();
  } catch (err) {
    console.log("Rules load error:", err.message);
    return json({ error: "Couldn't load the ruleset right now. Please try again in a moment." }, 502, origin);
  }

  const payload = {
    systemInstruction: { parts: [{ text: GUARDRAILS + knowledgeText(rules) }] },
    contents: [...cleanHistory(body.history), { role: "user", parts: [{ text: question }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  };

  const { res, model, preferredRetired, failure } = await askGemini(env.GEMINI_API_KEY, payload);
  if (!res) {
    return failure ? failureResponse(failure, origin) : allExhaustedResponse(origin);
  }
  if (preferredRetired) {
    console.log(`Model "${activeModel}" retired; switching to "${model}"`);
    activeModel = model;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const answer = (candidate?.content?.parts || [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();

  if (!answer) {
    const reason = data.promptFeedback?.blockReason || candidate?.finishReason || "empty response";
    console.log("Empty answer:", reason);
    return json(
      { error: "No answer came back for that one. Try rephrasing, or ask event staff.", detail: `Google (${model}): ${reason}` },
      502,
      origin,
    );
  }
  return json({ answer }, 200, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method === "GET") return handleHealth(env, origin);
    if (request.method === "POST") {
      try {
        return await handleAsk(request, env, ctx, origin);
      } catch (err) {
        console.log("Unexpected error:", err.stack || err.message);
        return json(
          { error: "Something went wrong. Please try again in a moment.", detail: String(err.message).slice(0, 150) },
          500,
          origin,
        );
      }
    }
    return json({ error: "Method not allowed." }, 405, origin);
  },
};
