# UTM Foundation Hub — AI Tutor proxy (Groq, FREE)

Lets students use the AI tutor **with no API key and no cost**. It holds one
**free Groq key** on the server and forwards chats to a fast free model
(Llama 3.3 70B). Students need nothing; you pay nothing.

> Groq's free tier needs **no credit card**.

## Deploy — step by step (free)

### 1. Get a free Groq key
- Go to **https://console.groq.com** → sign in (Google/GitHub) → **API Keys** → **Create API Key** → copy it (`gsk_...`).
- No billing, no card.

### 2. Deploy this folder on Railway (free)
- Go to **https://railway.app** → sign in with GitHub → **New Project** → **Deploy from GitHub repo** → pick `Himageo2006/utm-foundation-syllabus`.
- In the service **Settings → Root Directory**, set it to `railway-proxy`.
- Railway runs `npm start` automatically.

### 3. Add variables (Project → Variables)
| Name | Value |
|---|---|
| `GROQ_API_KEY` | your `gsk_...` key |
| `ALLOWED_ORIGIN` | `https://himageo2006.github.io` |
| `FREE_DAILY_LIMIT` | `50` (per student/day; `0` = unlimited) |
| `GROQ_MODEL` | *(optional)* `llama-3.3-70b-versatile` |

### 4. Get the URL
- Settings → **Generate Domain** → you get e.g. `https://utm-hub-ai.up.railway.app`.
- Open it → you should see **"AI proxy (Groq) is running ✅"**.

### 5. Connect the website
- Tell me the URL and I'll wire it in, **or** edit `assets/tutor.js` line ~16:
  ```js
  proxyUrl: "https://YOUR-URL.up.railway.app/api/tutor",
  ```
- Redeploy the site. Done — the tutor works for everyone, free, no key.

## Free alternatives to Railway (same steps)
- **Render.com** (free web service), **Fly.io**, **Cloudflare Workers** — all free; set the same env vars.

## Run locally (optional)
```bash
cd railway-proxy && npm install
GROQ_API_KEY=gsk_... npm start   # http://localhost:3000
```

## Models (all free on Groq)
`llama-3.3-70b-versatile` (smart, default) · `llama-3.1-8b-instant` (fastest) · `gemma2-9b-it`.
