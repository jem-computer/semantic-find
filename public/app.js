/* Semantic Find — frontend.
   One search = one TypeSafe request. Two modes:
   - choice: "which line answers this?" — per-line shares of one probability
     mass (relative; pinpoints the single best answer)
   - score:  one Score per line on a relevance rubric — absolute readings
     (nothing forced to win; whole evidence chains light up)
   Both carry "does such a line exist at all?", which gates the verdict. */

const $ = (id) => document.getElementById(id);

const EXISTS_FOUND = 0.7;   // >= this: answered here
const EXISTS_ABSENT = 0.35; // < this: not in this document
const HOT_CHOICE = 0.05;    // choice share above this shows a badge
const HOT_SCORE = 0.45;     // score-mode relevance above this shows a badge
const SCORE_FLOOR = 0.25;   // score-mode relevance below this renders no heat

const SUGGESTIONS = {
  "github-tos": [
    "do I own the images I upload?",
    "can they delete my account without warning?",
    "can I sue them in court?",
    "do they collect biometric data?",
  ],
  "mozilla-privacy": [
    "can I turn off data collection?",
    "do they sell my personal data?",
    "what do advertisers learn about me?",
    "is there a signup fee?",
  ],
  "wikimedia-tou": [
    "who owns my contributions?",
    "can I be banned, and why?",
    "must I arbitrate disputes?",
    "can I scrape the site?",
  ],
  "news-wire": [
    "did oil prices change?",
    "how did China react to the blockade?",
    "which movie won best picture?",
    "was anyone hurt by the stray bullet?",
  ],
  "incident-log": [
    "what was the root cause of the outage?",
    "was the deploy responsible?",
    "when did errors first appear?",
    "who was paged and when?",
  ],
  "order-service": [
    "are there any security vulnerabilities?",
    "where could this code crash?",
    "what code is duplicated?",
    "is there any dead code?",
  ],
};

let doc = null;        // {id,title,source,url,kind,lines[]}
let lineEls = [];
let lastResult = null; // {mode, exists, scores[]} of the latest search
let searching = false;
let mode = "choice";
let codeLang = null;   // hljs language detected for the current code doc

const HLJS_LANGS = [
  "javascript", "typescript", "python", "json", "xml", "css", "bash", "sql",
  "go", "rust", "java", "ruby", "yaml", "c", "cpp", "csharp", "php", "kotlin", "swift",
];

/* ---------- line rendering (tiny markdown + kind-aware) ---------- */

const esc = (t) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inlineMd = (t) =>
  t
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

// Prose heading heuristic: short line, starts uppercase/numbered, no
// terminal punctuation — catches "D. User-Generated Content" etc.
const isProseHeading = (t) =>
  t.length < 65 && /^[A-Z0-9]/.test(t) && !/[.!?:,;…]$/.test(t) && !/\d{2}:\d{2}/.test(t);

function renderLine(el, text, kind) {
  let cls = "";
  let html;
  if (kind === "code") {
    if (text === "") {
      html = "&#8203;"; // keep blank lines' height
    } else if (codeLang && window.hljs) {
      // Highlighted per line, so each rendered line stays one scored line.
      html = hljs.highlight(text, { language: codeLang, ignoreIllegals: true }).value;
    } else {
      html = esc(text);
    }
  } else if (kind === "log") {
    html = esc(text).replace(
      /^(\S+) (ERROR|WARN|INFO)(\s)/,
      (_, ts, lv, sp) => `${ts} <span class="lv lv-${lv}">${lv}</span>${sp}`
    );
  } else if (kind === "markdown" && /^# /.test(text)) {
    cls = "line-h1";
    html = inlineMd(esc(text.slice(2)));
  } else if (kind === "markdown" && /^#{2,3} /.test(text)) {
    cls = "line-h2";
    html = inlineMd(esc(text.replace(/^#{2,3} /, "")));
  } else {
    if (isProseHeading(text)) cls = "line-h2";
    html = inlineMd(esc(text));
  }
  el.className = `doc-line ${cls}`.trim();
  el.innerHTML = `<span class="pct"></span>${html}`;
}

/* ---------- document loading ---------- */

async function loadDocList(selectId) {
  const docs = await (await fetch("/api/docs")).json();
  const sel = $("doc-select");
  sel.innerHTML = "";
  for (const d of docs) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.title} · ${d.lineCount} lines`;
    sel.appendChild(opt);
  }
  const id = selectId ?? (docs.some((d) => d.id === "github-tos") ? "github-tos" : docs[0].id);
  sel.value = id;
  await loadDoc(id);
}

async function loadDoc(id) {
  doc = await (await fetch(`/api/docs/${id}`)).json();
  $("doc-title").textContent = doc.title;
  $("doc-source").innerHTML = doc.url
    ? `source: <a href="${doc.url}" target="_blank" rel="noopener">${esc(doc.source)}</a>`
    : `source: ${esc(doc.source)}`;

  $("doc").classList.toggle("kind-log", doc.kind === "log");
  $("doc").classList.toggle("kind-code", doc.kind === "code");
  codeLang = null;
  if (doc.kind === "code" && window.hljs) {
    const detected = hljs.highlightAuto(doc.lines.join("\n"), HLJS_LANGS);
    codeLang = detected.language ?? null;
    if (codeLang) $("doc-source").append(` · detected ${codeLang}`);
  }
  const wrap = $("doc-lines");
  wrap.innerHTML = "";
  lineEls = doc.lines.map((text, i) => {
    const p = document.createElement("p");
    renderLine(p, text, doc.kind);
    p.dataset.i = i;
    wrap.appendChild(p);
    return p;
  });

  const sug = $("suggestions");
  sug.innerHTML = "";
  for (const q of SUGGESTIONS[id] ?? []) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.addEventListener("click", () => {
      $("query").value = q;
      runSearch();
    });
    sug.appendChild(b);
  }

  clearResults();
  $("doc-scroll").scrollTop = 0;
  requestAnimationFrame(drawMinimap);
}

function clearResults() {
  lastResult = null;
  $("verdict").hidden = true;
  $("matches").hidden = true;
  $("doc").classList.remove("dimmed");
  for (const el of lineEls) {
    el.style.setProperty("--heat", 0);
    el.style.setProperty("--edge", 0);
    el.classList.remove("hot");
  }
}

/* ---------- search ---------- */

// Score-mode values are P(direct) + 0.4·P(context) per line (see server.ts).
// Everything under the floor renders dark so topical chatter doesn't wash
// the document; above it, heat is absolute — nothing is normalized to win.
const heatValue = (s, max, m) =>
  m === "choice"
    ? s / max < 0.03 ? 0 : Math.pow(s / max, 0.7)
    : Math.max(0, (s - SCORE_FLOOR) / (1 - SCORE_FLOOR));

const isHot = (s, m) => (m === "choice" ? s >= HOT_CHOICE : s >= HOT_SCORE);
const badge = (s, m) => `${Math.round(s * 100)}%`;

async function runSearch() {
  const query = $("query").value.trim();
  if (!query || !doc || searching) return;
  searching = true;
  const box = document.querySelector(".search-box");
  box.classList.add("loading");
  $("search-btn").disabled = true;

  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId: doc.id, query, mode }),
    });
    if (!res.ok) throw new Error(await res.text());
    applyResult(await res.json());
  } catch (err) {
    $("verdict").hidden = false;
    $("verdict-chip").className = "verdict-chip absent";
    $("verdict-chip").textContent = "request failed";
    $("verdict-meta").textContent = String(err).slice(0, 160);
  } finally {
    searching = false;
    box.classList.remove("loading");
    $("search-btn").disabled = false;
  }
}

function applyResult(result) {
  const { exists, scores, ms, usage, mode: m } = result;
  lastResult = result;
  const max = Math.max(...scores, 1e-6);
  const absent = exists < EXISTS_ABSENT;

  $("doc").classList.toggle("dimmed", absent);
  scores.forEach((s, i) => {
    const el = lineEls[i];
    el.style.setProperty("--heat", heatValue(s, max, m).toFixed(3));
    el.style.setProperty("--edge", isHot(s, m) && !absent ? "1" : "0");
    el.classList.toggle("hot", isHot(s, m) && !absent);
    el.querySelector(".pct").textContent = badge(s, m);
  });

  // Verdict chip: answered / partially addressed / not in this document.
  const chip = $("verdict-chip");
  $("verdict").hidden = false;
  if (exists >= EXISTS_FOUND) {
    chip.className = "verdict-chip found";
    chip.textContent = "answered in this document";
  } else if (!absent) {
    chip.className = "verdict-chip partial";
    chip.textContent = "partially addressed";
  } else {
    chip.className = "verdict-chip absent";
    chip.textContent = "not in this document";
  }
  $("verdict-meta").innerHTML =
    `exists <b>${exists.toFixed(2)}</b> · <b>${ms}ms</b> · ` +
    `${usage.input_tokens.toLocaleString()} tokens in · ${m} mode`;

  // Top matches list.
  const top = scores
    .map((s, i) => [s, i])
    .sort((a, b) => b[0] - a[0])
    .slice(0, 5)
    .filter(([s]) => (m === "choice" ? s / max > 0.08 && s > 0.01 : s >= 0.3));
  const list = $("match-list");
  list.innerHTML = "";
  $("matches").hidden = top.length === 0;
  $("matches").querySelector(".field-label").textContent = absent
    ? "closest lines · not answers"
    : "top matches";
  for (const [s, i] of top) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    const barW = m === "choice" ? Math.max(3, s * 100) : Math.max(3, heatValue(s, max, m) * 100);
    b.innerHTML =
      `<span class="m-head"><span class="m-line">L${String(i).padStart(3, "0")}</span>` +
      `<span class="m-score">${badge(s, m)}</span></span>` +
      `<span class="m-bar"><i style="width:${barW}%"></i></span>` +
      `<span class="m-text"></span>`;
    b.querySelector(".m-text").textContent = doc.lines[i]
      .replace(/^#{1,3} /, "")
      .replace(/^\*(.+)\*$/, "$1");
    b.addEventListener("click", () => jumpToLine(i));
    li.appendChild(b);
    list.appendChild(li);
  }

  if (!absent && top.length) jumpToLine(top[0][1]);
  drawMinimap();
}

function jumpToLine(i) {
  const el = lineEls[i];
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("flash");
  requestAnimationFrame(() => el.classList.add("flash"));
  setTimeout(() => el.classList.remove("flash"), 1600);
}

/* ---------- minimap ---------- */

const scroller = $("doc-scroll");
const canvas = $("minimap-canvas");
const viewport = $("minimap-viewport");

function drawMinimap() {
  const map = $("minimap");
  const dpr = window.devicePixelRatio || 1;
  const w = map.clientWidth;
  const h = map.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!lineEls.length) return;
  const total = scroller.scrollHeight;
  const scale = h / total;
  const pad = 6;
  const max = lastResult ? Math.max(...lastResult.scores, 1e-6) : 1;
  const dimmed = $("doc").classList.contains("dimmed");

  lineEls.forEach((el, i) => {
    const y = el.offsetTop * scale;
    const rh = Math.max(1.5, el.offsetHeight * scale - 0.75);
    // Text-density stroke, VSCode style.
    const width = Math.min(1, doc.lines[i].length / 560) * (w - pad * 2);
    ctx.fillStyle = "rgba(30, 30, 30, 0.16)";
    ctx.fillRect(pad, y, width, rh);
    // Heat overlay.
    if (lastResult) {
      const v = heatValue(lastResult.scores[i], max, lastResult.mode);
      if (v > 0) {
        ctx.fillStyle = `rgba(229, 81, 186, ${v * (dimmed ? 0.25 : 0.9)})`;
        ctx.fillRect(0, y - 0.5, w, rh + 1);
      }
    }
  });
  updateViewport();
}

function updateViewport() {
  const h = $("minimap").clientHeight;
  const scale = h / scroller.scrollHeight;
  viewport.style.top = `${scroller.scrollTop * scale}px`;
  viewport.style.height = `${scroller.clientHeight * scale}px`;
}

function minimapScrollTo(clientY) {
  const rect = $("minimap").getBoundingClientRect();
  const frac = (clientY - rect.top) / rect.height;
  scroller.scrollTop = frac * scroller.scrollHeight - scroller.clientHeight / 2;
}

$("minimap").addEventListener("pointerdown", (e) => {
  $("minimap").setPointerCapture(e.pointerId);
  scroller.style.scrollBehavior = "auto";
  minimapScrollTo(e.clientY);
  const move = (ev) => minimapScrollTo(ev.clientY);
  const up = () => {
    scroller.style.scrollBehavior = "";
    $("minimap").removeEventListener("pointermove", move);
    $("minimap").removeEventListener("pointerup", up);
  };
  $("minimap").addEventListener("pointermove", move);
  $("minimap").addEventListener("pointerup", up);
});

scroller.addEventListener("scroll", updateViewport, { passive: true });
new ResizeObserver(() => drawMinimap()).observe($("minimap"));

/* ---------- mode toggle ---------- */

function setMode(m) {
  mode = m;
  $("mode-choice").classList.toggle("active", m === "choice");
  $("mode-score").classList.toggle("active", m === "score");
  // Re-run the current query in the new mode so toggling compares them live.
  if (lastResult && $("query").value.trim()) runSearch();
}
$("mode-choice").addEventListener("click", () => setMode("choice"));
$("mode-score").addEventListener("click", () => setMode("score"));

/* ---------- paste your own ---------- */

const pasteDialog = $("paste-dialog");
let pasteAsCode = false;

function setPasteKind(asCode) {
  pasteAsCode = asCode;
  $("paste-kind-auto").classList.toggle("active", !asCode);
  $("paste-kind-code").classList.toggle("active", asCode);
}
$("paste-kind-auto").addEventListener("click", () => setPasteKind(false));
$("paste-kind-code").addEventListener("click", () => setPasteKind(true));

$("paste-open").addEventListener("click", () => {
  pasteDialog.showModal();
  $("paste-text").focus();
});
$("paste-cancel").addEventListener("click", () => pasteDialog.close());
$("paste-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("paste-text").value;
  if (!text.trim()) return;
  $("paste-submit").disabled = true;
  try {
    const res = await fetch("/api/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: $("paste-title").value, text, asCode: pasteAsCode }),
    });
    if (!res.ok) {
      $("paste-hint").textContent = await res.text();
      return;
    }
    const newDoc = await res.json();
    pasteDialog.close();
    $("paste-title").value = "";
    $("paste-text").value = "";
    $("paste-hint").textContent = newDoc.truncated
      ? `kept first ${newDoc.lines.length} lines`
      : "private to this visit · kept in memory only, never written to disk";
    await loadDocList(newDoc.id);
  } catch (err) {
    $("paste-hint").textContent = String(err).slice(0, 120);
  } finally {
    $("paste-submit").disabled = false;
  }
});

/* ---------- wiring ---------- */

$("doc-select").addEventListener("change", () => loadDoc($("doc-select").value));

$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});

loadDocList();
