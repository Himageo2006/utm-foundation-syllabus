/* ============================================================
   UTM Foundation — AI Tutor widget (Claude-powered)
   Static-site friendly: calls the Anthropic API directly from
   the browser using the student's own key (stored locally), OR
   a backend proxy if you set TUTOR_CONFIG.proxyUrl.
   ============================================================ */
(function () {
  "use strict";

  // --- CONFIG -------------------------------------------------
  // To route through your own backend later (e.g. Railway) so students
  // don't need a key, set proxyUrl to your endpoint and it will POST
  // { system, messages, model } there instead of calling Anthropic directly.
  const TUTOR_CONFIG = {
    // FREE by default: uses Puter.js (no key, no server). Students just click "allow" once.
    freeMode: true,
    puterSrc: "https://js.puter.com/v2/",
    puterModel: "gpt-4o-mini",          // free via Puter; also try "claude-sonnet-4" or "meta-llama/llama-3.3-70b-instruct"
    // Optional advanced backends (leave blank to stay on free Puter):
    proxyUrl: "https://utm-foundation-syllabus-production.up.railway.app/api/tutor",
    apiUrl: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-opus-4-8",
    anthropicVersion: "2023-06-01",
    maxTokens: 2048,
  };

  // Load the Puter SDK on demand (free, keyless AI)
  let _puterPromise = null;
  function loadPuter() {
    if (window.puter) return Promise.resolve(window.puter);
    if (_puterPromise) return _puterPromise;
    _puterPromise = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = TUTOR_CONFIG.puterSrc;
      sc.onload = () => resolve(window.puter);
      sc.onerror = () => reject(new Error("Could not load the free AI engine. Check your connection."));
      document.head.appendChild(sc);
    });
    return _puterPromise;
  }

  // --- Syllabus knowledge given to the AI --------------------
  const SYLLABUS = `You are the UTM Foundation Programme AI Tutor for Semester 3 (Foundation in Science) students at Universiti Teknologi Malaysia. Be friendly, encouraging, clear, and concise. Explain step by step. Use simple English. When solving maths/physics/chemistry, show each step. Use plain text math (^ for powers, / for division) unless asked otherwise. Keep answers focused.

You know the Semester 3 syllabus:

1) ACADEMIC LISTENING & SPEAKING (FSPE0022): Assessment = Impromptu speech 2x10%, Oral presentation 10%, Group discussion 10%, Listening test 2x10%, Final listening exam 40%. Skills: organising spontaneous speech, formal presentations, group discussion etiquette, listening for main ideas/inference/opinion.

2) CALCULUS: (1) Limits & Continuity (one-sided limits, factorizing/rationalizing 0/0 forms, infinite limits, limits at infinity, continuity, types of discontinuity) (2) Differentiation (rules, chain rule) (3) Applications of Differentiation (max/min, optimisation, concavity) (4) Integration (substitution, by parts) (5) Integration of Trigonometric Functions (6) Applications of Integration (area, volume) (7) Ordinary Differential Equations (separable, linear) (8) Numerical Methods (bisection, Newton-Raphson, trapezoidal, Simpson's).

3) CHEMISTRY II: Ch1 Thermochemistry (q=mc(deltaT), Hess's law, enthalpy), Ch2 Chemical Kinetics (rate, rate law, activation energy), Ch3 Chemical Equilibrium (Kc, Le Chatelier), Ch4 Acids & Bases (pH=-log[H+], Ka/Kb, buffers, titration), Ch6 Organic Chemistry (alkanes/alkenes/alkynes, functional groups, IUPAC naming).

4) PHYSICS II: Ch1 Electrostatics (Coulomb F=kq1q2/r^2, E field), Ch2 Capacitors (C=Q/V, E=0.5CV^2), Ch3 Current & Resistance (V=IR, P=VI), Ch4 DC Circuits (series/parallel, Kirchhoff), Ch5 Magnetism (F=qvBsin, F=BILsin), Ch6 Electromagnetic Induction (Faraday, Lenz), Ch7 EM Waves (c=f*lambda), Ch8 Reflection & Refraction (Snell n1 sin01=n2 sin02), Ch9 Lenses (1/f=1/v-1/u), Ch10 Interference & Diffraction, Ch11 Quantum Theory (E=hf, photoelectric), Ch12 Nuclear Physics (half-life, E=mc^2), Ch13 Nuclear Reactions (fission/fusion).

5) FUNDAMENTALS OF COMPUTING (C language): Intro to IT, Programming Concepts (algorithms/flowcharts), Programming Environment, Elementary Programming (variables/data types), Input & Output (printf/scanf), Branching & Loops (if/switch/for/while), Files (fopen/fscanf/fprintf), Functions (parameters/return/scope).

If a question is outside this syllabus, still help, but gently relate it back to their studies when relevant.`;

  const STORAGE_KEY = "utm_tutor_key";
  const MODEL_KEY = "utm_tutor_model";

  let history = [];     // {role, content}
  let busy = false;

  // --- Build DOM ---------------------------------------------
  const fab = document.createElement("button");
  fab.id = "tutor-fab";
  fab.innerHTML = `<span class="spark">✨</span> Ask the AI Tutor <span class="pulse"></span>`;
  document.body.appendChild(fab);

  const panel = document.createElement("div");
  panel.id = "tutor-panel";
  document.body.appendChild(panel);

  function header() {
    return `<div class="tutor-head">
      <div class="av">AI</div>
      <div><h3>UTM AI Tutor</h3><small>Semester 3 study helper</small></div>
      <div class="sp">
        <button id="tutor-settings" title="Settings">⚙</button>
        <button id="tutor-close" title="Close">✕</button>
      </div>
    </div>`;
  }

  function chatView() {
    panel.innerHTML = header() + `
      <div class="tutor-body" id="tutor-body">
        <div class="tutor-welcome">👋 Hi! I'm your <b>AI study tutor</b>. Ask me about any Semester 3 topic, paste a problem to solve step by step, or pick a shortcut below.</div>
      </div>
      <div class="tutor-chips">
        <button class="tutor-chip" data-q="Explain limits and continuity simply with one example.">Explain a topic</button>
        <button class="tutor-chip" data-q="Give me a step-by-step worked example: find the limit of (x^2-9)/(x-3) as x approaches 3.">Solve a problem</button>
        <button class="tutor-chip" data-q="Quiz me with 3 multiple-choice questions on Physics II Chapter 1 (Electrostatics). Wait for my answers before revealing solutions.">Quiz me</button>
        <button class="tutor-chip" data-q="Explain chemical equilibrium and Le Chatelier's principle in the simplest possible way.">Explain simpler</button>
      </div>
      <div class="tutor-foot">
        <div class="tutor-inrow">
          <textarea id="tutor-input" rows="1" placeholder="Ask anything about your syllabus…"></textarea>
          <button class="tutor-send" id="tutor-send" title="Send">➤</button>
        </div>
        <div class="tutor-note">Powered by Claude · answers may contain mistakes — verify with your lecturer.</div>
      </div>`;

    history.forEach(m => addBubble(m.role === "user" ? "user" : "bot", m.content));

    document.getElementById("tutor-close").onclick = closePanel;
    document.getElementById("tutor-settings").onclick = setupView;
    const input = document.getElementById("tutor-input");
    const send = document.getElementById("tutor-send");
    send.onclick = () => submit(input.value);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input.value); }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
    panel.querySelectorAll(".tutor-chip").forEach(c => c.onclick = () => submit(c.dataset.q));
    input.focus();
  }

  function setupView() {
    const hasProxy = !!TUTOR_CONFIG.proxyUrl;
    const free = TUTOR_CONFIG.freeMode && !hasProxy;
    panel.innerHTML = header() + `
      <div class="tutor-setup">
        <h4>AI Tutor settings</h4>
        ${hasProxy ? `<p>This tutor is connected to a school server — no key needed. 🎉</p>` : free ? `
        <p>✅ The tutor is <b>free</b> — no API key needed. It runs on Puter's free AI. (On first use your browser may ask you to allow / sign in to Puter once.)</p>
        <details><summary style="cursor:pointer;font-size:.85rem;color:var(--t-maroon)">Advanced: use your own key instead</summary>
        <label>Anthropic API key (optional)</label>
        <input id="tutor-key" type="password" placeholder="sk-ant-... (leave blank for free)" value="${(localStorage.getItem(STORAGE_KEY)||"").replace(/"/g,'')}">
        <div class="hint">Leave blank to keep the free engine. A key uses Claude directly.</div></details>` : `
        <p>To use the AI tutor, paste an <b>Anthropic API key</b>. It is stored <b>only in your browser</b>.</p>
        <label>Anthropic API key</label>
        <input id="tutor-key" type="password" placeholder="sk-ant-..." value="${(localStorage.getItem(STORAGE_KEY)||"").replace(/"/g,'')}">
        <div class="hint">Get a key at <b>console.anthropic.com</b> → API Keys.</div>`}
        <label>Model</label>
        <select id="tutor-model">
          ${free ? `
          <option value="gpt-4o-mini">GPT-4o mini — fast &amp; free (recommended)</option>
          <option value="claude-sonnet-4">Claude Sonnet — free via Puter</option>
          <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B — free</option>
          ` : `
          <option value="claude-opus-4-8">Claude Opus 4.8 — most capable</option>
          <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — balanced</option>
          <option value="claude-haiku-4-5">Claude Haiku 4.5 — fastest</option>
          `}
        </select>
        <button class="save" id="tutor-save">Save &amp; start learning</button>
      </div>`;
    document.getElementById("tutor-close").onclick = closePanel;
    document.getElementById("tutor-settings").onclick = setupView;
    const modelSel = document.getElementById("tutor-model");
    modelSel.value = localStorage.getItem(MODEL_KEY) || (free ? TUTOR_CONFIG.puterModel : TUTOR_CONFIG.defaultModel);
    document.getElementById("tutor-save").onclick = () => {
      if (!hasProxy) {
        const k = document.getElementById("tutor-key").value.trim();
        if (k) localStorage.setItem(STORAGE_KEY, k);
      }
      localStorage.setItem(MODEL_KEY, modelSel.value);
      chatView();
    };
  }

  function openPanel() {
    fab.style.display = "none";
    panel.classList.add("open");
    // Free mode (Puter) needs no key, so go straight to chat.
    const ready = TUTOR_CONFIG.freeMode || !!TUTOR_CONFIG.proxyUrl || !!localStorage.getItem(STORAGE_KEY);
    ready ? chatView() : setupView();
    const pre = localStorage.getItem("utm_tutor_prefill");
    if (pre && ready) {
      localStorage.removeItem("utm_tutor_prefill");
      setTimeout(() => submit(pre), 150);
    }
  }
  function closePanel() {
    panel.classList.remove("open");
    fab.style.display = "flex";
  }
  fab.onclick = openPanel;

  // --- messaging ---------------------------------------------
  function addBubble(role, text) {
    const body = document.getElementById("tutor-body");
    const div = document.createElement("div");
    div.className = "tutor-msg " + role;
    div.innerHTML = role === "bot" ? renderMd(text) : escapeHtml(text);
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function escapeHtml(s){ return s.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
  function renderMd(s){
    let h = escapeHtml(s);
    h = h.replace(/```([\s\S]*?)```/g, (_,c)=>`<pre>${c.trim()}</pre>`);
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    return h;
  }

  async function submit(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    const input = document.getElementById("tutor-input");
    if (input) { input.value = ""; input.style.height = "auto"; }
    const welcome = panel.querySelector(".tutor-welcome");
    if (welcome) welcome.remove();

    addBubble("user", text);
    history.push({ role: "user", content: text });

    busy = true;
    const sendBtn = document.getElementById("tutor-send");
    if (sendBtn) sendBtn.disabled = true;

    const bot = addBubble("bot", "");
    bot.innerHTML = `<span class="tutor-typing"><span></span><span></span><span></span></span>`;

    try {
      const full = await streamReply(bot);
      history.push({ role: "assistant", content: full });
    } catch (err) {
      bot.innerHTML = renderMd("⚠️ " + (err.message || "Something went wrong.") +
        "\n\nTip: check your API key in ⚙ settings, or your internet connection.");
    } finally {
      busy = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  async function streamReply(botEl) {
    // ---- FREE engine: Puter.js (no key, no server) ----
    const useFree = TUTOR_CONFIG.freeMode && !TUTOR_CONFIG.proxyUrl && !localStorage.getItem(STORAGE_KEY);
    if (useFree) {
      const puter = await loadPuter();
      const msgs = [{ role: "system", content: SYLLABUS }].concat(
        history.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
      );
      const model = localStorage.getItem(MODEL_KEY) || TUTOR_CONFIG.puterModel;
      botEl.innerHTML = "";
      let out = "";
      try {
        const resp = await puter.ai.chat(msgs, { model, stream: true });
        for await (const part of resp) {
          const t = (part && (part.text || (part.message && part.message.content))) || "";
          if (t) { out += t; botEl.innerHTML = renderMd(out); const b = document.getElementById("tutor-body"); if (b) b.scrollTop = b.scrollHeight; }
        }
      } catch (e) {
        // fall back to non-streaming
        try {
          const r = await puter.ai.chat(msgs, { model });
          out = (r && (r.text || (r.message && r.message.content) || (typeof r === "string" ? r : ""))) || "";
          botEl.innerHTML = renderMd(out || "(No response — try again.)");
        } catch (e2) { throw new Error("Free AI engine error. Try again, or add your own key in ⚙ settings."); }
      }
      if (!out) botEl.innerHTML = renderMd("(No response — try again.)");
      return out;
    }

    const model = localStorage.getItem(MODEL_KEY) || TUTOR_CONFIG.defaultModel;
    const payload = {
      model,
      max_tokens: TUTOR_CONFIG.maxTokens,
      system: SYLLABUS,
      messages: history.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    };

    let url, headers;
    if (TUTOR_CONFIG.proxyUrl) {
      url = TUTOR_CONFIG.proxyUrl;
      headers = { "content-type": "application/json" };
    } else {
      const key = localStorage.getItem(STORAGE_KEY);
      if (!key) throw new Error("No API key set. Open ⚙ settings to add one.");
      url = TUTOR_CONFIG.apiUrl;
      headers = {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": TUTOR_CONFIG.anthropicVersion,
        "anthropic-dangerous-direct-browser-access": "true",
      };
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!res.ok) {
      let msg = "API error " + res.status;
      try { const e = await res.json(); if (e.error && e.error.message) msg = e.error.message; } catch (_) {}
      if (res.status === 401) msg = "Invalid API key. Check it in ⚙ settings.";
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", out = "";
    botEl.innerHTML = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          let chunk = "";
          // Anthropic format
          if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") chunk = ev.delta.text;
          // OpenAI / Groq format
          else if (ev.choices && ev.choices[0] && ev.choices[0].delta && ev.choices[0].delta.content) chunk = ev.choices[0].delta.content;
          if (chunk) {
            out += chunk;
            botEl.innerHTML = renderMd(out);
            const body = document.getElementById("tutor-body");
            if (body) body.scrollTop = body.scrollHeight;
          }
        } catch (_) {}
      }
    }
    if (!out) botEl.innerHTML = renderMd("(No response — try again.)");
    return out;
  }

  // --- "Explain more with AI" buttons (auto-injected into every lesson) ---
  // Public helper: open the tutor with a pre-filled question.
  window.askTutor = function (q) {
    try { localStorage.setItem("utm_tutor_prefill", q); } catch (_) {}
    openPanel();
  };

  function injectExplainButtons() {
    // style (once)
    if (!document.getElementById("ai-explain-style")) {
      const st = document.createElement("style");
      st.id = "ai-explain-style";
      st.textContent =
        ".ai-explain-btn{display:inline-flex;align-items:center;gap:.4rem;margin-top:1rem;" +
        "padding:.5rem .9rem;font:600 .85rem/1 inherit;color:#fff;cursor:pointer;border:none;" +
        "border-radius:999px;background:linear-gradient(135deg,#7c3aed,#2563eb);" +
        "box-shadow:0 2px 8px rgba(37,99,235,.3);transition:transform .12s ease,box-shadow .12s ease;}" +
        ".ai-explain-btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(37,99,235,.45);}" +
        ".ai-explain-btn:active{transform:translateY(0);}";
      document.head.appendChild(st);
    }
    const lessons = document.querySelectorAll("details.lesson");
    lessons.forEach(function (d) {
      const body = d.querySelector(".body");
      if (!body || body.querySelector(".ai-explain-btn")) return;
      const sum = d.querySelector("summary");
      let title = "this lesson";
      if (sum) {
        const c = sum.cloneNode(true);
        const chev = c.querySelector(".chev");
        if (chev) chev.remove();
        title = c.textContent.trim();
      }
      let topic = "";
      const topicEl = d.closest(".topic");
      if (topicEl) {
        const h2 = topicEl.querySelector(".topic-head h2") || topicEl.querySelector("h2");
        if (h2) topic = h2.textContent.trim();
      }
      const subject = (document.querySelector("h1") ? document.querySelector("h1").textContent.trim() : (document.title || "")).replace(/\s+/g, " ");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-explain-btn";
      btn.innerHTML = '✨ Explain more with AI';
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const q = 'Please explain this in more detail using very simple, everyday words. Give a clear step-by-step explanation, 2–3 worked examples, and common mistakes to avoid. Lesson: "' +
          title + '"' + (topic ? (' (topic: ' + topic + ')') : '') + (subject ? (' [subject: ' + subject + ']') : '') + '.';
        window.askTutor(q);
      });
      body.appendChild(btn);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectExplainButtons);
  } else {
    injectExplainButtons();
  }
})();
