/**
 * UTM Foundation Hub — AI Tutor proxy (Groq — FREE)
 * Uses Groq's free API (no credit card). Keeps the key secret so students
 * need nothing. Deploy on Railway / Render / any Node host. Node 18+.
 *
 * Get a FREE key at https://console.groq.com  → API Keys  (no billing needed).
 */
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "1mb" }));

const ALLOWED = (process.env.ALLOWED_ORIGIN || "*").split(",").map((s) => s.trim());
app.use(cors({ origin: ALLOWED.includes("*") ? true : ALLOWED, methods: ["POST", "OPTIONS"] }));

// optional per-IP daily limit
const DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || "50", 10);
const counters = new Map();
function overLimit(ip) {
  if (DAILY_LIMIT <= 0) return false;
  const day = new Date().toISOString().slice(0, 10);
  const c = counters.get(ip);
  if (!c || c.day !== day) { counters.set(ip, { day, count: 1 }); return false; }
  c.count += 1;
  return c.count > DAILY_LIMIT;
}

const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Free, capable model. Others: "llama-3.1-8b-instant" (faster), "gemma2-9b-it".
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

app.get("/", (_req, res) => res.send("UTM Foundation Hub AI proxy (Groq) is running ✅"));

app.post("/api/tutor", async (req, res) => {
  if (!GROQ_KEY) return res.status(500).json({ error: { message: "Server missing GROQ_API_KEY" } });

  const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0];
  if (overLimit(ip)) return res.status(429).json({ error: { message: "Daily free limit reached. Try again tomorrow." } });

  const { system, messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: { message: "messages required" } });
  }

  // Build OpenAI-style messages (Groq is OpenAI-compatible): system first
  const msgs = [];
  if (typeof system === "string" && system.trim()) msgs.push({ role: "system", content: system });
  for (const m of messages) msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });

  try {
    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + GROQ_KEY },
      body: JSON.stringify({ model: GROQ_MODEL, messages: msgs, max_tokens: 2048, stream: true }),
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      return res.status(upstream.status || 502).json({ error: { message: "Upstream error: " + (txt.slice(0, 300) || upstream.status) } });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (e) {
    res.status(502).json({ error: { message: "Proxy error: " + (e.message || e) } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AI proxy (Groq) listening on " + PORT));
