# UTM Foundation Hub — AI Tutor proxy

A tiny server that lets students use the AI tutor **without entering their own API key**.
It keeps your Anthropic key secret on the server and forwards chat requests to Claude.

## What it does
- Exposes `POST /api/tutor` — accepts `{ system, messages, model }`, adds your secret key, streams Claude's reply back.
- CORS-enabled so your GitHub Pages site can call it.
- Optional per-IP daily limit (`FREE_DAILY_LIMIT`).

## Deploy on Railway (free tier)

1. Push this `railway-proxy/` folder to a GitHub repo (or use Railway's "Deploy from local").
2. On https://railway.app → **New Project** → **Deploy from GitHub repo** → pick the repo/folder.
3. Railway auto-detects Node and runs `npm start`.
4. Add environment variables (Project → **Variables**):
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com
   - `ALLOWED_ORIGIN` = `https://himageo2006.github.io` (your site origin)
   - `FREE_DAILY_LIMIT` = `30` (per IP per day; set `0` for unlimited)
5. Railway gives you a public URL like `https://utm-hub-ai-proxy.up.railway.app`.
6. Open `https://<your-url>/` — you should see "AI proxy is running ✅".

## Connect the website
In `assets/tutor.js`, set:
```js
proxyUrl: "https://<your-url>/api/tutor",
```
Redeploy the site. The tutor now works with no student key, and the settings
screen hides the key field automatically.

## Run locally (optional)
```bash
cd railway-proxy
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
# open http://localhost:3000
```
