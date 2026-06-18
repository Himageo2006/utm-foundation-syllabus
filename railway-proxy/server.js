/**
 * UTM Foundation Hub — AI Tutor proxy
 * Keeps the Anthropic API key secret so students don't need their own.
 * Deploy on Railway (or any Node host). Node 18+ required (built-in fetch).
 */
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "1mb" }));

// ---- CORS: allow your site to call this proxy ----
const ALLOWED = (process.env.ALLOWED_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim());
app.use(
  cors({
    origin: ALLOWED.includes("*") ? true : ALLOWED,
    methods: ["POST", "OPTIONS"],
  })
);

// ---- Simple per-IP daily limit (optional) ----
const DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || "30", 10);
const counters = new Map(); // ip -> { day, count }
function overLimit(ip) {
  if (DAILY_LIMIT <= 0) return false; // 0 = unlimited
  const day = new Date().toISOString().slice(0, 10);
  const c = counters.get(ip);
  if (!c || c.day !== day) {
    counters.set(ip, { day, count: 1 });
    return false;
  }
  c.count += 1;
  return c.count > DAILY_LIMIT;
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ALLOWED_MODELS = new Set([
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);

app.get("/", (_req, res) => res.send("UTM Foundation Hub AI proxy is running ✅"));

app.post("/api/tutor", async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: { message: "Server missing ANTHROPIC_API_KEY" } });

  const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0];
  if (overLimit(ip)) {
    return res.status(429).json({ error: { message: "Daily free limit reached. Try again tomorrow." } });
  }

  const { system, messages, model } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: { message: "messages required" } });
  }
  const useModel = ALLOWED_MODELS.has(model) ? model : "claude-opus-4-8";

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 2048,
        system: typeof system === "string" ? system : undefined,
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      return res.status(upstream.status || 502).json({
        error: { message: "Upstream error: " + (txt.slice(0, 300) || upstream.status) },
      });
    }

    // Stream the SSE response straight back to the browser
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
app.listen(PORT, () => console.log("AI proxy listening on " + PORT));
