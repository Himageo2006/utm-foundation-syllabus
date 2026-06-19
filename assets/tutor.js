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

  // Per-page persistent chat history
  const HIST_KEY = "utm_tutor_hist_" + ((location.pathname.split("/").pop() || "index").replace(/\.html?$/, ""));
  let history = [];     // {role, content}
  try { const h = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); if (Array.isArray(h)) history = h; } catch (_) {}
  function saveHistory() {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(-40))); } catch (_) {}
  }
  let busy = false;
  let pendingImage = null;   // data URL of an attached photo (cleared after one send)

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
        <button id="tutor-clear" title="Clear chat">🗑</button>
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
        <div id="tutor-attach-bar" style="display:none;font-size:.78rem;margin:0 0 .4rem;opacity:.85;">📷 Image attached <button id="tutor-attach-x" type="button" style="border:none;background:transparent;cursor:pointer;color:inherit;font-weight:700;">✕</button></div>
        <div class="tutor-inrow">
          <button id="tutor-attach" type="button" title="Attach a photo of a question" style="border:none;background:transparent;cursor:pointer;font-size:1.2rem;padding:0 .3rem;">📎</button>
          <input id="tutor-file" type="file" accept="image/*" style="display:none">
          <textarea id="tutor-input" rows="1" placeholder="Ask anything about your syllabus…"></textarea>
          <button class="tutor-send" id="tutor-send" title="Send">➤</button>
        </div>
        <div class="tutor-note">Powered by Claude · answers may contain mistakes — verify with your lecturer.</div>
      </div>`;

    history.forEach(m => addBubble(m.role === "user" ? "user" : "bot", m.content));
    if (history.length) { const w = panel.querySelector(".tutor-welcome"); if (w) w.remove(); }

    document.getElementById("tutor-close").onclick = closePanel;
    document.getElementById("tutor-settings").onclick = setupView;
    const clearBtn = document.getElementById("tutor-clear");
    if (clearBtn) clearBtn.onclick = function () {
      history = [];
      try { localStorage.removeItem(HIST_KEY); } catch (_) {}
      chatView();
    };
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

    // photo attach
    const attachBtn = document.getElementById("tutor-attach");
    const fileInp = document.getElementById("tutor-file");
    const attachBar = document.getElementById("tutor-attach-bar");
    const attachX = document.getElementById("tutor-attach-x");
    if (attachBar) attachBar.style.display = pendingImage ? "" : "none";
    if (attachBtn && fileInp) {
      attachBtn.onclick = () => fileInp.click();
      fileInp.onchange = function () {
        const f = fileInp.files && fileInp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { pendingImage = r.result; if (attachBar) attachBar.style.display = ""; input.placeholder = "Ask about the attached image…"; };
        r.readAsDataURL(f);
      };
    }
    if (attachX) attachX.onclick = function () {
      pendingImage = null; if (fileInp) fileInp.value = ""; if (attachBar) attachBar.style.display = "none";
      input.placeholder = "Ask anything about your syllabus…";
    };
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
    if (!text && pendingImage) text = "Please look at this image and help me solve/understand it, step by step.";
    if (!text || busy) return;
    const input = document.getElementById("tutor-input");
    if (input) { input.value = ""; input.style.height = "auto"; input.placeholder = "Ask anything about your syllabus…"; }
    const bar = document.getElementById("tutor-attach-bar");
    if (bar) bar.style.display = "none";
    const welcome = panel.querySelector(".tutor-welcome");
    if (welcome) welcome.remove();

    addBubble("user", text);
    history.push({ role: "user", content: text });
    saveHistory();

    busy = true;
    const sendBtn = document.getElementById("tutor-send");
    if (sendBtn) sendBtn.disabled = true;

    const bot = addBubble("bot", "");
    bot.innerHTML = `<span class="tutor-typing"><span></span><span></span><span></span></span>`;

    try {
      const full = await streamReply(bot);
      history.push({ role: "assistant", content: full });
      saveHistory();
    } catch (err) {
      bot.innerHTML = renderMd("⚠️ " + (err.message || "Something went wrong.") +
        "\n\nTip: check your API key in ⚙ settings, or your internet connection.");
    } finally {
      busy = false;
      if (sendBtn) sendBtn.disabled = false;
      pendingImage = null;
      const fi = document.getElementById("tutor-file"); if (fi) fi.value = "";
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

      // ---- Image attached: use Puter vision (one-shot) ----
      if (pendingImage) {
        const img = pendingImage; pendingImage = null;
        const lastUser = [...history].reverse().find(m => m.role === "user");
        const prompt = SYLLABUS + "\n\nThe student attached an image. " + (lastUser ? lastUser.content : "Please help with it.");
        try {
          const r = await puter.ai.chat(prompt, img, { model });
          out = (r && (r.text || (r.message && r.message.content) || (typeof r === "string" ? r : ""))) || "";
        } catch (e) {
          throw new Error("Couldn't read the image with the free engine. Try a clearer photo, or type the question instead.");
        }
        botEl.innerHTML = renderMd(out || "(No response — try again.)");
        return out;
      }

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

  // Build a tailored question from a lesson element and ask the tutor.
  // Used by hardcoded buttons: onclick="askTutorFromLesson(this)" (mode defaults to 'explain').
  window.askTutorFromLesson = function (el, mode) {
    mode = mode || "explain";
    const d = el.closest("details.lesson") || el.closest("details");
    let title = "this lesson", topic = "";
    if (d) {
      const sum = d.querySelector("summary");
      if (sum) {
        const c = sum.cloneNode(true);
        const chev = c.querySelector(".chev");
        if (chev) chev.remove();
        const cb = c.querySelector(".lesson-done");
        if (cb) cb.remove();
        title = c.textContent.trim();
      }
      const topicEl = d.closest(".topic");
      if (topicEl) {
        const h2 = topicEl.querySelector(".topic-head h2") || topicEl.querySelector("h2");
        if (h2) topic = h2.textContent.trim();
      }
    }
    const subject = (document.querySelector("h1") ? document.querySelector("h1").textContent.trim() : (document.title || "")).replace(/\s+/g, " ");
    const ref = '"' + title + '"' + (topic ? (' (topic: ' + topic + ')') : '') + (subject ? (' [subject: ' + subject + ']') : '');
    const prompts = {
      explain: 'Please explain this in more detail using very simple, everyday words. Give a clear step-by-step explanation, 2–3 worked examples, and common mistakes to avoid. Lesson: ' + ref + '.',
      quiz: 'Quiz me on this lesson with 5 questions (mix of multiple-choice and short-answer), from easy to hard. Ask them ONE at a time and wait for my answer before revealing the solution and a short explanation. Lesson: ' + ref + '.',
      practice: 'Give me 5 practice questions on this lesson, ordered easy → hard, WITH full worked solutions shown after all the questions. Lesson: ' + ref + '.',
      summary: 'Summarize this lesson in 3 short bullet points a beginner can remember, then give one key formula or rule and one common mistake. Keep it very simple. Lesson: ' + ref + '.'
    };
    window.askTutor(prompts[mode] || prompts.explain);
  };

  // ============================================================
  //  Lesson enhancements: study buttons, progress, search,
  //  expand/collapse, dark mode. Runs only on pages with lessons.
  // ============================================================
  const PAGE_KEY = (location.pathname.split("/").pop() || "index").replace(/\.html?$/, "");
  const DONE_KEY = "utm_done_" + PAGE_KEY;

  function loadDone() { try { return JSON.parse(localStorage.getItem(DONE_KEY) || "{}"); } catch (_) { return {}; } }
  function saveDone(o) { try { localStorage.setItem(DONE_KEY, JSON.stringify(o)); } catch (_) {} }

  function lessonTitle(d) {
    const sum = d.querySelector("summary");
    if (!sum) return "lesson";
    const c = sum.cloneNode(true);
    const chev = c.querySelector(".chev"); if (chev) chev.remove();
    const cb = c.querySelector(".lesson-done"); if (cb) cb.remove();
    return c.textContent.trim();
  }

  function injectStyles() {
    if (document.getElementById("ai-explain-style")) return;
    const st = document.createElement("style");
    st.id = "ai-explain-style";
    st.textContent =
      ".ai-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1.1rem;}" +
      ".ai-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.5rem .9rem;font:600 .82rem/1 inherit;" +
      "color:#fff;cursor:pointer;border:none;border-radius:999px;transition:transform .12s,box-shadow .12s;}" +
      ".ai-btn:hover{transform:translateY(-1px);} .ai-btn:active{transform:translateY(0);}" +
      ".ai-explain-btn{background:linear-gradient(135deg,#7c3aed,#2563eb);box-shadow:0 2px 8px rgba(37,99,235,.3);}" +
      ".ai-quiz{background:linear-gradient(135deg,#0891b2,#0ea5e9);box-shadow:0 2px 8px rgba(14,165,233,.3);}" +
      ".ai-practice{background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 2px 8px rgba(34,197,94,.3);}" +
      ".ai-summary{background:linear-gradient(135deg,#ea580c,#f59e0b);box-shadow:0 2px 8px rgba(245,158,11,.3);}" +
      ".lesson-done{margin-left:auto;display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-weight:600;opacity:.8;cursor:pointer;}" +
      ".lesson-done input{width:16px;height:16px;cursor:pointer;}" +
      "details.lesson.is-done>summary{opacity:.62;}" +
      ".topic-prog{height:7px;border-radius:999px;background:rgba(0,0,0,.12);overflow:hidden;margin:.5rem 0 .2rem;}" +
      ".topic-prog>span{display:block;height:100%;width:0;background:linear-gradient(90deg,#22c55e,#16a34a);transition:width .3s;}" +
      ".topic-prog-label{font-size:.72rem;opacity:.7;font-weight:600;}" +
      "#study-toolbar{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;" +
      "padding:.6rem .8rem;margin:0 0 1.2rem;border-radius:12px;background:rgba(255,255,255,.9);" +
      "backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(0,0,0,.08);}" +
      "#study-search{flex:1;min-width:140px;padding:.5rem .8rem;border:1px solid rgba(0,0,0,.15);border-radius:999px;font:inherit;font-size:.85rem;}" +
      "#study-toolbar button{padding:.45rem .8rem;border:1px solid rgba(0,0,0,.15);background:#fff;border-radius:999px;font:600 .8rem/1 inherit;cursor:pointer;}" +
      "#study-toolbar button:hover{background:#f1f5f9;}" +
      "#study-overall{font-size:.78rem;font-weight:700;opacity:.8;white-space:nowrap;}" +
      ".topic.search-hidden,details.lesson.search-hidden{display:none!important;}" +
      /* dark mode */
      "html.dark{background:#0f1420;} html.dark body{background:#0f1420;color:#e5e7eb;}" +
      "html.dark .lesson,html.dark .topic,html.dark .card,html.dark .body,html.dark .math,html.dark .ex,html.dark .note,html.dark .tip,html.dark .step,html.dark table,html.dark pre,html.dark code{background:#1a2030!important;color:#e5e7eb!important;border-color:#2a3344!important;}" +
      "html.dark summary,html.dark h1,html.dark h2,html.dark h3,html.dark h4,html.dark p,html.dark li,html.dark td,html.dark th{color:#e5e7eb!important;}" +
      "html.dark a{color:#93c5fd!important;}" +
      "html.dark #study-toolbar{background:rgba(26,32,48,.92);} html.dark #study-search,html.dark #study-toolbar button{background:#0f1420;color:#e5e7eb;border-color:#2a3344;}" +
      "html.dark .topic-prog{background:rgba(255,255,255,.15);}" +
      ".topic-prog-row{display:flex;align-items:center;gap:.6rem;}" +
      ".mark-all{padding:.2rem .6rem;font:600 .7rem/1 inherit;border:1px solid rgba(0,0,0,.2);background:transparent;border-radius:999px;cursor:pointer;opacity:.75;}" +
      ".mark-all:hover{opacity:1;} html.dark .mark-all{border-color:#3a4456;color:#e5e7eb;}" +
      "#study-top{position:fixed;left:18px;bottom:18px;width:44px;height:44px;border:none;border-radius:50%;" +
      "background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-size:1.3rem;cursor:pointer;z-index:60;" +
      "box-shadow:0 4px 14px rgba(37,99,235,.4);opacity:0;pointer-events:none;transform:translateY(10px);transition:opacity .2s,transform .2s;}" +
      "#study-top.show{opacity:1;pointer-events:auto;transform:translateY(0);}" +
      "#study-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:70;" +
      "background:#111827;color:#fff;padding:.7rem 1.2rem;border-radius:999px;font:600 .85rem/1 inherit;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;}" +
      "#study-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}" +
      ".study-size{display:inline-flex;gap:.25rem;align-items:center;}" +
      ".study-size button{width:30px;padding:.35rem 0;}" +
      /* home dashboard */
      "#study-dash{margin:1.5rem 0;}" +
      "#study-dash h2{margin:0 0 .9rem;font-size:1.15rem;}" +
      ".dash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.9rem;}" +
      ".dash-card{display:block;text-decoration:none;color:inherit;padding:1rem 1.1rem;border-radius:14px;" +
      "background:rgba(255,255,255,.96);box-shadow:0 2px 12px rgba(0,0,0,.08);border-left:5px solid var(--dc,#2563eb);" +
      "transition:transform .12s,box-shadow .12s;}" +
      ".dash-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.14);}" +
      ".dash-card .dc-name{font-weight:800;font-size:1rem;}" +
      ".dash-card .dc-sub{font-size:.78rem;opacity:.7;margin:.15rem 0 .6rem;}" +
      ".dash-bar{height:9px;border-radius:999px;background:rgba(0,0,0,.1);overflow:hidden;}" +
      ".dash-bar>span{display:block;height:100%;width:0;background:linear-gradient(90deg,#22c55e,#16a34a);transition:width .4s;}" +
      ".dash-pct{font-size:.8rem;font-weight:700;margin-top:.4rem;}" +
      "#study-dash .dash-overall{font-size:.85rem;opacity:.8;margin:.2rem 0 1rem;font-weight:600;}" +
      "html.dark .dash-card{background:#1a2030;} html.dark .dash-bar{background:rgba(255,255,255,.15);}" +
      "#study-streak{font-size:.78rem;font-weight:700;opacity:.85;white-space:nowrap;}" +
      /* print: clean notes, hide interactive chrome */
      "@media print{#study-toolbar,#tutor-fab,#tutor-panel,#study-top,.ai-actions,.lesson-done,.mark-all,.topic-prog,.topic-prog-row,.chev{display:none!important;}" +
      "details.lesson{break-inside:avoid;} details.lesson>.body{display:block!important;} body{background:#fff!important;color:#000!important;}}";
    document.head.appendChild(st);
  }

  function makeBtn(cls, label, mode, lesson) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ai-btn " + cls;
    b.innerHTML = label;
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      window.askTutorFromLesson(lesson, mode);
    });
    return b;
  }

  function updateTopicProgress(topicEl, notify) {
    const lessons = topicEl.querySelectorAll("details.lesson");
    if (!lessons.length) return;
    let done = 0;
    lessons.forEach(l => { if (l.classList.contains("is-done")) done++; });
    const bar = topicEl.querySelector(".topic-prog > span");
    const lbl = topicEl.querySelector(".topic-prog-label");
    const pct = Math.round(done / lessons.length * 100);
    if (bar) bar.style.width = pct + "%";
    if (lbl) lbl.textContent = done + " / " + lessons.length + " done";
    const complete = done === lessons.length;
    if (complete && topicEl.dataset.celebrated !== "1") {
      topicEl.dataset.celebrated = "1";
      if (notify) {
        const h2 = topicEl.querySelector(".topic-head h2") || topicEl.querySelector("h2");
        toast("🎉 " + (h2 ? h2.textContent.trim() : "Topic") + " complete!");
      }
    } else if (!complete) {
      topicEl.dataset.celebrated = "0";
    }
  }

  function updateOverall() {
    const all = document.querySelectorAll("details.lesson");
    let done = 0; all.forEach(l => { if (l.classList.contains("is-done")) done++; });
    const el = document.getElementById("study-overall");
    if (el) el.textContent = "✅ " + done + "/" + all.length;
  }

  // Daily study streak (counts consecutive days the site is opened)
  function updateStreak() {
    const today = new Date().toISOString().slice(0, 10);
    let s = { count: 0, last: "" };
    try { s = JSON.parse(localStorage.getItem("utm_streak") || "{}"); } catch (_) {}
    if (s.last !== today) {
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      s.count = (s.last === y) ? (s.count || 0) + 1 : 1;
      s.last = today;
      try { localStorage.setItem("utm_streak", JSON.stringify(s)); } catch (_) {}
    }
    return s.count || 1;
  }

  let _toastTimer = null;
  function toast(msg) {
    let t = document.getElementById("study-toast");
    if (!t) { t = document.createElement("div"); t.id = "study-toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function refreshContinue() {
    const btn = document.getElementById("study-continue");
    if (!btn) return;
    const last = localStorage.getItem("utm_last_" + PAGE_KEY);
    if (last) {
      const short = last.length > 22 ? last.slice(0, 22) + "…" : last;
      btn.style.display = "";
      btn.innerHTML = "▶ Continue: " + short;
      btn.title = "Jump to: " + last;
    } else {
      btn.style.display = "none";
    }
  }

  function setupBackToTop() {
    if (document.getElementById("study-top")) return;
    const b = document.createElement("button");
    b.id = "study-top"; b.type = "button"; b.title = "Back to top"; b.innerHTML = "↑";
    b.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.appendChild(b);
    const onScroll = () => b.classList.toggle("show", window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function buildToolbar(main) {
    if (document.getElementById("study-toolbar")) return;
    const bar = document.createElement("div");
    bar.id = "study-toolbar";
    bar.innerHTML =
      '<input id="study-search" type="search" placeholder="🔍 Search lessons…">' +
      '<button id="study-continue" type="button" style="display:none">▶ Continue</button>' +
      '<button id="study-expand" type="button">⤢ Expand all</button>' +
      '<button id="study-collapse" type="button">⤡ Collapse all</button>' +
      '<button id="study-dark" type="button">🌙 Dark</button>' +
      '<span class="study-size"><button type="button" data-d="-1" title="Smaller text">A−</button>' +
      '<button type="button" data-d="1" title="Larger text">A+</button></span>' +
      '<button id="study-print" type="button" title="Print / save these notes">🖨 Print</button>' +
      '<button id="study-reset" type="button">↺ Reset</button>' +
      '<span id="study-streak" title="Daily study streak"></span>' +
      '<span id="study-overall"></span>';
    main.insertBefore(bar, main.firstChild);

    const streak = updateStreak();
    const stEl = bar.querySelector("#study-streak");
    if (stEl) stEl.textContent = "🔥 " + streak + (streak === 1 ? " day" : " days");

    bar.querySelector("#study-print").addEventListener("click", function () {
      document.querySelectorAll("details.lesson").forEach(d => d.open = true);
      setTimeout(() => window.print(), 120);
    });

    function applyFontScale(scale) {
      scale = Math.max(0.85, Math.min(1.4, scale));
      document.documentElement.style.fontSize = Math.round(scale * 100) + "%";
      try { localStorage.setItem("utm_fontscale", String(scale)); } catch (_) {}
      return scale;
    }
    let fontScale = parseFloat(localStorage.getItem("utm_fontscale")) || 1;
    if (fontScale !== 1) applyFontScale(fontScale);
    bar.querySelectorAll(".study-size button").forEach(function (b) {
      b.addEventListener("click", function () {
        fontScale = applyFontScale(fontScale + (b.dataset.d === "1" ? 0.1 : -0.1));
      });
    });

    bar.querySelector("#study-continue").addEventListener("click", function () {
      const last = localStorage.getItem("utm_last_" + PAGE_KEY);
      if (!last) return;
      const target = [...document.querySelectorAll("details.lesson")].find(d => lessonTitle(d) === last);
      if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "center" }); }
    });
    bar.querySelector("#study-reset").addEventListener("click", function () {
      if (!confirm("Reset your progress on this page?")) return;
      saveDone({});
      document.querySelectorAll("details.lesson").forEach(function (d) {
        d.classList.remove("is-done");
        const cb = d.querySelector(".lesson-done input"); if (cb) cb.checked = false;
      });
      document.querySelectorAll(".topic").forEach(updateTopicProgress);
      updateOverall();
      toast("↺ Progress reset");
    });

    const search = bar.querySelector("#study-search");
    search.addEventListener("input", function () {
      const q = this.value.trim().toLowerCase();
      document.querySelectorAll("details.lesson").forEach(function (d) {
        const hit = !q || d.textContent.toLowerCase().indexOf(q) !== -1;
        d.classList.toggle("search-hidden", !hit);
        if (q && hit) d.open = true;
      });
      document.querySelectorAll(".topic").forEach(function (t) {
        const anyVisible = t.querySelector("details.lesson:not(.search-hidden)");
        t.classList.toggle("search-hidden", !!q && !anyVisible);
      });
    });
    bar.querySelector("#study-expand").onclick = function () {
      document.querySelectorAll("details.lesson:not(.search-hidden)").forEach(d => d.open = true);
    };
    bar.querySelector("#study-collapse").onclick = function () {
      document.querySelectorAll("details.lesson").forEach(d => d.open = false);
    };
    const darkBtn = bar.querySelector("#study-dark");
    function applyDark(on) {
      document.documentElement.classList.toggle("dark", on);
      darkBtn.innerHTML = on ? "☀️ Light" : "🌙 Dark";
      try { localStorage.setItem("utm_dark", on ? "1" : "0"); } catch (_) {}
    }
    darkBtn.onclick = () => applyDark(!document.documentElement.classList.contains("dark"));
    if (localStorage.getItem("utm_dark") === "1") applyDark(true);
  }

  const SUBJECTS = [
    { key: "lessons-calculus",  name: "Calculus",     total: 54, href: "lessons-calculus.html",  color: "#8c1d40" },
    { key: "lessons-chemistry", name: "Chemistry II", total: 42, href: "lessons-chemistry.html", color: "#0e7490" },
    { key: "lessons-physics",   name: "Physics II",   total: 66, href: "lessons-physics.html",   color: "#1d4ed8" },
    { key: "lessons-computing", name: "Computing",    total: 73, href: "lessons-computing.html", color: "#15803d" }
  ];

  function buildHomeDashboard() {
    const grid = document.getElementById("subjectGrid") || document.querySelector(".subjects");
    const main = document.querySelector("main");
    if (!main || PAGE_KEY !== "index" || document.getElementById("study-dash")) return;
    injectStyles();
    // dark-mode preference shared with lesson pages
    if (localStorage.getItem("utm_dark") === "1") document.documentElement.classList.add("dark");

    let totalDone = 0, totalAll = 0, cards = "";
    SUBJECTS.forEach(function (s) {
      let done = 0;
      try { done = Object.keys(JSON.parse(localStorage.getItem("utm_done_" + s.key) || "{}")).length; } catch (_) {}
      const total = parseInt(localStorage.getItem("utm_total_" + s.key), 10) || s.total;
      const capped = Math.min(done, total);
      totalDone += capped; totalAll += total;
      const pct = Math.round(capped / total * 100);
      cards +=
        '<a class="dash-card" href="' + s.href + '" style="--dc:' + s.color + '">' +
        '<div class="dc-name">' + s.name + '</div>' +
        '<div class="dc-sub">' + capped + ' / ' + total + ' lessons</div>' +
        '<div class="dash-bar"><span style="width:' + pct + '%"></span></div>' +
        '<div class="dash-pct" style="color:' + s.color + '">' + pct + '% complete</div>' +
        '</a>';
    });
    const overallPct = totalAll ? Math.round(totalDone / totalAll * 100) : 0;

    const dash = document.createElement("section");
    dash.id = "study-dash";
    dash.className = "sec";
    const streak = updateStreak();
    dash.innerHTML =
      '<h2>📊 My progress</h2>' +
      '<div class="dash-overall">Overall: ' + totalDone + ' / ' + totalAll + ' lessons (' + overallPct + '%) across all subjects' +
      ' &nbsp;·&nbsp; 🔥 ' + streak + (streak === 1 ? " day streak" : " day streak") + '</div>' +
      '<div class="dash-grid">' + cards + '</div>';

    const subjectsSec = document.getElementById("subjects");
    if (subjectsSec) main.insertBefore(dash, subjectsSec);
    else main.insertBefore(dash, main.firstChild);
  }

  function enhanceLessons() {
    const lessons = document.querySelectorAll("details.lesson");
    if (!lessons.length) { buildHomeDashboard(); return; }
    injectStyles();
    try { localStorage.setItem("utm_total_" + PAGE_KEY, lessons.length); } catch (_) {}

    const main = document.querySelector("main") || document.body;
    buildToolbar(main);

    const done = loadDone();

    lessons.forEach(function (d) {
      const body = d.querySelector(".body");
      if (!body) return;
      const title = lessonTitle(d);

      // --- action buttons (replace any lone hardcoded explain button) ---
      if (!d.querySelector(".ai-actions")) {
        const old = d.querySelector(".ai-explain-btn");
        if (old) old.remove();
        const row = document.createElement("div");
        row.className = "ai-actions";
        row.appendChild(makeBtn("ai-explain-btn", "✨ Explain more", "explain", d));
        row.appendChild(makeBtn("ai-quiz", "❓ Quiz me", "quiz", d));
        row.appendChild(makeBtn("ai-practice", "📝 Practice", "practice", d));
        row.appendChild(makeBtn("ai-summary", "⚡ Summarize", "summary", d));
        body.appendChild(row);
      }

      // --- done checkbox in the summary ---
      const sum = d.querySelector("summary");
      if (sum && !sum.querySelector(".lesson-done")) {
        const key = title;
        const lbl = document.createElement("label");
        lbl.className = "lesson-done";
        lbl.innerHTML = '<input type="checkbox"> done';
        const cb = lbl.querySelector("input");
        cb.checked = !!done[key];
        d.classList.toggle("is-done", !!done[key]);
        const stop = e => e.stopPropagation();
        lbl.addEventListener("click", stop);
        cb.addEventListener("click", stop);
        cb.addEventListener("change", function () {
          const map = loadDone();
          if (cb.checked) map[key] = 1; else delete map[key];
          saveDone(map);
          d.classList.toggle("is-done", cb.checked);
          const t = d.closest(".topic"); if (t) updateTopicProgress(t, true);
          updateOverall();
        });
        // place before the chevron if present
        const chev = sum.querySelector(".chev");
        if (chev) sum.insertBefore(lbl, chev); else sum.appendChild(lbl);
      }

      // --- remember last-opened lesson (for Continue) ---
      if (!d.dataset.trk) {
        d.dataset.trk = "1";
        d.addEventListener("toggle", function () {
          if (d.open) {
            try { localStorage.setItem("utm_last_" + PAGE_KEY, lessonTitle(d)); } catch (_) {}
            refreshContinue();
          }
        });
      }
    });

    // --- per-topic progress bars ---
    document.querySelectorAll(".topic").forEach(function (t) {
      if (!t.querySelector("details.lesson")) return;
      if (!t.querySelector(".topic-prog")) {
        const head = t.querySelector(".topic-head") || t.firstElementChild;
        const wrap = document.createElement("div");
        wrap.innerHTML = '<div class="topic-prog"><span></span></div>' +
          '<div class="topic-prog-row"><span class="topic-prog-label"></span>' +
          '<button type="button" class="mark-all">Mark all done</button></div>';
        if (head && head.nextSibling) t.insertBefore(wrap, head.nextSibling);
        else t.insertBefore(wrap, t.firstChild);
        wrap.querySelector(".mark-all").addEventListener("click", function () {
          const ls = t.querySelectorAll("details.lesson");
          const allDone = [...ls].every(l => l.classList.contains("is-done"));
          const map = loadDone();
          ls.forEach(function (l) {
            const key = lessonTitle(l);
            const cb = l.querySelector(".lesson-done input");
            if (allDone) { delete map[key]; l.classList.remove("is-done"); if (cb) cb.checked = false; }
            else { map[key] = 1; l.classList.add("is-done"); if (cb) cb.checked = true; }
          });
          saveDone(map);
          this.textContent = allDone ? "Mark all done" : "Unmark all";
          updateTopicProgress(t, !allDone);
          updateOverall();
        });
      }
      updateTopicProgress(t);
    });
    updateOverall();
    refreshContinue();
    setupBackToTop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceLessons);
  } else {
    enhanceLessons();
  }
})();
