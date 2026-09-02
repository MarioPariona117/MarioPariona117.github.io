const state = {
  view: "signin", // signin | library | journal
  libraryEntries: [],
  journalEntries: [],
  filterKind: "all",
  filterTags: new Set(), // multiple tags AND'd together to narrow results fast
  filterAuthor: null, // one active author at a time — click a byline to toggle
  // The set the finder narrowed to, carried into the Filters panel so that
  // refining continues from those entries instead of starting over on the
  // whole library. { ids: Set, label: string } or null.
  finderRestrict: null,
  filterOrigin: null, // one active origin/tradition at a time
  filterLiturgical: null, // one active liturgical season/use at a time
  filterFavoritesOnly: false,
  filterBilingualOnly: false,
  searchQuery: "",
  sortBy: "recent", // recent | title | kind
  libraryBodyIndex: {}, // id -> lowercased "body \n background \n latinBody", built lazily for full-text search
  readingLibraryId: null, // set while the library reader is open
  readerLang: "en", // "en" | "es" — which vernacular the reader shows; Latin (when present) stays alongside
  readerShowOriginal: true, // whether the original-language column is shown at all
  editingLibraryId: null, // set while the library editor is open; null id = new entry
  editingJournalId: null, // set while the writer is open; null id = new entry

  // Saints — window.SAINTS (saints-data.js) is the read-only dossier data;
  // saintsPersonal is Mario's own layer (status/familiarity/notes/cards),
  // loaded from the store and keyed by slug. See store-local.js's comment
  // block for the shape.
  saintsPersonal: {},
  saintsSearchQuery: "",
  saintsSortBy: "name", // name | feast | familiarity
  saintsFilterStatus: "all", // all | friend | acquaintance | tomeet | ""
  saintsFilterDepth: "all", // all | full | core
  saintsFilterTier: "all", // all | top | favourite | toKnow
  saintsFilterCause: "all", // all | servant | venerable | blessed | saint
  readingSaintSlug: null,
  readingSaintTab: null, // which dossier tab is active; reset to the first tab whenever a *different* saint is opened
  flashcardQueue: [], // [{ slug, cardIndex, card: {q,a} }]
  flashcardPos: 0,
  flashcardShowingAnswer: false,
  calendarMonth: new Date().getMonth(), // 0-11, for the Saints calendar view
  calendarYear: new Date().getFullYear(),
  atlasFilterCentury: "all", // all | ancient | medieval | early-modern | modern
  atlasActiveKey: null, // which atlas place popover is open, if any
  // --- Atlas analysis panel ---
  atlasPanelOpen: false,
  atlasYearFrom: null, // birth-year window; null = whole span
  atlasYearTo: null,
  atlasPlaceMode: "both", // both | born | died
  atlasJourneys: false, // draw birth → death lines
  atlasIncorruptOnly: false,
  atlasOrder: "all", // key from ORDER_GROUPS, or "all"
  atlasStatus: "all", // all | friend | acquaintance | tomeet | ""
  atlasExcluded: null, // Set of slugs explicitly unticked in the picker; null = none excluded
  atlasSaintSearch: "",
  // Opt-in online map tiles — see the TILE_URL block. Off unless explicitly
  // enabled, so the app makes no network requests by default.
  mapTiles: (() => {
    try {
      return localStorage.getItem("recollection.mapTiles") === "1";
    } catch (e) {
      return false;
    }
  })(),
};

let saveTimer = null;
let writerDirty = false;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Renders plain text as real paragraphs: a blank line (\n\n) is a genuine
// break between stanzas/paragraphs, a single \n is a line break within one
// (a poem-style line), so wrapped sentences don't get mistaken for breaks.
// Minimal inline emphasis. Backgrounds cite titles of works — the Confessions,
// the Moralia, Story of a Soul — and occasionally stress a word, and both are
// written with asterisks. Without this they rendered as literal *asterisks*.
// Titles of works take italics, not bold: bold would shout them.
//
// Applied AFTER escapeHtml, so the input is already inert and this can only
// ever introduce <em>/<strong>. Order matters: ** before *, or the double
// markers get eaten by the single-marker rule.
// A bare URL becomes a link. Applied after escapeHtml, so what goes in is
// already inert and this can only ever introduce an <a>. Opening a link is a
// deliberate act by the reader, so this does not break the offline guarantee:
// the page still makes no network request of its own.
function linkify(escaped) {
  return escaped.replace(/https?:\/\/[^\s<>"')\]]+/g, (url) => {
    // Trailing sentence punctuation belongs to the sentence, not the URL.
    const m = url.match(/[.,;:]+$/);
    const href = m ? url.slice(0, -m[0].length) : url;
    const tail = m ? m[0] : "";
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>${tail}`;
  });
}

function renderInline(escaped) {
  // The marker must hug its text — no space just inside either asterisk — so
  // that "2 * 3 * 4" and other stray asterisks are left alone.
  return linkify(
    escaped
      .replace(/\*\*(?!\s)([^*\n]*[^*\s])\*\*/g, "<strong>$1</strong>")
      .replace(/\*(?!\s)([^*\n]*[^*\s])\*/g, "<em>$1</em>")
  );
}

// An ALL-CAPS line standing on its own is a heading, not a shouted sentence —
// the traditional way printed prayer books mark divisions ("OPENING PRAYER",
// "AT THE CLOSE"). Shared with splitSections so the chips and the printed
// headings can never disagree about what counts as one.
function sectionHeadingText(line) {
  const t = (line || "").trim();
  if (t.length >= 4 && t.length <= 70 && /[A-Z]/.test(t) && t === t.toUpperCase() && !/[a-z]/.test(t)) {
    return t;
  }
  // "— Before —" divides the Preces the way the caps headings divide a litany.
  // Kept short and colon-free so the Stations' rubric — a whole sentence in
  // the same dashes — stays a rubric.
  const dashed = t.match(/^—\s*(\S[^—]*?)\s*—$/);
  if (dashed && dashed[1].length <= 24 && !/[:.!?]$/.test(dashed[1])) return dashed[1];
  return null;
}

function isSectionHeadingLine(line) {
  return sectionHeadingText(line) !== null;
}

// A rubric is the instruction rather than the prayer — "then the meditation
// for that station" — set apart the way a missal sets it apart, so the eye
// never starts praying it by mistake.
function isRubricLine(line) {
  const t = (line || "").trim();
  return /^—\s*\S[\s\S]*—$/.test(t) || (/^\(.+\)$/.test(t) && t.length < 120);
}

function stripRubricMarks(t) {
  return t.replace(/^—\s*/, "").replace(/\s*—$/, "").replace(/^\((.+)\)$/, "$1").trim();
}

// Versicle and response. The markers carry the alternation between priest and
// people, so they get the accent colour and the lines hang off them.
const VR_RE = /^\s*(V\.|R\.|℣|℟)\s+/;

function renderProseLines(lines) {
  const hasVr = lines.some((l) => VR_RE.test(l));
  // With a versicle present every line becomes its own row, so the responses
  // line up under each other rather than each starting wherever its marker
  // happened to end.
  const html = lines
    .map((line) => {
      const m = line.match(VR_RE);
      if (!m) return hasVr ? `<span class="vr-line">${renderInline(escapeHtml(line))}</span>` : renderInline(escapeHtml(line));
      const mark = m[1] === "V." ? "℣" : m[1] === "R." ? "℟" : m[1];
      return (
        `<span class="vr-line"><span class="vr-mark">${mark}</span>` +
        `<span class="vr-text">${renderInline(escapeHtml(line.slice(m[0].length)))}</span></span>`
      );
    })
    .join(hasVr ? "" : "<br>");
  // A block whose lines are all short is verse, a creed, or a recitation —
  // none of which want the leading that keeps a wrapped prose paragraph
  // readable. At prose leading the Divine Praises sprawl down a whole screen.
  const verse = lines.length > 1 && lines.every((l) => l.length <= 62);
  return `<p class="reader-para${hasVr ? " reader-vr" : ""}${verse ? " verse" : ""}">${html}</p>`;
}

// A litany is an invocation plus a response repeated down the whole block —
// "Holy Mary, pray for us." fifty times over. Set flat, the repetition is all
// the eye sees and the invocations, which are the part that actually varies,
// disappear into it. Finding the shared tail lets the response recede.
//
// Detected rather than tagged: the responses differ per litany (and per block
// inside one litany), and nothing in the stored text marks them.
function splitLitany(lines) {
  if (lines.length < 4) return null;

  // The shared tail can't be taken from the whole block: a litany of saints
  // ends "All ye Holy Saints of God, make intercession for us", and that one
  // odd line out would wipe the common suffix for all sixty above it. So each
  // adjacent pair votes for a response and the block goes with the winner.
  const tally = new Map();
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i];
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    const suf = a.slice(a.length - n);
    const comma = suf.indexOf(",");
    if (comma < 0) continue;
    // Everything before that comma is a coincidence of shared spelling and
    // belongs to the invocation.
    const resp = suf.slice(comma + 1).trim();
    if (resp.length < 6 || resp.length > 60) continue;
    tally.set(resp, (tally.get(resp) || 0) + 1);
  }
  if (!tally.size) return null;
  const resp = [...tally.entries()].sort((x, y) => y[1] - x[1])[0][0];

  const rows = lines.map((l) => {
    if (!l.endsWith(resp)) return { plain: l };
    const inv = l.slice(0, l.length - resp.length).trim();
    // The response has to be cut off at the comma that introduces it, or a
    // line that merely happens to end the same way gets split mid-clause.
    if (!inv.endsWith(",") || inv.length < 3) return { plain: l };
    return { inv, resp };
  });

  const matched = rows.filter((r) => r.inv).length;
  if (matched < 4 || matched / rows.length < 0.6) return null;
  return rows;
}

// A pipe-delimited block is a table: "| Matthew 5 | Luke 6 |". The first row
// is the header. Comparisons — which beatitude appears in which Gospel, which
// wording the Catechism uses — are the one thing running text is bad at.
// Within a cell, "//" separates the two halves of a thing being compared —
// the beatitude and the promise attached to it. The second half is set back,
// the way a litany response is, so that a column of promises can be read down
// without the blessings and the promises running into each other.
function renderCell(cell) {
  // Skip the "//" inside "https://" — the separator is the one that is not
  // part of a scheme.
  const i = (() => {
    for (let k = cell.indexOf("//"); k !== -1; k = cell.indexOf("//", k + 2)) {
      if (k === 0 || cell[k - 1] !== ":") return k;
    }
    return -1;
  })();
  if (i === -1) return renderInline(escapeHtml(cell));
  return (
    `<span class="cell-main">${renderInline(escapeHtml(cell.slice(0, i).trim()))}</span>` +
    `<span class="cell-sub">${renderInline(escapeHtml(cell.slice(i + 2).trim()))}</span>`
  );
}

function splitTable(lines) {
  if (lines.length < 2) return null;
  const rows = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t.startsWith("|") || !t.endsWith("|") || t.length < 3) return null;
    const cells = t.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length < 2) return null;
    rows.push(cells);
  }
  // Ragged rows mean it isn't really a table, it's prose with pipes in it.
  if (rows.some((r) => r.length !== rows[0].length)) return null;
  return rows;
}


// "17 Dec - O Wisdom, …"
const DATED_RE = /^(\d{1,2}\s+\p{L}{3,9}\.?)\s+[-–—]\s+(\S[\s\S]*)$/u;

// "WISDOM - to judge and order all things by God's standard" — a term and its
// definition on one line. The caps term set inline in a serif paragraph just
// reads as shouting; pulled out into its own column it reads as a glossary,
// which is what these enumerations of gifts, virtues and vices actually are.
const DEF_RE = /^([A-Z][A-Z0-9 '’.-]{2,30})\s+[-–—]\s+(\S[\s\S]*)$/;

function splitDefinitions(lines) {
  const rows = lines.map((l) => {
    const m = l.match(DEF_RE);
    // "THE JOYFUL MYSTERIES — MONDAY AND SATURDAY" has the same shape but is a
    // heading: what follows the dash has to actually read as prose.
    if (!m || !/[a-z]/.test(m[2])) return { plain: l };
    return { term: m[1].trim(), text: m[2].trim() };
  });
  const matched = rows.filter((r) => r.term).length;
  if (matched < 2 || matched / rows.length < 0.6) return null;
  return rows;
}

// "charity - joy - peace - patience - …" is one enumeration that happens to be
// typed across two lines, and a hyphen breaking at the end of a line reads as
// a broken word. Set as a run with proper separators it stays one thing.
function splitDashRun(lines) {
  // A run may wrap onto the next line, but only where the writer left the
  // separator hanging at the end of the line. Without this, seven lines of
  // "17 Dec - O Sapientia" join into one run and every date ends up glued to
  // the antiphon above it.
  if (lines.slice(0, -1).some((l) => !/[-–—]$/.test(l.trim()))) return null;
  const parts = lines.join(" ").split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;
  if (!parts.every((p) => p.length <= 26 && !/[.:;!?]/.test(p))) return null;
  return parts;
}

// A numbered line: "1. Feed the hungry", "3) …". Whether it is a list item or
// prose that happens to open with a numeral is decided below, not here.
const NUM_RE = /^(\d+)[.)]\s+(.+)$/;

function renderTextBlock(text) {
  const out = [];
  let buf = []; // prose lines waiting to become a paragraph
  let items = []; // numbered items waiting to become a list

  const flushProse = () => {
    if (buf.length) out.push(renderProseLines(buf));
    buf = [];
  };
  const flushList = () => {
    if (!items.length) return;
    // One bare item is far likelier to be a sentence starting with a numeral
    // than a list of one, so it goes back to being prose.
    if (items.length === 1 && !items[0].body.length) {
      out.push(renderProseLines([items[0].raw]));
      items = [];
      return;
    }
    // A list whose items carry their own text (the Stations, the Seven Last
    // Words) needs room between them; a plain enumeration reads better tight.
    const roomy = items.some((it) => it.body.length);
    out.push(
      `<ol class="reader-list${roomy ? " roomy" : ""}">` +
        items
          .map(
            (it) =>
              `<li><span class="item-n">${escapeHtml(String(it.n))}.</span>` +
              `<span class="item-body"><span class="item-title">${renderInline(escapeHtml(it.title))}</span>` +
              (it.body.length
                ? `<span class="item-text">${it.body.map((l) => renderInline(escapeHtml(l))).join("<br>")}</span>`
                : "") +
              `</span></li>`
          )
          .join("") +
        "</ol>"
    );
    items = [];
  };
  const flush = () => {
    flushProse();
    flushList();
  };

  for (const para of (text || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);

    // Heading before rubric: "— Before —" matches both shapes, and it is a
    // division of the prayer, not an instruction inside one.
    if (lines.length === 1 && !isSectionHeadingLine(lines[0]) && isRubricLine(lines[0])) {
      flush();
      out.push(`<p class="reader-rubric">${renderInline(escapeHtml(stripRubricMarks(lines[0])))}</p>`);
      continue;
    }

    // Headings first so the litany test below sees only the invocations.
    while (lines.length && isSectionHeadingLine(lines[0])) {
      flush();
      out.push(`<h3 class="reader-section-head">${escapeHtml(sectionHeadingText(lines.shift()))}</h3>`);
    }

    const table = splitTable(lines);
    if (table) {
      flush();
      const [head, ...body] = table;
      out.push(
        `<div class="reader-table-wrap"><table class="reader-table"><thead><tr>` +
          head.map((c) => `<th>${renderInline(escapeHtml(c))}</th>`).join("") +
          `</tr></thead><tbody>` +
          body
            .map((r) =>
              // A row with only its first cell filled is a group heading —
              // Aquinas's division of the fruits, Matthew's of the beatitudes.
              // It spans the table rather than pretending to be data.
              r.slice(1).every((c) => c === "")
                ? `<tr class="table-group"><td colspan="${r.length}">${renderInline(escapeHtml(r[0]))}</td></tr>`
                : `<tr>` + r.map((c) => `<td>${renderCell(c)}</td>`).join("") + `</tr>`
            )
            .join("") +
          `</tbody></table></div>`
      );
      continue;
    }

    const defs = splitDefinitions(lines);
    if (defs) {
      flush();
      out.push(
        `<div class="reader-defs">` +
          defs
            .map((r) =>
              r.plain
                ? `<p class="def-full">${renderInline(escapeHtml(r.plain))}</p>`
                : `<span class="def-term">${escapeHtml(r.term)}</span>` +
                  `<span class="def-text">${renderInline(escapeHtml(r.text))}</span>`
            )
            .join("") +
          `</div>`
      );
      continue;
    }

    // A line ending in a colon introduces what follows rather than being part
    // of it — "And the twelve fruits that follow from them:".
    const lead = lines.length > 1 && /:$/.test(lines[0]) ? lines[0] : null;
    const run = splitDashRun(lead ? lines.slice(1) : lines);
    if (run) {
      flush();
      if (lead) out.push(renderProseLines([lead]));
      out.push(
        `<p class="reader-run">` +
          run.map((x) => `<span class="run-item">${renderInline(escapeHtml(x))}</span>`).join("") +
          `</p>`
      );
      continue;
    }

    const litany = lines.length && !lines.some((l) => VR_RE.test(l) || isSectionHeadingLine(l))
      ? splitLitany(lines)
      : null;
    if (litany) {
      flush();
      out.push(
        `<div class="litany">` +
          litany
            .map((r) =>
              r.plain
                ? `<p class="lit-line lit-plain">${renderInline(escapeHtml(r.plain))}</p>`
                : `<p class="lit-line"><span class="lit-inv">${renderInline(escapeHtml(r.inv))}</span> ` +
                  `<span class="lit-resp">${renderInline(escapeHtml(r.resp))}</span></p>`
            )
            .join("") +
          `</div>`
      );
      continue;
    }

    // "17 Dec - O Wisdom, …" — the O Antiphons are indexed by the day they are
    // sung, which is the one thing you need to find in Advent's last week.
    // The English sets one per paragraph and the Latin lists all seven in a
    // block, so both shapes have to work.
    const dated = lines.map((l) => l.match(DATED_RE));
    if (dated.length && dated.every(Boolean)) {
      flush();
      for (const d of dated) {
        const short = d[2].length < 60 ? " short" : "";
        out.push(
          `<p class="reader-dated${short}"><span class="dated-label">${escapeHtml(d[1])}</span>` +
            `<span class="dated-text">${renderInline(escapeHtml(d[2]))}</span></p>`
        );
      }
      continue;
    }

    lines.forEach((line, idx) => {
      if (isSectionHeadingLine(line)) {
        flush();
        out.push(`<h3 class="reader-section-head">${escapeHtml(sectionHeadingText(line))}</h3>`);
        return;
      }
      const m = line.match(NUM_RE);
      // Must continue the run — 1, then 2, then 3. A stray "1969. " in the
      // middle of a list is a date, not the next item.
      const continues = m && Number(m[1]) === (items.length ? items[items.length - 1].n + 1 : 1);
      if (continues) {
        flushProse();
        items.push({ n: Number(m[1]), title: m[2], body: [], raw: line });
      } else if (items.length && idx > 0) {
        // An unnumbered line under an item belongs to that item — the
        // meditation under its station. Only within the same paragraph: a
        // fresh paragraph that doesn't continue the count ends the list
        // instead of being swallowed by its last item.
        items[items.length - 1].body.push(line);
      } else {
        flushList();
        buf.push(line);
      }
    });
    flushProse();
  }
  flush();
  return out.join("");
}

function splitParagraphs(text) {
  return (text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Original-language text (Latin, Spanish, etc.) next to its English text,
// stanza by stanza (matched by paragraph position) — stacks original-then-
// English per stanza on narrow screens instead of two columns (see the
// media query in CSS).
function renderBilingualBlock(original, english, language) {
  const originalParas = splitParagraphs(original);
  const englishParas = splitParagraphs(english);
  const rows = Math.max(originalParas.length, englishParas.length);
  const cell = (text, cls) => `<div class="${cls}">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;

  let html = `<div class="bilingual-label">${escapeHtml(language || "Latin")}</div><div class="bilingual-label">English</div>`;
  for (let i = 0; i < rows; i++) {
    html += cell(originalParas[i] || "", "bilingual-latin");
    html += cell(englishParas[i] || "", "bilingual-english");
  }
  return `<div class="bilingual-grid">${html}</div>`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- Boot ---

// Courtesy content gate — this library is published on a public URL, so a
// stranger arriving cold gets told what it is before landing inside it.
// Not a security control (anyone can skip it via devtools); it's a notice.
const GATE_ACCEPTED_KEY = "recollection.gateAccepted.v1";

function startApp() {
  $("#view-gate").classList.remove("active");
  // Public builds (the hosted copy) drop the Journal tab: reflections live
  // in this browser's localStorage with no sync, so a journal written on a
  // visiting device would be stranded there. Library + Saints are the
  // shareable reference half. Elements stay in the DOM (so none of the
  // journal wiring breaks) — CSS just hides the tab and its panel.
  if (window.RECOLLECTION_PUBLIC_MODE) document.body.classList.add("public-mode");
  if (window.RECOLLECTION_LOCAL_MODE) {
    // No account, no network — data lives in this browser's localStorage.
    $("#btn-signout").classList.add("hidden");
    onSignedIn();
  } else {
    $("#view-signin").classList.add("active");
  }
}

// Panel intro notes (Library, Saints) — a short line of context at the top of
// a tab. Collapsing one leaves a small link in its place rather than removing
// it, so it is always recoverable. State is remembered per browser.
const NOTE_COLLAPSED_KEY = "recollection.notesCollapsed.v1";

function initPanelNotes() {
  let collapsed = [];
  try {
    collapsed = JSON.parse(localStorage.getItem(NOTE_COLLAPSED_KEY) || "[]");
  } catch {
    collapsed = [];
  }

  const persist = () => {
    try {
      localStorage.setItem(NOTE_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      /* storage blocked — the note simply reopens next visit */
    }
  };

  document.querySelectorAll(".panel-note").forEach((note) => {
    if (collapsed.includes(note.dataset.note)) note.classList.add("collapsed");
  });

  document.querySelectorAll("[data-toggle-note]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.toggleNote;
      const note = document.querySelector(`.panel-note[data-note="${name}"]`);
      if (!note) return;

      const nowCollapsed = !note.classList.contains("collapsed");
      note.classList.toggle("collapsed", nowCollapsed);

      collapsed = collapsed.filter((n) => n !== name);
      if (nowCollapsed) collapsed.push(name);
      persist();
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initPalette();
  initPanelNotes();
  let gateAccepted = false;
  try {
    gateAccepted = localStorage.getItem(GATE_ACCEPTED_KEY) === "true";
  } catch {
    gateAccepted = false; // private browsing / storage blocked — just show the gate
  }
  $("#btn-gate-enter").addEventListener("click", () => {
    try {
      localStorage.setItem(GATE_ACCEPTED_KEY, "true");
    } catch {
      /* not fatal — they'll just see the gate again next visit */
    }
    startApp();
  });
  // Auth wiring happens regardless of the gate — only the actual entry
  // into the app (startApp) waits on it.
  if (!window.RECOLLECTION_LOCAL_MODE) {
    initAuth({
      onSignedIn: onSignedIn,
      onError: (err) => alert("Sign-in failed: " + (err.error || "unknown error")),
    });
    $("#btn-signin").addEventListener("click", signIn);
    $("#btn-signout").addEventListener("click", () => {
      signOut();
      location.reload();
    });
  }

  if (gateAccepted) startApp();

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  $("#btn-new-library").addEventListener("click", () => openLibraryEditor(null));
  $("#btn-new-journal").addEventListener("click", () => openWriter(null));
  $("#library-search").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    renderLibraryList();
  });
  $("#library-sort").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderLibraryList();
  });
  function clearAllFilters() {
    state.filterKind = "all";
    state.filterTags.clear();
    state.filterAuthor = null;
    state.filterOrigin = null;
    state.filterLiturgical = null;
    state.filterFavoritesOnly = false;
    state.filterBilingualOnly = false;
    state.finderRestrict = null;
    renderLibraryList();
  }
  $("#btn-clear-tag-filter").addEventListener("click", clearAllFilters);
  $("#btn-filters-clear-all").addEventListener("click", clearAllFilters);
  $$(".kind-chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.filterKind = chip.dataset.kind;
      renderLibraryList();
    })
  );
  $("#btn-open-filters").addEventListener("click", () => setView("library-filters"));
  $("#btn-open-finder").addEventListener("click", openFinder);
  // Refinement is offered where it is wanted — at the end of the finder —
  // rather than as a rival door beside it on the library screen.
  $("#btn-finder-refine").addEventListener("click", () => {
    // Carry the finder's candidates over. Without this the Filters panel
    // narrows the whole library and the finder's work is silently thrown away.
    const candidates = finderCandidates();
    state.finderRestrict = finderState.answers.length
      ? {
          ids: new Set(candidates.map((e) => e.id)),
          label: finderState.answers.map((a) => a.optionLabel).join(" › "),
        }
      : null;
    // Setting state is not enough — the list keeps its previous render until
    // something redraws it, which is why the restriction appeared to do
    // nothing until the next click.
    renderLibraryList();
    setView("library-filters");
  });
  $("#btn-finder-back").addEventListener("click", () => setView("library"));
  $("#btn-finder-restart").addEventListener("click", openFinder);
  $("#btn-finder-showall").addEventListener("click", () => {
    finderState.showingAll = true;
    renderFinder();
  });
  $("#btn-filters-done").addEventListener("click", () => setView("library"));
  $("#btn-filters-show").addEventListener("click", () => setView("library"));
  $("#btn-saints-filters-show").addEventListener("click", () => setView("saints"));
  $("#filter-favorites-only").addEventListener("change", (e) => {
    state.filterFavoritesOnly = e.target.checked;
    renderLibraryList();
  });
  $("#filter-bilingual-only").addEventListener("change", (e) => {
    state.filterBilingualOnly = e.target.checked;
    renderLibraryList();
  });
  $("#filter-author-select").addEventListener("change", (e) => {
    state.filterAuthor = e.target.value || null;
    renderLibraryList();
  });

  $("#library-editor-form").addEventListener("submit", onSaveLibraryEntry);
  $("#lib-kind").addEventListener("change", updateFeastDayVisibility);
  $("#btn-library-cancel").addEventListener("click", () => {
    if (state.editingLibraryId) openLibraryReader(state.editingLibraryId);
    else setView("library");
  });
  $("#btn-library-delete").addEventListener("click", onDeleteLibraryEntry);

  $("#btn-reader-back").addEventListener("click", () => {
    if (state.readerCameFromFinder) {
      state.readerCameFromFinder = false;
      setView("finder");
      renderFinder();
    } else {
      setView("library");
    }
  });
  $("#btn-reader-edit").addEventListener("click", () => openLibraryEditor(state.readingLibraryId));
  $("#btn-part-prev").addEventListener("click", () => stepReaderPart(-1));
  $("#btn-part-next").addEventListener("click", () => stepReaderPart(1));
  $("#btn-part-toggle").addEventListener("click", () => {
    readerParts.showAll = !readerParts.showAll;
    renderReaderParts();
  });
  $("#btn-part-now").addEventListener("click", () => {
    readerParts.index = new Date().getHours();
    renderReaderParts();
  });
  // Arrow keys move through a numbered sequence when one is open.
  document.addEventListener("keydown", (e) => {
    if (state.view !== "library-reader" || readerParts.showAll || !readerParts.list.length) return;
    if (e.key === "ArrowLeft") stepReaderPart(-1);
    if (e.key === "ArrowRight") stepReaderPart(1);
  });

  $("#btn-writer-back").addEventListener("click", () => setView("journal"));
  $("#btn-writer-delete").addEventListener("click", onDeleteJournalEntry);
  ["writer-title", "writer-body", "writer-tags", "writer-link"].forEach((id) => {
    $("#" + id).addEventListener("input", scheduleAutosave);
  });

  $("#saints-search").addEventListener("input", (e) => {
    state.saintsSearchQuery = e.target.value;
    renderSaintsList();
  });
  $("#saints-sort").addEventListener("change", (e) => {
    state.saintsSortBy = e.target.value;
    renderSaintsList();
  });
  $("#btn-open-saints-filters").addEventListener("click", () => setView("saints-filters"));
  $("#btn-saints-filters-done").addEventListener("click", () => setView("saints"));
  $("#btn-saints-filters-clear-all").addEventListener("click", () => {
    state.saintsFilterStatus = "all";
    state.saintsFilterDepth = "all";
    state.saintsFilterTier = "all";
    state.saintsFilterCause = "all";
    renderSaintsList();
  });
  $$(".status-chip", $("#saints-filter-status-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.saintsFilterStatus = chip.dataset.status;
      renderSaintsList();
    })
  );
  $$(".depth-chip", $("#saints-filter-depth-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.saintsFilterDepth = chip.dataset.depth;
      renderSaintsList();
    })
  );
  $$(".tier-chip", $("#saints-filter-tier-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.saintsFilterTier = chip.dataset.tier;
      renderSaintsList();
    })
  );
  $$(".cause-chip", $("#saints-filter-cause-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.saintsFilterCause = chip.dataset.cause;
      renderSaintsList();
    })
  );
  $("#btn-saint-reader-back").addEventListener("click", () => setView("saints"));
  $("#btn-saint-study").addEventListener("click", () => openFlashcards(state.readingSaintSlug));
  $("#btn-open-flashcards").addEventListener("click", () => openFlashcards(null));
  $("#btn-export-ics").addEventListener("click", exportSaintsICS);

  $("#btn-open-saints-calendar").addEventListener("click", () => {
    renderSaintsCalendar();
    setView("saints-calendar");
  });
  $("#btn-saints-calendar-back").addEventListener("click", () => setView("saints"));
  $("#btn-calendar-prev").addEventListener("click", () => shiftCalendarMonth(-1));
  $("#btn-calendar-next").addEventListener("click", () => shiftCalendarMonth(1));
  $("#btn-calendar-today").addEventListener("click", () => {
    const now = new Date();
    state.calendarMonth = now.getMonth();
    state.calendarYear = now.getFullYear();
    renderSaintsCalendar();
  });

  $("#btn-open-saints-atlas").addEventListener("click", () => {
    renderSaintsAtlas();
    setView("saints-atlas");
  });
  $("#btn-saints-atlas-back").addEventListener("click", () => setView("saints"));
  $$(".tier-chip", $("#atlas-filter-tier-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.saintsFilterTier = chip.dataset.tier;
      renderSaintsAtlas();
    })
  );
  // The era chips are presets over the same year window the number inputs
  // and the histogram drive — three ways into one filter, never three
  // competing filters.
  const ERA_PRESETS = { all: [null, null], ancient: [null, 499], medieval: [500, 1499], "early-modern": [1500, 1799], modern: [1800, null] };
  $$(".century-chip", $("#atlas-filter-century-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      const [from, to] = ERA_PRESETS[chip.dataset.century] || [null, null];
      const b = atlasYearBounds();
      state.atlasFilterCentury = chip.dataset.century;
      state.atlasYearFrom = from == null ? (chip.dataset.century === "all" ? null : b.min) : from;
      state.atlasYearTo = to == null ? (chip.dataset.century === "all" ? null : b.max) : to;
      state.atlasActiveKey = null;
      renderSaintsAtlas();
    })
  );

  $("#btn-atlas-panel").addEventListener("click", () => {
    state.atlasPanelOpen = !state.atlasPanelOpen;
    renderSaintsAtlas();
  });
  $("#btn-atlas-clear").addEventListener("click", clearAtlasFilters);
  $("#btn-atlas-year-reset").addEventListener("click", () => {
    state.atlasYearFrom = null;
    state.atlasYearTo = null;
    state.atlasFilterCentury = "all";
    renderSaintsAtlas();
  });
  const onYearInput = () => {
    const f = $("#atlas-year-from").value.trim();
    const t = $("#atlas-year-to").value.trim();
    state.atlasYearFrom = f === "" ? null : parseInt(f, 10);
    state.atlasYearTo = t === "" ? null : parseInt(t, 10);
    state.atlasFilterCentury = "all";
    renderSaintsAtlas();
  };
  $("#atlas-year-from").addEventListener("change", onYearInput);
  $("#atlas-year-to").addEventListener("change", onYearInput);
  $$(".place-chip", $("#atlas-placemode-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.atlasPlaceMode = chip.dataset.place;
      state.atlasActiveKey = null;
      renderSaintsAtlas();
    })
  );
  $$(".status-chip", $("#atlas-status-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.atlasStatus = chip.dataset.status;
      renderSaintsAtlas();
    })
  );
  $("#atlas-journeys").addEventListener("change", (e) => {
    state.atlasJourneys = e.target.checked;
    renderSaintsAtlas();
  });
  $("#atlas-incorrupt").addEventListener("change", (e) => {
    state.atlasIncorruptOnly = e.target.checked;
    renderSaintsAtlas();
  });
  $("#atlas-saint-search").addEventListener("input", (e) => {
    state.atlasSaintSearch = e.target.value;
    renderAtlasSaintPicker();
  });
  $("#btn-atlas-pick-none").addEventListener("click", () => {
    state.atlasExcluded = new Set(window.SAINTS.map((s) => s.slug));
    renderSaintsAtlas();
  });
  $("#btn-atlas-pick-all").addEventListener("click", () => {
    state.atlasExcluded = null;
    renderSaintsAtlas();
  });
  $("#btn-flashcards-back").addEventListener("click", () => setView("saints"));
  $("#btn-flashcard-flip").addEventListener("click", flipFlashcard);
  $$("#flashcard-rate .btn").forEach((btn) =>
    btn.addEventListener("click", () => rateFlashcard(btn.dataset.quality))
  );

  // Back and forward. A hash the app wrote itself is skipped, or every
  // programmatic navigation would round-trip through the router.
  window.addEventListener("hashchange", () => {
    if (writingHash) {
      writingHash = false;
      return;
    }
    routeFromHash();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});

async function onSignedIn() {
  $("#view-signin").classList.remove("active");
  $("#app-shell").classList.add("active");
  await seedDefaultsIfEmpty();
  await pruneRetiredSeeds();
  await dedupeLibraryByTitle();
  await Promise.all([refreshLibrary(), refreshJournal(), refreshSaints()]);
  // Honour a deep link if there is one; otherwise open on the library.
  routeFromHash();
}

// AUTHOR FIELD CONVENTION
// ------------------------
// `author` holds who wrote it, and nothing else — caveats about the
// attribution go in `authorNote`, never welded onto the name (a name of the
// form "Attributed to X" also stops the dossier link from resolving).
//
// Where no person can be named, exactly two values are used:
//
//   "Traditional"  the text has been in devotional or liturgical use for
//                  centuries with no individual author ever claimed —
//                  the Memorare, Anima Christi, the Acts, the Angelus.
//   "Unknown"      a specific composition by a specific person we cannot
//                  identify — usually modern, usually circulating under a
//                  saint's borrowed name. The Peace Prayer (1912) and the
//                  "use words if necessary" line are both this, not
//                  traditional.
//
// Collective bodies keep their own name ("The Desert Fathers", a council).
// Do not add "Anonymous" — it was a third label for these same two ideas.
//
// Real starter entries so the Library isn't empty on first launch. Each is
// matched by title+kind and backfilled in place if it was already saved by
// an earlier version of this app missing the newer fields — so re-running
// this is always safe, never duplicates.
const SEED_LIBRARY_ENTRIES = [
  {
    title: "All the Way to Heaven Is Heaven",
    occasion:
      "From her letters, written to popes, mercenaries, prisoners and her own family — generally to tell someone that the situation they were trying to get past was the place they were being met.",
    kind: "quote", tags: ["hope", "perseverance", "Dominican", "trust", "daily"],
    source: "Letters", author: "St. Catherine of Siena", year: "14th century",
    origin: "Dominican", liturgical: "", feastDay: "29 April", favorite: false,
    body:
      "All the way to heaven is heaven,\n" +
      "because He said: I am the way.",
    background:
      "The argument is a piece of logic, not a sentiment, and it turns on a " +
      "single scriptural verse. If Christ is the road and not only the " +
      "destination, then travelling and arriving are not two different kinds " +
      "of thing — you are already in contact with what you are going toward.\n\n" +
      "That has a practical consequence Catherine drew constantly in her " +
      "letters: it removes the idea of a waiting period. There is no stretch " +
      "of life that is merely the corridor before the real thing begins. She " +
      "wrote to popes, mercenaries, prisoners and her own family in the same " +
      "terms, generally to tell someone that the situation they were trying " +
      "to get past was the place they were being met.",
  },
  // ── Saint quotes, batch 4: Fathers, Doctors, martyrs, moderns ──────────
  {
    title: "Gaze, Consider, Contemplate",
    occasion:
      "Written in 1235 to Agnes of Prague, a Bohemian princess who had refused an imperial marriage to found a poor monastery, and had asked Clare how one becomes like Christ.",
    kind: "quote", tags: ["contemplation", "Franciscan", "adoration", "love"],
    source: "Second Letter to Blessed Agnes of Prague",
    author: "St. Clare of Assisi", year: "1235", origin: "Poor Clares",
    liturgical: "", feastDay: "11 August", favorite: false,
    body:
      "Gaze upon Him, consider Him, contemplate Him,\n" +
      "as you desire to imitate Him.",
    background:
      "Four verbs in deliberate order, and the order is the method. Gaze is " +
      "simply looking; consider is thinking about what you see; contemplate " +
      "is resting in it; imitate is the last, not the first. Clare is " +
      "answering a young woman — Agnes, a Bohemian princess who had refused " +
      "an imperial marriage to found a poor monastery — who wanted to know " +
      "how to become like Christ.\n\n" +
      "The answer is that you do not begin with imitation. You begin by " +
      "looking, long enough and often enough that likeness follows. Clare " +
      "had by then spent over twenty years enclosed at San Damiano, much of " +
      "it fighting successive popes for the right to remain poor.",
  },
  {
    title: "Love That Cannot Suffer",
    occasion:
      "Attributed within the Poor Clare tradition; the particular occasion is not recorded.",
    kind: "quote", tags: ["love", "suffering", "Franciscan", "charity"],
    source: "Attributed in Poor Clare tradition",
    author: "St. Clare of Assisi", authorNote: "attributed; not pinned to a surviving letter",
    year: "13th century", origin: "Poor Clares", liturgical: "", feastDay: "11 August", favorite: false,
    body: "Love that cannot suffer is not worthy of that name.",
    background:
      "A definition by exclusion, and a hard one. It does not say love " +
      "*will* suffer, as a regrettable side-effect; it says a love " +
      "constitutionally unable to is misnamed — the word has been borrowed " +
      "for something else, probably preference or enjoyment.\n\n" +
      "The test is uncomfortable to apply, and it is meant to be applied to " +
      "oneself rather than to others. It asks what your affection has ever " +
      "actually cost you, and treats the answer as the measurement.",
  },
  {
    title: "Each of Your Saints Reflects a Virtue",
    occasion:
      "Written in her Diary in the 1930s, as she worked out which of Christ's qualities she was placed to show — the reasoning that became the Divine Mercy devotion.",
    kind: "quote", tags: ["charity", "Divine Mercy", "contemplation", "little way"],
    source: "Diary, 1242", author: "St. Faustina Kowalska", year: "1930s",
    origin: "Divine Mercy devotion", liturgical: "", feastDay: "5 October", favorite: false,
    body:
      "O my Jesus, each of Your saints reflects one of Your virtues;\n" +
      "I desire to reflect Your compassionate heart,\n" +
      "full of mercy; I want to glorify it.",
    background:
      "A choice, made deliberately, out of a range of options. Faustina is " +
      "not claiming mercy is the greatest virtue; she is observing that " +
      "saints specialise — that no one reflects everything, and that picking " +
      "one is how it is actually done.\n\n" +
      "That is a useful corrective to the idea that holiness means being " +
      "uniformly excellent. The *Diary* entry continues into what became the " +
      "Divine Mercy devotion, but the reasoning underneath it is available " +
      "to anyone: work out which of Christ's qualities you are placed to " +
      "show, and show that one.",
  },
  {
    title: "The Spirit of Faith With Which It Is Undertaken",
    occasion:
      "Written from the Indies in the 1540s to Jesuits in Europe who felt their teaching work was trivial beside his missionary journeys. His answer removes the glamour from his own position deliberately.",
    kind: "quote", tags: ["work", "Ignatian", "zeal", "daily"],
    source: "Letters, from the Indies", author: "St. Francis Xavier",
    year: "1540s", origin: "Ignatian", liturgical: "", feastDay: "3 December", favorite: false,
    body:
      "It is not the actual physical exertion that counts towards a man's progress,\n" +
      "nor the nature of the task,\n" +
      "but the spirit of faith with which it is undertaken.",
    background:
      "Written by a man doing enormous amounts of physical exertion. Xavier " +
      "covered India, the Moluccas and Japan in ten years, largely on foot " +
      "and by open boat, and died on an island off China waiting for a " +
      "passage he never got. He of all people could have made the exertion " +
      "the point.\n\n" +
      "He is instead heading off a comparison his correspondents in Europe " +
      "were making — that missionaries in the Indies were doing the real " +
      "work while they taught school in Rome. His answer takes the glamour " +
      "out of his own position deliberately.",
  },
  {
    title: "First Learn to Suffer",
    occasion:
      "Written in letters by a young woman with spinal tuberculosis who had lost both parents by nineteen and been refused entry to the convent she wanted because of her health. She died at twenty-five.",
    kind: "quote", tags: ["suffering", "love", "Passion", "contemplation"],
    source: "Letters and Diary", author: "St. Gemma Galgani", year: "c. 1900",
    origin: "Passionist", liturgical: "", feastDay: "11 April", favorite: false,
    body:
      "If you really want to love Jesus,\n" +
      "first learn to suffer,\n" +
      "because suffering teaches you to love.",
    background:
      "She was not recommending a course she had not taken.\n\n" +
      "The claim is causal and worth stating precisely: not that suffering " +
      "is good, nor that it should be sought, but that it *teaches* — that " +
      "it is the school in which a certain kind of love becomes possible, " +
      "because it removes the option of loving only when it is pleasant. " +
      "Gemma is one of the saints most easily made unbearable by " +
      "sentimentality; the sentence is tougher than the pictures of her.",
  },
  {
    title: "When in Rome",
    occasion:
      "Ambrose's answer to St. Monica, newly arrived in Milan and troubled that the local fasting customs differed from those in Africa. Augustine recorded it in Letter 54 to Januarius.",
    kind: "quote", tags: ["Patristic", "humility", "charity", "catechetical"],
    source: "Advice to St. Monica, reported by Augustine — Letter 54, to Januarius",
    author: "St. Ambrose of Milan",
    authorNote: "the proverb is a much later compression of his actual advice",
    year: "4th century", origin: "Patristic", liturgical: "", feastDay: "7 December", favorite: false,
    body:
      "When I am here, I do not fast on Saturday;\n" +
      "when I am at Rome, I do fast on Saturday.\n" +
      "Follow the custom of whatever church you attend,\n" +
      "if you do not want to give or receive scandal.",
    background:
      "The origin of the proverb, and much better than the proverb. Monica " +
      "had moved to Milan and was worried: the fasting customs differed from " +
      "Africa's, and she wanted to know which was right. Ambrose's answer " +
      "declines the question — neither is right, both are customs, and the " +
      "thing that actually matters is not making trouble over it.\n\n" +
      "'When in Rome, do as the Romans do' has drifted into advice about " +
      "blending in. What Ambrose said was narrower and more interesting: on " +
      "matters where the Church has not decided, treat local practice as " +
      "binding on you, precisely so that no one has to argue about it.",
  },
  {
    title: "We Hear Him When We Read",
    occasion:
      "From De Officiis Ministrorum, written in the 380s as instruction for his clergy in Milan. The Catechism quotes it at paragraph 2653, in the section on lectio divina.",
    kind: "quote", tags: ["Scripture", "reading", "Patristic", "contemplation"],
    source: "De Officiis Ministrorum I.20.88 — quoted in CCC 2653",
    author: "St. Ambrose of Milan", year: "4th century", origin: "Patristic",
    liturgical: "", feastDay: "7 December", favorite: false,
    body:
      "We speak to Him when we pray;\n" +
      "we hear Him when we read the divine sayings.",
    background:
      "Read this beside the Jerome entry in this library and the Isidore one. " +
      "Three Fathers arrive at almost the same sentence independently, which " +
      "is why the attribution of the famous modern version is such a mess — " +
      "there was never one original to misattribute.\n\n" +
      "Ambrose's version is the one the Catechism quotes, at paragraph 2653, " +
      "in the section on lectio divina. His verb is *hear*, which assumes " +
      "something the others leave implicit: that reading Scripture is a " +
      "listening posture, and that the awkwardness of not being able to " +
      "interrupt is part of the exercise.",
  },
  {
    title: "The Wheat of God",
    occasion:
      "Written under guard around the year 107, in transit to Rome and the arena, to a Christian community that was preparing to use its influence to have him released. The letter asks them to stop.",
    kind: "quote", tags: ["death", "eucharist", "courage", "Patristic"],
    source: "Letter to the Romans, 4 — written on the way to his execution",
    author: "St. Ignatius of Antioch", year: "c. 107", origin: "Patristic",
    liturgical: "", feastDay: "17 October", favorite: false,
    body:
      "I am the wheat of God,\n" +
      "and I am ground by the teeth of the wild beasts,\n" +
      "that I may be found the pure bread of Christ.",
    background:
      "The letter is, extraordinarily, a request that his friends stop trying to " +
      "save him.\n\n" +
      "The image is Eucharistic and entirely deliberate: he is about to be " +
      "eaten, and he reads that as being made into bread. This is one of the " +
      "earliest Christian texts outside the New Testament, from a bishop who " +
      "may have known the apostles, and it is startling how developed the " +
      "sacramental thinking already is. Elsewhere in the same letters he " +
      "gives us the first surviving use of the phrase 'the Catholic Church'.",
  },
  {
    title: "Eighty and Six Years",
    occasion:
      "Said around the year 155 to the proconsul at Smyrna, who had offered him an easy way out: swear by Caesar's fortune, curse Christ, and go home. He was an old man and the crowd would have accepted it.",
    kind: "quote", tags: ["faithfulness", "courage", "death", "Patristic"],
    source: "Martyrdom of Polycarp, 9", author: "St. Polycarp of Smyrna",
    year: "c. 155", origin: "Patristic", liturgical: "", feastDay: "23 February", favorite: false,
    body:
      "Eighty and six years have I served Him,\n" +
      "and He has done me no wrong.\n" +
      "How then can I blaspheme my King and my Saviour?",
    background:
      "What makes the answer land is that it is not defiance but arithmetic.\n\n" +
      "What makes the answer land is that it is not defiance but arithmetic. " +
      "He does not argue about Caesar or about doctrine; he adds up eighty-six " +
      "years of a relationship and observes that nothing in the ledger would " +
      "justify walking out now. It is the reasoning of loyalty rather than " +
      "of courage, which is perhaps why it has lasted. He was burned, and the " +
      "account of it is the earliest surviving record of a Christian martyrdom " +
      "outside Scripture.",
  },
  {
    title: "Man Fully Alive",
    occasion:
      "Written c. 180 against Gnostics who held that matter and bodies were a mistake to escape from — which is why the glory of God is located in a living human being, flesh included.",
    kind: "quote", tags: ["Patristic", "hope", "identity", "contemplation"],
    source: "Against Heresies IV.20.7", author: "St. Irenaeus of Lyon",
    year: "c. 180", origin: "Patristic", liturgical: "", feastDay: "28 June", favorite: false,
    body:
      "The glory of God is man fully alive;\n" +
      "and the life of man is the vision of God.",
    background:
      "Almost always quoted as the first line only, which turns it into a " +
      "slogan about human flourishing. The second line is what keeps it " +
      "Christian: what a fully alive human being consists of is the sight of " +
      "God. Take that away and the first half will happily mean whatever the " +
      "reader already wanted it to mean.\n\n" +
      "Irenaeus was arguing against Gnostics who held that matter and bodies " +
      "were a mistake to escape from. His reply is that God is glorified " +
      "precisely in a living human being — flesh included — which is why the " +
      "line has such force against every spirituality that treats being " +
      "human as the problem.",
  },
  {
    title: "The Bread You Do Not Use",
    occasion:
      "Preached during a famine in Cappadocia in the late 360s, while Basil was selling his inheritance, running soup kitchens and building a hospital complex outside Caesarea large enough to be called a new city.",
    kind: "quote", tags: ["charity", "justice", "Patristic", "poverty"],
    source: "Homily on Luke 12:18 — 'I will pull down my barns'",
    author: "St. Basil the Great", year: "c. 368", origin: "Patristic",
    liturgical: "", feastDay: "2 January", favorite: false,
    body:
      "The bread which you do not use is the bread of the hungry;\n" +
      "the garment hanging in your wardrobe is the garment of him who is naked;\n" +
      "the shoes you do not wear are the shoes of the one who is barefoot;\n" +
      "the money you keep locked away is the money of the poor.",
    background:
      "The sermon is not theoretical, and its author was not asking anything he " +
      "had not already done.\n\n" +
      "Note the grammar, which is the whole argument: he does not say you " +
      "*ought to give* the bread to the hungry. He says it *is* theirs — a " +
      "claim about ownership, not generosity. The surplus was never yours to " +
      "be commended for handing over. This is among the strongest statements " +
      "in the Fathers of what later teaching calls the universal destination " +
      "of goods.",
  },
  {
    title: "What Has Not Been Assumed",
    occasion:
      "Written c. 382 in Letter 101 to Cledonius, to settle the teaching of Apollinarius, who held that in Christ the divine Word replaced the human mind.",
    kind: "quote", tags: ["Incarnation", "Patristic", "Trinity", "catechetical"],
    source: "Letter 101, to Cledonius", author: "St. Gregory Nazianzen",
    year: "c. 382", origin: "Patristic", liturgical: "", feastDay: "2 January", favorite: false,
    body:
      "What has not been assumed has not been healed;\n" +
      "but what is united to God is also saved.",
    background:
      "One sentence that settles an argument. Apollinarius had taught that " +
      "in Christ the divine Word replaced the human mind — a tidy solution " +
      "that kept him from having a human will to go wrong. Gregory's reply " +
      "runs: if he did not take a human mind, then human minds are not " +
      "healed, and the mind is exactly the part of us most in need of it.\n\n" +
      "It remains the sharpest tool in Christian anthropology, because it " +
      "works in every direction. Whatever you think Christ did not really " +
      "take on — a body, fear, exhaustion, a death — is by that much left " +
      "outside the rescue. It is also why the Incarnation cannot be softened " +
      "into a sort of divine costume.",
  },
  {
    title: "Scripture Grows With the Reader",
    occasion:
      "From the Moralia in Job, begun as informal talks to his brethren and completed while governing a Rome collapsing under plague and Lombard invasion.",
    kind: "quote", tags: ["Scripture", "reading", "contemplation", "Patristic"],
    source: "Moralia in Job, XX.1", author: "St. Gregory the Great",
    year: "c. 590", origin: "Papal", liturgical: "", feastDay: "3 September", favorite: false,
    body:
      "Divine Scripture grows with the one who reads it.",
    background:
      "An observation from a man who spent decades on the book of Job, and " +
      "an explanation of why a text you have read many times is not used up. " +
      "The book does not change; the reader does, and a larger reader finds " +
      "more in it — which means the experience of a passage suddenly opening " +
      "is evidence of growth rather than of having missed something before.\n\n" +
      "Gregory was a reluctant pope, a former prefect of Rome who wanted to " +
      "be a monk, and governed a city collapsing under plague and Lombard " +
      "invasion. The *Moralia* were begun as informal talks to his brethren " +
      "and are one of the most influential books of the Middle Ages.",
  },
  {
    title: "You Are Not Like Us",
    occasion:
      "Recorded among the sayings of Abba Antony in the Egyptian desert in the fourth century, in a collection otherwise relentless about self-deception and about not judging one's neighbour.",
    kind: "quote", tags: ["desert fathers", "courage", "faithfulness", "Patristic"],
    source: "Apophthegmata Patrum — sayings of Abba Antony",
    author: "St. Anthony the Great", year: "4th century", origin: "Patristic",
    liturgical: "", feastDay: "17 January", favorite: false,
    body:
      "A time is coming when men will go mad,\n" +
      "and when they see someone who is not mad,\n" +
      "they will attack him, saying:\n" +
      "'You are mad; you are not like us.'",
    background:
      "Easy to enjoy for the wrong reasons, and worth handling carefully. It " +
      "is a favourite of anyone convinced their own unpopular opinions prove " +
      "their sanity — which is precisely the use the desert tradition would " +
      "have warned against, since the same collection is relentless about " +
      "self-deception and about not judging one's neighbour.\n\n" +
      "Antony's point sits in a context of ascetic realism, not culture war. " +
      "He is describing a condition in which a shared madness becomes the " +
      "standard of sanity — and the mark of it is not that you hold unusual " +
      "views but that you are *attacked for not being like us*. The " +
      "difference between the two readings is whether you are the one " +
      "keeping quiet or the one shouting.",
  },
  {
    title: "Ask Grace, Not Learning",
    occasion:
      "The closing instruction of The Journey of the Mind to God, written in 1259 on Mount La Verna, where Francis had received the stigmata thirty-five years earlier. Bonaventure went there to think about what had happened to a man who was not a scholar.",
    kind: "quote", tags: ["contemplation", "humility", "Franciscan", "prayer"],
    source: "The Journey of the Mind to God, ch. VII", author: "St. Bonaventure",
    year: "1259", origin: "Franciscan", liturgical: "", feastDay: "15 July", favorite: false,
    body:
      "Ask grace, not learning;\n" +
      "desire, not understanding;\n" +
      "the groaning of prayer, not diligence in reading.",
    background:
      "The closing instruction of a rigorous scholastic treatise, which is " +
      "what makes it credible rather than anti-intellectual. Bonaventure was " +
      "a master at Paris and general of the Franciscans; the six chapters " +
      "before this one are a demanding philosophical ascent. Having built the " +
      "ladder with great care, he tells you at the top that the last step is " +
      "not taken by climbing.\n\n" +
      "It was written on Mount La Verna, where Francis had received the " +
      "stigmata thirty-five years earlier — Bonaventure went there to think " +
      "about what had happened to a man who was not a scholar at all.",
  },
  {
    title: "Prayer Purifies, Reading Instructs",
    occasion:
      "From the Sentences, written c. 620 by the last of the Latin Fathers, who spent his life trying to preserve learning in a Spain that had stopped producing it.",
    kind: "quote", tags: ["Scripture", "reading", "prayer", "contemplation"],
    source: "Sentences III.8", author: "St. Isidore of Seville",
    year: "c. 620", origin: "Patristic", liturgical: "", feastDay: "4 April", favorite: false,
    body:
      "Prayer purifies us, reading instructs us.\n" +
      "Both are good when both are possible.\n" +
      "When we pray, we speak to God;\n" +
      "when we read, God speaks to us.",
    background:
      "This is where the famous sentence actually comes from. The version " +
      "everyone quotes travels under Jerome's name via Alphonsus Liguori's " +
      "paraphrase — but Isidore wrote it, in these words, in the *Sentences*, " +
      "and Ambrose had said something very close two centuries earlier.\n\n" +
      "Isidore's version has a clause the others lack, and it is the humane " +
      "one: 'both are good when both are possible'. He is not ranking the " +
      "two, and he is allowing that sometimes only one of them is available " +
      "to you. He was the last of the Latin Fathers, and spent his life " +
      "trying to preserve learning in a Spain that had stopped producing it.",
  },
  {
    title: "A Feather on the Breath of God",
    occasion:
      "How she described herself when asked by what authority a woman was preaching, composing, prescribing medicine and writing to popes and emperors.",
    kind: "quote", tags: ["trust", "humility", "surrender", "contemplation"],
    source: "Letters", author: "St. Hildegard of Bingen", year: "12th century",
    origin: "Benedictine", liturgical: "", feastDay: "17 September", favorite: false,
    body: "I am a feather on the breath of God.",
    background:
      "It reads as humility and functions as something else: a feather has no weight of its own, so nothing it does can be " +
      "attributed to it — which is an unanswerable defence.\n\n" +
      "Hildegard was an abbess, composer, natural scientist and visionary who " +
      "went on preaching tours in her sixties and once placed her whole " +
      "convent under interdict rather than exhume a body she believed had " +
      "died reconciled. Whatever the image suggests, it is not passivity.",
  },
  {
    title: "Let Your Actions Speak",
    occasion:
      "From his sermons. Anthony was the Franciscans' first theology lecturer, appointed by Francis himself with a note approving it provided study did not extinguish prayer.",
    kind: "quote", tags: ["preaching", "Franciscan", "charity", "work"],
    source: "Sermons", author: "St. Anthony of Padua", year: "13th century",
    origin: "Franciscan", liturgical: "", feastDay: "13 June", favorite: false,
    body:
      "Actions speak louder than words;\n" +
      "let your words teach and your actions speak.",
    background:
      "The both-and that the 'preach without words' misattribution turns " +
      "into an either-or — and this one is genuinely from a Franciscan " +
      "preacher. Anthony does not put words and deeds in competition. He " +
      "assigns them different jobs: words *teach*, which is a task nothing " +
      "else can do, and actions *speak*, which is a different register of " +
      "communication entirely.\n\n" +
      "He was the order's first theology lecturer, appointed by Francis " +
      "himself with a note approving of it provided study did not extinguish " +
      "prayer. He preached to crowds too large for churches, and is a Doctor " +
      "of the Church.",
  },
  {
    title: "Excuses for Sins",
    occasion:
      "Attributed within the Dominican tradition; no particular occasion is recorded. Albert taught Aquinas and wrote on logic, botany, zoology, minerals and astronomy — he knew how readily intelligence supplies whatever it is asked for.",
    kind: "quote", tags: ["self-examination", "repentance", "Dominican", "humility"],
    source: "Attributed in Dominican tradition", author: "St. Albert the Great",
    authorNote: "attributed; not pinned to a specific work", year: "13th century",
    origin: "Dominican", liturgical: "", feastDay: "15 November", favorite: false,
    body:
      "Do not be surprised if those who make excuses for their sins\n" +
      "find plenty of them.",
    background:
      "A dry observation about supply and demand. Reasons are not scarce; " +
      "anyone looking for one will succeed, and the success proves nothing " +
      "except that they were looking.\n\n" +
      "Albert was the encyclopaedic mind of the thirteenth century — he " +
      "wrote on logic, botany, zoology, minerals, astronomy and theology, " +
      "and taught Aquinas — so he understood better than most how easily " +
      "intelligence supplies whatever it is asked for. That is the sting " +
      "here: the cleverer you are, the better your excuses will be, and the " +
      "less that fact means.",
  },
  {
    title: "The King's Good Servant, But God's First",
    occasion:
      "Said on the scaffold at Tower Hill on 6 July 1535, by a former Lord Chancellor convicted on perjured evidence about a private conversation, after years of refusing to attack the king's marriage or to swear to it.",
    kind: "quote", tags: ["courage", "faithfulness", "death", "justice"],
    source: "Scaffold on Tower Hill, 6 July 1535",
    author: "St. Thomas More", year: "1535", origin: "Lay martyr",
    liturgical: "", feastDay: "22 June", favorite: false,
    body:
      "I die the King's good servant,\n" +
      "and God's first.",
    background:
      "The last public sentence of a man who had been Lord Chancellor of " +
      "England, and it concedes as much as it refuses. He does not deny that " +
      "he owes Henry service, or claim the king has no authority; he insists " +
      "only on an order of precedence.\n\n" +
      "That is why the case has outlived its century. More had kept silent " +
      "for years rather than attack the marriage or the supremacy — his " +
      "defence was that silence implies consent in law — and he was convicted " +
      "on perjured testimony about a private conversation. What he would not " +
      "do was swear. The distinction between not attacking and not swearing " +
      "is the whole of his position.",
  },
  {
    title: "For the Faith of Christ's Church",
    occasion:
      "Said on the scaffold at Tower Hill on 22 June 1535 by the only English bishop who refused the oath — 65 years old, imprisoned fourteen months, and so weak he had to be carried part of the way.",
    kind: "quote", tags: ["courage", "faithfulness", "death", "faith"],
    source: "Scaffold on Tower Hill, 22 June 1535",
    author: "St. John Fisher", year: "1535", origin: "Bishop and martyr",
    liturgical: "", feastDay: "22 June", favorite: false,
    body:
      "I am come hither to die for the faith of Christ's Catholic Church,\n" +
      "and I thank God hitherto my courage hath served me well thereto.",
    background:
      "Fisher was the only English bishop who refused the oath — every other " +
      "member of the hierarchy submitted. He was 65, Bishop of Rochester, " +
      "Chancellor of Cambridge, and had been Henry's grandmother's confessor.\n\n" +
      "The second clause is the honest one and is usually dropped. He thanks " +
      "God that his courage has served him *hitherto* — up to now — with no " +
      "assumption that it will hold for the next quarter of an hour. He had " +
      "been in the Tower fourteen months and was so weak he had to be carried " +
      "part of the way. The Pope had made him a cardinal while he was " +
      "imprisoned; Henry said he would send the head to Rome for the hat.",
  },
  {
    title: "We Lepers",
    occasion:
      "The opening of a sermon at Kalaupapa in 1885. For eleven years he had begun 'my brethren' or 'you lepers'; that Sunday he said 'we', because he had contracted the disease. The congregation understood at once.",
    kind: "quote", tags: ["charity", "suffering", "solidarity", "poverty"],
    source: "Molokai, 1885 — the day he began preaching so",
    author: "St. Damian of Molokai", year: "1885", origin: "Congregation of the Sacred Hearts",
    liturgical: "", feastDay: "10 May", favorite: false,
    body: "We lepers…",
    background:
      "The whole of his life is in that change of pronoun. For " +
      "eleven years on the leper settlement at Kalaupapa he had begun his " +
      "sermons 'my brethren' or 'you lepers'. One Sunday in 1885 he opened " +
      "with 'we', because he had contracted the disease.\n\n" +
      "The congregation understood immediately what had been announced. He " +
      "had gone to Molokai as a volunteer for a colony the Hawaiian kingdom " +
      "had effectively abandoned, built coffins, dressed wounds and dug " +
      "graves, and had been criticised in his lifetime — including by a " +
      "Protestant minister after his death, which provoked one of Robert " +
      "Louis Stevenson's most ferocious essays in his defence. He died there " +
      "at 49.",
  },
  {
    title: "Choose the Child",
    occasion:
      "Said to her surgeons in 1962, in the second month of her fourth pregnancy, when a fibroma was found on her uterus. Gianna was a paediatrician and understood the options and the odds as well as they did.",
    kind: "quote", tags: ["family", "courage", "suffering", "charity"],
    source: "To her doctors during her fourth pregnancy, 1962",
    author: "St. Gianna Beretta Molla", year: "1962", origin: "Modern lay",
    liturgical: "", feastDay: "28 April", favorite: false,
    body:
      "If you must decide between me and the child,\n" +
      "do not hesitate: choose the child.\n" +
      "I insist on it. Save the baby.",
    background:
      "Said by a doctor about her own case, which is what gives it weight. " +
      "Gianna was a paediatrician; a fibroma was found on her uterus in the " +
      "second month of her fourth pregnancy, and she understood the options " +
      "and the odds as well as her surgeons did. She chose the operation " +
      "that preserved the pregnancy over the two that did not.\n\n" +
      "She delivered a healthy daughter and died of septic peritonitis a week " +
      "later, aged 39, leaving three other children. Her husband Pietro and " +
      "that daughter — herself now a doctor — were present at the " +
      "canonisation in 2004, which is thought to be the first time a husband " +
      "attended his wife's.",
  },
  {
    title: "What They Wrongly Believe",
    occasion:
      "Written in 1938 as the preface to a book of answers to objections, telling Catholics to stop treating opposition as malice.",
    kind: "quote", tags: ["catechetical", "faith", "charity", "conversion"],
    source: "Radio Replies, vol. 1 — preface", author: "Ven. Fulton J. Sheen",
    year: "1938", origin: "Modern papal teaching", liturgical: "", feastDay: "", favorite: false,
    body:
      "There are not more than a hundred people in the world\n" +
      "who truly hate the Catholic Church,\n" +
      "but there are millions who hate what they wrongly believe\n" +
      "the Catholic Church to be.",
    background:
      "The sentence is doing a specific job: it tells Catholics to stop treating " +
      "opposition as malice. If the number of genuine haters is that small, " +
      "then almost everyone arguing with you is arguing with a caricature — " +
      "and the appropriate response is explanation rather than defence.\n\n" +
      "It also, quietly, puts the burden on the Church's own side, since " +
      "somebody let the caricature stand. Sheen spent thirty years on radio " +
      "and television doing exactly that work, at one point outdrawing Milton " +
      "Berle in the same slot.",
  },
  {
    title: "Not of Obligation, But of Love",
    occasion:
      "From his 1980 autobiography, describing the daily hour before the Blessed Sacrament he kept for over sixty years from his ordination in 1919. He was found dead in his private chapel.",
    kind: "quote", tags: ["adoration", "eucharist", "prayer", "daily"],
    source: "Treasure in Clay: The Autobiography of Fulton J. Sheen",
    author: "Ven. Fulton J. Sheen", year: "1980", origin: "Modern papal teaching",
    liturgical: "Before the Blessed Sacrament", feastDay: "", favorite: false,
    body:
      "The Holy Hour.\n" +
      "Not a Holy Hour of obligation,\n" +
      "but a Holy Hour of love.",
    background:
      "He kept one every day for over sixty years, from his ordination in " +
      "1919 until his death, and attributed everything he did to it. The " +
      "distinction he draws is the entire argument: the moment it becomes a " +
      "duty performed, it has stopped being the thing he is describing.\n\n" +
      "He was found dead in his private chapel, before the Blessed Sacrament. " +
      "Asked once what he would want said of him, he said he hoped it would " +
      "be that he had made the Holy Hour — not that he had preached well.",
  },
  {
    title: "All or Nothing",
    occasion:
      "How a Derry teenager who had begun getting television work talked about vocation, and about the half-measures she thought were the real danger. She was killed at 33 in the 2016 Ecuador earthquake, teaching guitar to children.",
    kind: "quote", tags: ["vocation", "surrender", "youth", "zeal"],
    source: "Her own repeated phrase, in community sources and the documentary of the same name",
    author: "Servant of God Clare Crockett",
    authorNote: "her habitual phrase; cause of canonisation open",
    year: "2000s", origin: "Servant Sisters of the Home of the Mother",
    liturgical: "", feastDay: "", favorite: false,
    body: "All or nothing.",
    background:
      "She went on the retreat that changed everything mainly because she " +
      "thought it was a free holiday. Those who knew her describe someone " +
      "funny and loud who did not become quiet on entering.\n\n" +
      "The phrase was how she talked about vocation and about the half-" +
      "measures she thought were the real danger — not scandal, but a life " +
      "given at ninety per cent. She was killed at 33 in the 2016 Ecuador " +
      "earthquake, teaching guitar to children, when the school building " +
      "collapsed. Her cause was opened in 2024.",
  },
  // ── Saint quotes, batch 3 ──────────────────────────────────────────────
  {
    title: "My Highway to Heaven",
    occasion:
      "Said by a Milanese schoolboy who had built a website cataloguing reported Eucharistic miracles, and who went to Mass daily. He died of leukaemia at fifteen in 2006.",
    kind: "quote", tags: ["eucharist", "adoration", "communion", "youth"],
    source: "Widely reported by his family and in beatification material",
    author: "St. Carlo Acutis", authorNote: "universally reported; no single primary document located",
    year: "c. 2000s", origin: "Modern devotional", liturgical: "", feastDay: "12 October", favorite: false,
    body: "The Eucharist is my highway to heaven.",
    background:
      "The metaphor is his and it is of its time — a highway is the fast route, " +
      "the one you take when you are not interested in the scenic " +
      "alternative.\n\n" +
      "Resist the urge to make him quaint. He was an ordinary " +
      "Milanese teenager who played football and PlayStation and taught " +
      "himself to code. What is unusual is not the vocabulary but the " +
      "assumption underneath: that the shortest route somewhere is a thing " +
      "worth knowing, and that he had found it.",
  },
  {
    title: "Originals and Photocopies",
    occasion:
      "An adolescent's observation about the conformity he watched around him at school in Milan, from someone who limited himself to an hour of video games a week as a decision made in advance.",
    kind: "quote", tags: ["identity", "youth", "vocation", "conversion"],
    source: "Widely attributed; his best-known saying",
    author: "St. Carlo Acutis", authorNote: "attributed; reported by family and friends",
    year: "c. 2000s", origin: "Modern devotional", liturgical: "", feastDay: "12 October", favorite: false,
    body:
      "All people are born as originals,\n" +
      "but many die as photocopies.",
    background:
      "The video-game rule was not because games were wicked, but a decision " +
      "made in advance so that the default would not decide for him.\n\n" +
      "The image dates itself and that is part of its charm; a photocopy was " +
      "a familiar object in 2005 and is becoming a strange one. The point " +
      "survives the technology. Sanctity, in this reading, is not a mould you " +
      "are pressed into but the refusal of one.",
  },
  {
    title: "Verso l'Alto",
    occasion:
      "Written on the back of a photograph of himself climbing in the Alps, a few weeks before he died of polio in July 1925, aged 24 — probably caught from one of the poor of Turin he visited secretly.",
    kind: "quote", tags: ["courage", "perseverance", "youth", "Dominican"],
    source: "Written on the back of his last photograph, taken while climbing, 1925",
    author: "St. Pier Giorgio Frassati", year: "1925", origin: "Lay Dominican",
    liturgical: "", feastDay: "4 July", favorite: false,
    originalLanguage: "Italian",
    latinBody: "Verso l'alto.",
    body: "To the heights.",
    background:
      "He was dead within six days of catching polio — so quickly that his " +
      "own family, absorbed in his grandmother's simultaneous death, barely " +
      "noticed how ill he was.\n\n" +
      "The phrase works because he meant it about an actual mountain. " +
      "Frassati was a serious mountaineer, and the spiritual reading is the " +
      "second one, not a substitute for the first. His funeral filled the " +
      "streets of Turin with the city's poor, to the astonishment of a family " +
      "who had not known what he did with his time.",
  },
  {
    title: "Not Living, But Existing",
    occasion:
      "Written in letters to friends in Mussolini's Italy, where his Catholic student activism had become dangerous. He was once beaten by Blackshirts and refused to give his father's name to be released.",
    kind: "quote", tags: ["faith", "courage", "youth", "zeal"],
    source: "Letters", author: "St. Pier Giorgio Frassati", year: "1920s",
    origin: "Lay Dominican", liturgical: "", feastDay: "4 July", favorite: false,
    body:
      "To live without faith, without a heritage to defend,\n" +
      "without a steady struggle for truth —\n" +
      "that is not living, but existing.",
    background:
      "The author was a young man in Mussolini's Italy who was beaten by " +
      "Blackshirts at a demonstration and refused to give his father's name " +
      "to get himself released — his father owned and edited *La Stampa* and " +
      "the name would have worked.\n\n" +
      "'A heritage to defend' has a political edge that is easy to sand off. " +
      "He was an activist in the Catholic student movement at a moment when " +
      "that was becoming dangerous, and the struggle he means was a public " +
      "one with costs attached. The distinction between living and existing " +
      "is not about intensity of feeling; it is about whether anything you " +
      "hold would cost you something.",
  },
  {
    title: "May God Put Me There",
    occasion:
      "Answered under interrogation at Rouen on 24 February 1431. Her judges had asked whether she knew she was in God's grace — a question with no safe answer, since yes was presumption and no a confession against her voices. She was nineteen and could not read.",
    kind: "quote", tags: ["humility", "courage", "trust", "spiritual combat"],
    source: "Trial of Condemnation, Rouen, 24 February 1431 — court record",
    author: "St. Joan of Arc", year: "1431", origin: "Trial record",
    liturgical: "", feastDay: "30 May", favorite: false,
    body:
      "If I am not in God's grace, may God put me there;\n" +
      "and if I am, may God so keep me.",
    background:
      "This is the finest moment in the transcript, and it is a trap sprung " +
      "backwards. Her judges asked whether she knew she was in God's grace — " +
      "a question with no safe answer. Yes was presumption, the heresy they " +
      "were building a case for; no was a confession that her voices came " +
      "from elsewhere. One of the assessors afterwards said those present " +
      "were stupefied.\n\n" +
      "She was nineteen, could not read, and had no counsel. The answer is " +
      "not clever evasion; it is the only theologically exact reply " +
      "available, and she found it under interrogation by men who had spent " +
      "their lives in universities. She was burned three months later, and " +
      "the verdict annulled twenty-five years after that.",
  },
  {
    title: "I Was Born to Do This",
    occasion:
      "None — Joan's trial is one of the best-recorded events of the fifteenth century and this sentence is nowhere in it. It is a modern compression, popular in film.",
    kind: "quote", tags: ["courage", "misattribution", "vocation"],
    source: "Circulates as St. Joan of Arc; not in the trial record",
    author: "Unknown", authorNote: "attributed to Joan of Arc; absent from the primary sources",
    year: "modern", origin: "Modern devotional", liturgical: "", feastDay: "", favorite: false,
    body:
      "I am not afraid;\n" +
      "I was born to do this.",
    background:
      "Kept as a labelled specimen. Joan's trial is one of the best-recorded " +
      "events of the fifteenth century — hundreds of pages of her own words " +
      "under oath — and this sentence is not among them. It is a modern " +
      "compression, popular in films and on posters.\n\n" +
      "It is also out of character in a specific way. The record shows " +
      "someone who repeatedly admitted fear: of fire, of being handed to the " +
      "English, of what she could not answer. Her courage in the transcript " +
      "is not the absence of fear but the refusal to let it dictate her " +
      "answers. The invented line replaces something harder with something " +
      "easier.",
  },
  {
    title: "Nothing Is Far From God",
    occasion:
      "Said at Ostia in 387, when her sons were anxious that she would die away from home and not be buried beside her husband in North Africa.",
    kind: "quote", tags: ["trust", "death", "hope", "family"],
    source: "Her last days at Ostia — Confessions IX.11",
    author: "St. Monica", year: "387", origin: "Patristic",
    liturgical: "", feastDay: "27 August", favorite: false,
    body: "Nothing is far from God.",
    background:
      "It is a correction, gently delivered, of a real and reasonable fear about " +
      "geography.\n\n" +
      "Augustine records it because of how completely it reversed her. She " +
      "had spent years caring intensely about exactly such things; the woman " +
      "who followed her adult son across the Mediterranean to badger him " +
      "toward baptism had never been detached. She was let go of the last of " +
      "it a fortnight before she died.",
  },
  {
    title: "Remember Me at the Altar",
    occasion:
      "Her last request, made at Ostia a fortnight before she died in 387, discarding the burial place she had already prepared for herself in Africa.",
    kind: "quote", tags: ["death", "eucharist", "intercession", "family"],
    source: "Confessions IX.11", author: "St. Monica", year: "387",
    origin: "Patristic", liturgical: "", feastDay: "27 August", favorite: false,
    body:
      "Lay this body anywhere;\n" +
      "let not the care of it trouble you at all.\n" +
      "This only I ask:\n" +
      "that you will remember me at the altar of the Lord,\n" +
      "wherever you be.",
    background:
      "It is the earliest well-known statement of what Catholics do at a funeral " +
      "and afterwards: not tend a grave, but offer the Mass.\n\n" +
      "The force is in what she gives up. A Roman of her class cared a great " +
      "deal about burial and had already prepared a place; she is discarding " +
      "the one arrangement she had made for herself. And the request that " +
      "replaces it is portable — 'wherever you be' — which is exactly what " +
      "her son, who would never return to live in Africa, could actually " +
      "give her.",
  },
  {
    title: "Even Sweeping",
    occasion:
      "From the Dominican accounts of his life in Lima. Barred by the law of the time from full membership of the order because of his birth, Martin entered as a lay helper and did the kitchen, laundry and infirmary work for decades — the list in the sentence is his own timetable.",
    kind: "quote", tags: ["work", "humility", "Dominican", "charity", "daily"],
    source: "Attributed; from Dominican accounts of his life",
    author: "St. Martin de Porres", authorNote: "attributed; wording varies between sources",
    year: "17th century", origin: "Dominican", liturgical: "", feastDay: "3 November", favorite: false,
    body:
      "Everything, even sweeping, scraping vegetables,\n" +
      "weeding a garden and waiting on the sick,\n" +
      "could be a prayer, if it were offered to God.",
    background:
      "Martin swept for a living. The illegitimate son of a Spanish nobleman " +
      "and a freed Black woman in Lima, he was barred by the law of the time " +
      "from full membership of the Dominicans and entered as a lay helper, " +
      "calling himself the mulatto dog; he did the kitchen work, the " +
      "laundry, and the infirmary for decades.\n\n" +
      "That is why the list in the sentence is so specific and so " +
      "unglamorous — these are not illustrations he thought up, they are his " +
      "own timetable. The claim is not that humble work is a nice metaphor " +
      "for prayer, but that offering makes it prayer in fact, which is the " +
      "only reading that would have been any use to him.",
  },
  {
    title: "Some Definite Service",
    occasion:
      "Written privately in 1848, three years after a conversion that cost him Oxford, his fellowship, most of his friends and his standing in English public life — and while the Catholic authorities he had joined still regarded him with suspicion.",
    kind: "quote", tags: ["vocation", "trust", "identity", "hope"],
    source: "Meditations and Devotions — 'Meditations on Christian Doctrine'",
    author: "St. John Henry Newman", year: "1848", origin: "Oratorian",
    liturgical: "", feastDay: "9 October", favorite: true,
    body:
      "God has created me to do Him some definite service.\n" +
      "He has committed some work to me which He has not committed to another.\n" +
      "I have my mission.\n\n" +
      "I am a link in a chain, a bond of connexion between persons.\n" +
      "He has not created me for naught. I shall do good — I shall do His work.\n\n" +
      "Therefore I will trust Him.\n" +
      "Whatever, wherever I am, I can never be thrown away.",
    background:
      "Written privately, not for publication, by a man who had lost almost " +
      "everything visible. Newman's conversion in 1845 cost him Oxford, his " +
      "fellowship, most of his friends and his standing in English public " +
      "life; the Catholic authorities he had come over to were suspicious of " +
      "him for another twenty years.\n\n" +
      "'I can never be thrown away' is therefore not a comfortable sentence. " +
      "It is written by someone who had been, in every worldly sense, thrown " +
      "away, and who is arguing himself — not his reader — into believing " +
      "that the mission survives the wreckage of the career. The passage " +
      "continues by saying that if he is in sickness, perplexity or sorrow, " +
      "those too may be the service.",
  },
  {
    title: "To Live Is to Change",
    occasion:
      "From the Essay on the Development of Christian Doctrine, written in 1845 while he was becoming a Catholic. He stopped mid-revision to be received into the Church.",
    kind: "quote", tags: ["conversion", "perseverance", "faith"],
    source: "An Essay on the Development of Christian Doctrine, ch. 1",
    author: "St. John Henry Newman", year: "1845", origin: "Oratorian",
    liturgical: "", feastDay: "9 October", favorite: false,
    body:
      "In a higher world it is otherwise,\n" +
      "but here below to live is to change,\n" +
      "and to be perfect is to have changed often.",
    background:
      "The most quoted sentence Newman wrote, and almost always quoted " +
      "without its first clause — which changes it. He is not celebrating " +
      "change as such. He says that in a higher world it is *otherwise*: " +
      "changelessness is the perfection, and constant change is the mark of " +
      "creatures who are not there yet.\n\n" +
      "The book it comes from was written while he was becoming a Catholic, " +
      "and it is an argument that doctrine develops without being corrupted " +
      "— that a living thing keeps its identity precisely by changing, as an " +
      "adult is the same person as the child. He finished it, and stopped " +
      "mid-revision, to be received into the Church.",
  },
  {
    title: "Lead, Kindly Light",
    occasion:
      "Written in June 1833 in a becalmed orange boat between Palermo and Marseilles, after a near-fatal illness in Sicily. Newman was 32 and twelve years from becoming a Catholic; by his own account he did not know what he was being led toward.",
    kind: "hymn", tags: ["trust", "hope", "perseverance", "conversion"],
    source: "Written at sea off Sardinia, June 1833; set to Dykes's 'Lux Benigna'",
    author: "St. John Henry Newman", year: "1833", origin: "Oratorian",
    liturgical: "Sung widely; often at funerals", feastDay: "9 October", favorite: false,
    body:
      "Lead, kindly Light, amid the encircling gloom,\n" +
      "Lead Thou me on!\n" +
      "The night is dark, and I am far from home,\n" +
      "Lead Thou me on!\n" +
      "Keep Thou my feet; I do not ask to see\n" +
      "The distant scene; one step enough for me.\n\n" +
      "I was not ever thus, nor prayed that Thou\n" +
      "Shouldst lead me on;\n" +
      "I loved to choose and see my path; but now\n" +
      "Lead Thou me on!\n" +
      "I loved the garish day, and, spite of fears,\n" +
      "Pride ruled my will: remember not past years.\n\n" +
      "So long Thy power hath blest me, sure it still\n" +
      "Will lead me on\n" +
      "O'er moor and fen, o'er crag and torrent, till\n" +
      "The night is gone;\n" +
      "And with the morn those angel faces smile\n" +
      "Which I have loved long since, and lost awhile.",
    background:
      "Not knowing where he was being led is the whole argument of the second " +
      "verse: he had always preferred to see the route, and says so.\n\n" +
      "'One step enough for me' is the line people take away, and it is worth " +
      "noticing that he did not find it consoling at the time; he wrote it as " +
      "a surrender, not a comfort. Asked decades later what the angel faces " +
      "meant, he refused to explain, saying a poem has its own life and the " +
      "author is not its interpreter.",
  },
  {
    title: "Whoever Seeks Truth Seeks God",
    occasion:
      "Written in a letter of 1928 by a former atheist who had been Husserl's assistant, and who had read Teresa of Avila's autobiography in a single night and said at dawn: this is the truth.",
    kind: "quote", tags: ["faith", "Carmelite", "conversion", "contemplation"],
    source: "Letter to Sr. Adelgundis Jaegerschmid, 1928",
    author: "St. Teresa Benedicta of the Cross (Edith Stein)", year: "1928",
    origin: "Carmelite", liturgical: "", feastDay: "9 August", favorite: false,
    body:
      "Whoever seeks truth seeks God,\n" +
      "whether consciously or unconsciously.",
    background:
      "Written by someone with the standing to say it. Stein was a Jewish " +
      "philosopher, an atheist through her twenties, and Husserl's assistant " +
      "— she had done rigorous secular philosophy for years before reading " +
      "Teresa of Ávila's autobiography in a single night and saying, at dawn, " +
      "'this is the truth'.\n\n" +
      "The line therefore is not a claim that unbelievers are secretly " +
      "religious. It is a description of her own route: she did not abandon " +
      "the search for truth and take up faith instead: the search was " +
      "continuous, and she considered the destination to have been implied " +
      "in it from the start.",
  },
  {
    title: "We Are Going for Our People",
    occasion:
      "Said to her sister Rosa as the SS took them from the Carmel at Echt on 2 August 1942, in reprisal for the Dutch bishops' public protest against the deportation of Jews. Both were gassed at Auschwitz within the week.",
    kind: "quote", tags: ["suffering", "death", "courage", "Carmelite"],
    source: "To her sister Rosa, as the SS took them from Echt, 2 August 1942",
    author: "St. Teresa Benedicta of the Cross (Edith Stein)", year: "1942",
    origin: "Carmelite", liturgical: "", feastDay: "9 August", favorite: false,
    body: "Come, Rosa. We are going for our people.",
    background:
      "Said as she was arrested. The Dutch bishops had just read a public " +
      "protest against the deportation of Jews from the pulpit; the reprisal " +
      "was to seize Catholics of Jewish descent, who had until then been " +
      "exempt. She and her sister were taken from the Carmel at Echt and " +
      "gassed at Auschwitz within the week.\n\n" +
      "Everything is in 'our people'. She had been a Catholic for twenty " +
      "years and a Carmelite for nine, and was being arrested precisely " +
      "because the Church had spoken; she could have said 'their people' or " +
      "said nothing. She claims the Jewish people as hers on the way to " +
      "dying with them, and had written years earlier that she understood " +
      "her vocation as bearing the cross on their behalf.",
  },
  {
    title: "God Does Not Want It",
    occasion:
      "Said during an attempted rape at Nettuno on 5 July 1902, by an eleven-year-old girl to a twenty-year-old neighbour, who then stabbed her fourteen times.",
    kind: "quote", tags: ["purity", "chastity", "courage", "suffering"],
    source: "Reported at the canonisation process; Nettuno, 5 July 1902",
    author: "St. Maria Goretti", year: "1902", origin: "Modern devotional",
    liturgical: "", feastDay: "6 July", favorite: false,
    body:
      "No! It is a sin!\n" +
      "God does not want it!",
    background:
      "It matters what she is reported to have been resisting *for*.\n\n" +
      "It matters what she is reported to have been resisting *for*, because " +
      "the story is often told as though her own purity were the only thing " +
      "at stake. Witnesses record her saying it was a sin and that Alessandro " +
      "would go to hell — she was, in the moment, arguing about his soul. " +
      "That is a strange and specific thing for a frightened child to say, " +
      "and it is the reason the second half of the story was possible at all.",
  },
  {
    title: "I Want Him With Me in Heaven",
    occasion:
      "Said on her deathbed on 6 July 1902, before her attacker had shown any repentance. He remained unrepentant through his trial and for years in prison; he later confessed, and was present at her canonisation in 1950.",
    kind: "quote", tags: ["confession", "charity", "conversion", "repentance"],
    source: "Deathbed, 6 July 1902 — recorded in the canonisation process",
    author: "St. Maria Goretti", year: "1902", origin: "Modern devotional",
    liturgical: "", feastDay: "6 July", favorite: false,
    body:
      "I forgive Alessandro Serenelli,\n" +
      "and I want him with me in heaven for ever.",
    background:
      "Forgiveness offered before it was asked for, by a dying child, to a " +
      "man who at that point felt nothing. Alessandro was unrepentant " +
      "through his trial and for years in prison.\n\n" +
      "What followed is the part that keeps the story from being merely " +
      "affecting. He reported a dream in which she handed him lilies; he " +
      "confessed, served twenty-seven years, and on release went first to " +
      "her mother Assunta to beg forgiveness. Assunta said that if her " +
      "daughter had forgiven him she could not do otherwise, and the two of " +
      "them received communion side by side at midnight Mass. He lived out " +
      "his life as a lay brother in a Capuchin friary and was present, an old " +
      "man, at her canonisation in 1950.",
  },
  {
    title: "Death Rather Than Sin",
    occasion:
      "Chosen as one of four written resolutions by a boy of seven on the day of his first communion, and recorded by Don Bosco, who knew him. He died at fourteen.",
    kind: "quote", tags: ["purity", "youth", "Salesian", "courage"],
    source: "His motto, recorded by St. John Bosco in his life of the boy",
    author: "St. Dominic Savio", year: "c. 1855", origin: "Salesian spirituality",
    liturgical: "", feastDay: "6 May", favorite: false,
    body: "Death rather than sin.",
    background:
      "The motto is severe; the life it produced was mostly ordinary, which is " +
      "the argument.\n\n" +
      "Bosco, who knew him and wrote his life, is careful to record what " +
      "Savio's holiness actually consisted of, because the phrase invites " +
      "the wrong picture. He was not gloomy or extravagant; Bosco repeatedly " +
      "stopped him from excessive penances and told him that for a " +
      "schoolboy, sanctity meant cheerfulness and doing his duties well. The " +
      "motto is severe. The life it produced was mostly ordinary, which is " +
      "the argument.",
  },
  // ── Saint quotes, batch 2 ──────────────────────────────────────────────
  {
    title: "The Soul That Walks in Love",
    occasion:
      "From the Sayings of Light and Love, short maxims John wrote for the direction of individual souls in his care, c. 1585.",
    kind: "quote", tags: ["love", "perseverance", "Carmelite", "contemplation"],
    source: "Sayings of Light and Love", author: "St. John of the Cross",
    year: "c. 1585", origin: "Carmelite", liturgical: "", feastDay: "14 December", favorite: false,
    body: "The soul that walks in love neither rests nor grows tired.",
    background:
      "A claim about stamina, and a test you can apply to yourself. John is " +
      "distinguishing love from enthusiasm. Enthusiasm rests when it is tired " +
      "and stops when it is bored; love keeps moving without being exhausted " +
      "by the movement, because the moving is not a cost it is paying but the " +
      "thing it wants.\n\n" +
      "The practical use is diagnostic. If devotion has become something you " +
      "recover from, John's line suggests it is running on something other " +
      "than love — will, guilt, or the wish to be the sort of person who " +
      "prays.",
  },
  {
    title: "Then the Impossible",
    occasion:
      "None — no medieval source carries it, and its three-step build is the shape of modern motivational writing rather than thirteenth-century Italian spirituality.",
    kind: "quote", tags: ["perseverance", "misattribution", "Franciscan", "work"],
    source: "Circulates as St. Francis of Assisi; no early source",
    author: "Unknown", authorNote: "attributed to Francis; almost certainly modern",
    year: "20th century (probable)", origin: "Modern devotional",
    liturgical: "", feastDay: "", favorite: false,
    body:
      "Start by doing what is necessary,\n" +
      "then what is possible,\n" +
      "and suddenly you are doing the impossible.",
    background:
      "The register gives it away as much as the missing sources do.\n\n" +
      "Included because the advice is sound even though the label is wrong, " +
      "and because it is worth being able to tell the difference. It " +
      "describes how difficult things actually get done, and it is close " +
      "enough to Francis's practice — he began by repairing one small ruined " +
      "chapel with his hands — that the misattribution is understandable. " +
      "Understandable is not the same as true.",
  },
  {
    title: "Idleness Is the Enemy of the Soul",
    occasion:
      "The opening words of chapter 48 of the Rule, c. 530, introducing the hours of daily manual labour — Benedict's answer to the question of how a monk's day should be shaped.",
    kind: "quote", tags: ["work", "Benedictine", "daily", "perseverance"],
    source: "Rule of St. Benedict, ch. 48", author: "St. Benedict of Nursia",
    year: "c. 530", origin: "Benedictine", liturgical: "", feastDay: "11 July", favorite: false,
    body: "Idleness is the enemy of the soul.",
    background:
      "This is the reason a monastery has a timetable at all. Benedict is not " +
      "preaching productivity; the sentence continues 'and therefore the brethren " +
      "ought to be occupied at stated hours in manual labour, and again at " +
      "other hours in sacred reading.' The remedy for idleness is a *shape*, " +
      "not more effort.\n\n" +
      "What he means by idleness is closer to formlessness than to rest — the " +
      "same chapter is careful to build in sleep, meals and reading, and " +
      "elsewhere he insists the strong should not be crushed. A day with no " +
      "structure is the thing he considers dangerous, because it leaves you " +
      "at the mercy of whatever turns up.",
  },
  {
    title: "The Key to God's Heart",
    occasion:
      "Reported across compilations of his spiritual direction. Padre Pio spent much of his life hearing confessions, sometimes sixteen hours a day, which is the setting in which he thought about both resistance and an unlocked door at once.",
    kind: "quote", tags: ["prayer", "Capuchin", "spiritual combat"],
    source: "Widely reported across compilations of his sayings",
    author: "St. Padre Pio of Pietrelcina",
    authorNote: "consistently attributed; no single letter pinned",
    year: "20th century", origin: "Capuchin Franciscan", liturgical: "", feastDay: "23 September", favorite: false,
    body:
      "Prayer is the best weapon we have;\n" +
      "it is the key that opens the heart of God.",
    background:
      "Two metaphors that do not obviously belong together — a weapon and a " +
      "key — and the join is the point. Padre Pio took spiritual combat with " +
      "complete literalness, and would have meant 'weapon' without softening " +
      "it. But he immediately turns the image: what the weapon opens is not a " +
      "breach in an enemy but a heart that was already inclined to open.\n\n" +
      "He spent much of his life hearing confessions, sometimes for sixteen " +
      "hours a day, which is the context in which he thought about both " +
      "images at once: real resistance, and a door that is not actually " +
      "locked against you.",
  },
  {
    title: "Say the Rosary",
    occasion:
      "Said to the boys of the Oratory in Turin — many of them illiterate, most without families — which is why it is built as three questions with one answer a boy could remember without a book.",
    kind: "quote", tags: ["Marian", "rosary", "Salesian", "intercession"],
    seedVersion: 2,
    relatedSaints: ["mary"],
    source: "Widely reported in Salesian sources",
    author: "St. John Bosco", authorNote: "consistently attributed across Salesian tradition",
    year: "19th century", origin: "Salesian spirituality", liturgical: "", feastDay: "31 January", favorite: false,
    body:
      "Do you want Our Lady to help you? Say the Rosary.\n" +
      "Do you want Our Lady to love you? Say the Rosary.\n" +
      "Do you want Our Lady to protect you? Say the Rosary.",
    background:
      "Bosco spent his life among boys who had come off the streets of " +
      "industrial Turin — many illiterate, most with no family — and his " +
      "teaching is shaped by that audience: repetitive on purpose, and " +
      "always answerable with something you can do tonight. The rhetorical " +
      "shape here is deliberate, three questions with one answer, so that a " +
      "boy who remembers nothing else remembers the answer.\n\n" +
      "It is easy to mistake this for simplistic. It is better read as the " +
      "opposite of clericalism: a practice that needs no education, no money " +
      "and no permission, given to people who had none of the three.",
  },
  {
    title: "Cheerfulness Strengthens the Heart",
    occasion:
      "From the maxims collected by his Oratorian companions in sixteenth-century Rome, where Philip's insistence on cheerfulness in the middle of the Counter-Reformation struck many as unserious.",
    kind: "quote", tags: ["joy", "perseverance", "Oratorian"],
    source: "Maxims and Sayings", author: "St. Philip Neri",
    authorNote: "from the collected maxims", year: "16th century",
    origin: "Oratorian", liturgical: "", feastDay: "26 May", favorite: false,
    body:
      "Cheerfulness strengthens the heart\n" +
      "and makes us persevere in a good life.",
    background:
      "Philip Neri built an entire spirituality on this and was mocked for " +
      "it. He broke up excessive piety with jokes, sent the self-important on " +
      "absurd errands, and once received a distinguished visitor while having " +
      "half his beard shaved off. The sixteenth century, in the middle of the " +
      "Counter-Reformation, did not expect holiness to look like that.\n\n" +
      "The argument in the sentence is about *perseverance*, which is what " +
      "makes it more than temperament. Gloom is not merely unpleasant, in his " +
      "reading — it is unsustainable, and people quit. Cheerfulness is " +
      "presented as load-bearing.",
  },
  {
    title: "A Joyful Heart",
    occasion:
      "From the same collected maxims. Philip spent his life deliberately producing cheerfulness in others — breaking up excessive piety with jokes and absurd errands — rather than demanding it of them.",
    kind: "quote", tags: ["joy", "Oratorian", "perseverance"],
    source: "Maxims and Sayings", author: "St. Philip Neri", year: "16th century",
    origin: "Oratorian", liturgical: "", feastDay: "26 May", favorite: false,
    body:
      "A joyful heart is more easily made perfect\n" +
      "than a downcast one.",
    background:
      "Note that he does not say the joyful heart is already better. He says " +
      "it is easier to work with — the material is more workable, not the job " +
      "already done.\n\n" +
      "This matters for anyone who has treated their own sadness as a moral " +
      "failure. Philip is not adding that charge. He is making a claim about " +
      "what grace has an easier time getting hold of, which is why he spent " +
      "so much effort producing cheerfulness in others rather than demanding " +
      "it from them.",
  },
  {
    title: "Small Things With Great Love",
    occasion:
      "Said repeatedly, in varying words, to people who told her they admired her work and wished they could do something comparable. It is a refusal of the premise as much as an encouragement.",
    kind: "quote", tags: ["charity", "little way", "humility", "work"],
    source: "Widely attributed; her own phrasing varied across talks",
    author: "St. Teresa of Calcutta (Mother Teresa)",
    authorNote: "ubiquitous; she said versions of it often, no fixed text",
    year: "20th century", origin: "Missionaries of Charity",
    liturgical: "", feastDay: "5 September", favorite: false,
    body:
      "Not all of us can do great things.\n" +
      "But we can do small things with great love.",
    background:
      "Usually quoted as encouragement, and it is; it is also a refusal. She " +
      "declines the premise that what she did was great and what her hearer " +
      "does is small.\n\n" +
      "Her own work was almost entirely small things — washing, feeding, " +
      "sitting with the dying. What made it visible was volume and " +
      "consistency, not scale. The line describes her method rather than " +
      "consoling people for not having one.",
  },
  {
    title: "No Time to Love Them",
    occasion:
      "Said in talks and interviews to audiences who came expecting a message about charity and got an argument about where their attention was going.",
    kind: "quote", tags: ["charity", "humility", "love"],
    source: "Widely attributed", author: "St. Teresa of Calcutta (Mother Teresa)",
    authorNote: "very widely reported; no single primary text", year: "20th century",
    origin: "Missionaries of Charity", liturgical: "", feastDay: "5 September", favorite: false,
    body:
      "If you judge people,\n" +
      "you have no time to love them.",
    background:
      "The argument is from scarcity, not from niceness, and that is what " +
      "gives it teeth. She does not say judging is unkind or that you have no " +
      "right to. She says it consumes the hours — that assessment and love " +
      "draw on the same limited attention, and whichever you spend it on is " +
      "the one you will have done.\n\n" +
      "Put that way it is checkable. Anyone can look back on a day and see " +
      "which of the two they actually spent it on.",
  },
  {
    title: "Straw Scattered Here and There",
    occasion:
      "Preached to the people of Ars, a village that had largely stopped coming to church, arguing for prayer in common. Vianney was a farmer's son and nearly all his images come from things his parishioners handled daily.",
    kind: "quote", tags: ["prayer", "communion", "perseverance"],
    source: "Attributed in collections of his catechetical instructions",
    author: "St. John Vianney", authorNote: "widely attributed; wording varies by source",
    year: "19th century", origin: "Diocesan priest — patron of parish priests",
    liturgical: "", feastDay: "4 August", favorite: false,
    body:
      "Private prayer is like straw scattered here and there:\n" +
      "if you set it on fire it makes a lot of little flames.\n" +
      "But gather those straws into a bundle and light them,\n" +
      "and you get a mighty fire.",
    background:
      "An image from a man who had actually watched straw burn — Vianney was " +
      "a farmer's son, and nearly all his teaching runs on things his " +
      "parishioners handled daily. The point is about prayer in common, and " +
      "it is made without disparaging the alternative: scattered straw does " +
      "catch, and the little flames are real.\n\n" +
      "The claim is about concentration rather than quantity. The same amount " +
      "of material, bundled, behaves differently. He was arguing for people " +
      "coming to church together in a village that had largely stopped.",
  },
  {
    title: "He Who Prays Is Saved",
    occasion:
      "The thesis of The Great Means of Salvation (1759), written against Jansenism — which taught a God stingy with grace and salvation for the few. The severity is aimed at that, not at the reader.",
    kind: "quote", tags: ["prayer", "perseverance", "Redemptorist", "salvation"],
    source: "The Great Means of Salvation and of Perfection",
    author: "St. Alphonsus Liguori", year: "1759", origin: "Redemptorist",
    liturgical: "", feastDay: "1 August", favorite: false,
    body:
      "He who prays is certainly saved;\n" +
      "he who does not is certainly damned.",
    background:
      "The starkest sentence in this library, and Alphonsus meant it as " +
      "written — it is the thesis of an entire book, whose argument is that " +
      "prayer is not one devotional option among several but the ordinary " +
      "channel through which grace is asked for and given.\n\n" +
      "It should be read alongside what he was reacting to. Alphonsus spent " +
      "his life against Jansenism, which had taught a God stingy with grace " +
      "and a salvation for the few. His reply is that the door is open to " +
      "anyone who will ask — and that the only people outside it are those " +
      "who never asked. Severe in form, the sentence is arguing for a wider " +
      "mercy than the position it opposes, not a narrower one.",
  },
  {
    title: "A Resting Place",
    occasion:
      "From the Sermons on the Song of Songs, eighty-six talks given to his own monks at Clairvaux on the first two chapters of a love poem.",
    kind: "quote", tags: ["love", "friendship", "Cistercian", "charity"],
    source: "Sermons on the Song of Songs", author: "St. Bernard of Clairvaux",
    year: "12th century", origin: "Cistercian", liturgical: "", feastDay: "20 August", favorite: false,
    body:
      "We find rest in those we love,\n" +
      "and we provide a resting place in ourselves\n" +
      "for those who love us.",
    background:
      "Bernard's sermons on the Song of Songs run to eighty-six pieces on " +
      "the first two chapters of a love poem, and they are the reason the " +
      "affective, bridal language of later Western spirituality sounds the " +
      "way it does.\n\n" +
      "The second half is the demanding one. Being loved is usually thought " +
      "of as something that happens to you; Bernard makes it a task — you " +
      "have to *provide* the resting place, and it has to be somewhere " +
      "another person can actually put their weight down. That is a different " +
      "and harder thing than being fond of them.",
  },
  {
    title: "Good Intentions",
    occasion:
      "Unknown — the proverb circulated independently in the Middle Ages and cannot be located in any passage of Bernard's, though it travels under his name.",
    kind: "quote", tags: ["misattribution", "perseverance", "self-examination"],
    source: "Proverbial; attached to Bernard but older and anonymous",
    author: "Traditional",
    authorNote: "commonly credited to St. Bernard of Clairvaux; the proverb predates the attribution",
    year: "medieval", origin: "Proverbial", liturgical: "", feastDay: "", favorite: false,
    body: "Hell is full of good intentions or desires.",
    background:
      "Better known in its later form — the road to hell is paved with good " +
      "intentions — and routinely credited to Bernard, though the proverb " +
      "circulated independently and cannot be pinned to any passage of his.\n\n" +
      "Kept because the sharper original says something the paved-road " +
      "version has lost. 'Paved with' suggests good intentions are the " +
      "surface you travel on. 'Full of' says they are what is *there when " +
      "you arrive* — that intending well, indefinitely, is itself the " +
      "condition being described. It is the same disease Augustine names in " +
      "'but not yet'.",
  },
  {
    title: "I Want to Take His Place",
    occasion:
      "Said at Auschwitz in late July 1941. Ten men had been selected to die by starvation after an escape from Block 14; one of them, Franciszek Gajowniczek, cried out about his wife and children. Kolbe stepped out of the ranks to offer himself instead, and the commandant accepted.",
    kind: "quote", tags: ["charity", "suffering", "death", "Franciscan", "courage"],
    source: "Auschwitz, late July 1941 — reported by surviving prisoners",
    author: "St. Maximilian Kolbe", year: "1941", origin: "Conventual Franciscan",
    liturgical: "", feastDay: "14 August", favorite: false,
    body:
      "I am a Catholic priest.\n" +
      "I am old.\n" +
      "I want to take his place, because he has a wife and children.",
    background:
      "Stepping out of the ranks was itself a capital offence.\n\n" +
      "The reasoning is not romantic, and that is what makes it credible. He gives " +
      "three plain facts and one inference: he is a priest, he is old, the " +
      "other man is needed. He was 47. He survived two weeks in the " +
      "starvation bunker and was killed by injection on 14 August. " +
      "Gajowniczek lived to 93 and was present at the canonisation in 1982.",
  },
  {
    title: "No One Can Change Truth",
    occasion:
      "From his years running the largest Catholic publishing operation in Poland — a monastery-city at Niepokalanow with its own presses and a daily paper. The Gestapo shut it in 1941.",
    kind: "quote", tags: ["faith", "courage", "Franciscan", "spiritual combat"],
    source: "Attributed; widely circulated in Kolbe collections",
    author: "St. Maximilian Kolbe", authorNote: "attributed; primary source not pinned",
    year: "20th century", origin: "Conventual Franciscan", liturgical: "", feastDay: "14 August", favorite: false,
    body:
      "No one in the world can change Truth.\n" +
      "What we can do and should do is to seek truth and to serve it when we have found it.",
    background:
      "Kolbe ran the largest Catholic publishing operation in Poland before " +
      "the war — a monastery-city at Niepokalanów with its own printing " +
      "presses and a daily paper — so a sentence about seeking and serving " +
      "truth was, for him, a description of a working day rather than an " +
      "abstraction.\n\n" +
      "The second half is the operative one, and it is unfashionable: he does " +
      "not say seek truth and hold an opinion about it, but *serve* it, as " +
      "one serves something with a claim on you. The Gestapo shut the presses " +
      "in 1941.",
  },
  // ── Saint quotes, batch 1: top favourites ──────────────────────────────
  {
    title: "No Hands But Yours",
    occasion:
      "Nobody knows — which is the point. It cannot be placed in Teresa's life because it is not hers; the earliest traces are English and modern.",
    kind: "quote", tags: ["charity", "misattribution", "service"],
    source: "Circulates as St. Teresa of Ávila; not found in her works",
    author: "Unknown",
    authorNote: "universally printed as Teresa of Ávila — the attribution does not survive checking",
    year: "20th century (probable)", origin: "Modern devotional", liturgical: "", feastDay: "", favorite: false,
    body:
      "Christ has no body now but yours.\n" +
      "No hands, no feet on earth but yours.\n" +
      "Yours are the eyes through which He looks\n" +
      "with compassion on this world.",
    background:
      "Kept here deliberately as a specimen, because it is one of the most " +
      "quoted things Teresa never said. It appears in no edition of her works, " +
      "in no Spanish manuscript, and in nothing written in the three centuries " +
      "after her death; the earliest traces are English and modern, and one " +
      "line of descent runs through a Methodist hymnal rather than a Carmelite " +
      "convent.\n\n" +
      "That does not make it false. The thought is thoroughly scriptural — it " +
      "is St. Paul's body-of-Christ argument in 1 Corinthians 12, put warmly. " +
      "But there is a difference between a good line and a saint's authority, " +
      "and the borrowed name is doing work the words could do on their own. " +
      "Quote it if you love it; just do not tell anyone Teresa wrote it.",
  },
  {
    title: "Not to Think Much But to Love Much",
    occasion:
      "Written c. 1577 for the nuns of her own reform, who were anxious that their distracted prayer meant they were failing at it. Teresa had herself found prayer dry and difficult for nearly twenty years before this.",
    kind: "quote", tags: ["contemplation", "love", "Carmelite", "little way"],
    source: "Interior Castle, Fourth Mansions, ch. 1",
    author: "St. Teresa of Ávila", year: "1577", origin: "Carmelite",
    liturgical: "", feastDay: "15 October", favorite: false,
    body:
      "The important thing is not to think much but to love much;\n" +
      "and so do that which best stirs you to love.",
    background:
      "Her point is practical to the edge of bluntness: prayer is not an exam in " +
      "concentration. If your mind wanders through the whole half-hour and you " +
      "come away loving God more, the half-hour worked.\n\n" +
      "The sting is in the last clause — 'do that which best stirs you to " +
      "love'. It hands the responsibility back. She will not tell you which " +
      "method to use, because the test is not whether the method is " +
      "impressive but whether it moves you, and only you can see that.",
  },
  {
    title: "Judged on Love Alone",
    occasion:
      "Written for the friars and nuns of the Discalced reform, who had given up everything measurable — property, family, reputation — and needed telling what would actually be counted. John had recently been imprisoned by his own brothers in religion for pursuing that reform.",
    kind: "quote", tags: ["love", "death", "Carmelite", "contemplation"],
    source: "Sayings of Light and Love, 57",
    author: "St. John of the Cross", year: "c. 1585", origin: "Carmelite",
    liturgical: "", feastDay: "14 December", favorite: false,
    body: "In the evening of life, we will be judged on love alone.",
    background:
      "Often read as consoling, and it is — but notice what it removes as " +
      "well as what it promises. John is writing to people who had given up " +
      "everything measurable: property, family, comfort, reputation. The line " +
      "tells them none of that will be counted. Not the austerity, not the " +
      "years, not the visions he himself was famous for.\n\n" +
      "He wrote it as a man who had been imprisoned by his own brothers in " +
      "religion, in a cell too small to stand up in, for trying to reform " +
      "them. 'Love alone' from someone in comfortable circumstances is a " +
      "pleasant sentiment. From him it is a verdict he had already accepted " +
      "about his own jailers.",
  },
  {
    title: "Where There Is No Love, Put Love",
    occasion:
      "Written on 6 July 1591 to Madre María de la Encarnación, who was distressed that John had just been stripped of office and might be expelled from the order he helped found. This is his instruction on how to treat the men doing it. He died five months later.",
    kind: "quote", tags: ["love", "charity", "Carmelite", "conversion"],
    source: "Letter to Madre María de la Encarnación, 6 July 1591",
    author: "St. John of the Cross", year: "1591", origin: "Carmelite",
    liturgical: "", feastDay: "14 December", favorite: false,
    body:
      "Where there is no love, put love —\n" +
      "and you will draw out love.",
    background:
      "Advice given in a specific and unpleasant situation. John had just " +
      "been stripped of office by the order he had helped found, and there " +
      "was talk of expelling him altogether; the nun he was writing to was " +
      "distressed on his behalf. This is his answer about how to treat the " +
      "men doing it.\n\n" +
      "The verb matters. He does not say *find* love, or *feel* it — he says " +
      "*put* it, as you would put a thing into an empty place. It is an " +
      "instruction for exactly the case where the love is not there and will " +
      "not arrive by waiting. He died five months later, in a monastery whose " +
      "prior disliked him.",
  },
  {
    title: "My Vocation Is Love",
    occasion:
      "Written in September 1896 for her sister Marie, who had asked her to put down her 'little doctrine'. Thérèse was 23, already ill, and had been tormented by wanting to be missionary, priest, martyr and doctor at once while knowing she would be none of them.",
    kind: "quote", tags: ["love", "little way", "vocation", "Carmelite"],
    source: "Story of a Soul, Manuscript B — written for her sister Marie",
    author: "St. Thérèse of Lisieux", year: "1896", origin: "Carmelite",
    liturgical: "", feastDay: "1 October", favorite: true,
    body:
      "In the heart of the Church, my Mother,\n" +
      "I will be love.\n" +
      "Then I shall be all things.",
    background:
      "The end of a search, not a slogan. Thérèse had been tormented by " +
      "wanting to be everything at once — missionary, priest, martyr, doctor " +
      "of the Church — and knowing a Carmelite in a small French town would " +
      "be none of them. Reading 1 Corinthians 12 and 13 she saw the way out: " +
      "the body has many members, but love is what animates all of them, so " +
      "to be love is to be present in every vocation at once.\n\n" +
      "She was twenty-three and had roughly a year to live. Every one of the " +
      "things she wanted was later granted to her posthumously — patroness of " +
      "the missions, Doctor of the Church — which is either a very large " +
      "coincidence or the point.",
  },
  {
    title: "All I Have Written Seems as Straw",
    occasion:
      "Said in December 1273 to his secretary Br. Reginald of Piperno, who had pressed him for weeks to explain why he had stopped writing mid-sentence. Something had happened at Mass on 6 December that Thomas would not describe. He died three months later.",
    kind: "quote", tags: ["humility", "contemplation", "Dominican", "adoration"],
    source: "To Br. Reginald of Piperno, Naples, December 1273",
    author: "St. Thomas Aquinas, O.P.", year: "1273", origin: "Dominican",
    liturgical: "", feastDay: "28 January", favorite: false,
    body:
      "Such things have been revealed to me\n" +
      "that all I have written seems to me as so much straw.",
    background:
      "The most learned man of the Middle Ages stopped writing mid-sentence " +
      "and never wrote again. On 6 December 1273, while saying Mass at Naples, " +
      "something happened that he would not describe. His secretary Reginald, " +
      "who had worked with him for years and now had an unfinished *Summa* on " +
      "his hands, pressed him for weeks. This was the only answer he got.\n\n" +
      "Read carefully, it is not a repudiation. Straw is not worthless — it " +
      "is what you use to get through winter, and it is what was in the manger. " +
      "It is simply not the harvest. Aquinas had spent his life arguing that " +
      "reason genuinely reaches God; he seems to have been given, briefly, the " +
      "thing his arguments pointed at, and found the proportion between them " +
      "was not what he had assumed. He died three months later, aged 49.",
  },
  {
    title: "No Explanation Is Necessary",
    occasion:
      "No occasion — it is not his. Its earliest appearance is as an epigraph in Franz Werfel's 1941 novel The Song of Bernadette, in the novelist's own voice.",
    kind: "quote", tags: ["faith", "misattribution", "catechetical"],
    source: "Circulates as Aquinas; not located in his works",
    author: "Unknown",
    authorNote: "printed everywhere as Thomas Aquinas; almost certainly 20th-century",
    year: "20th century (probable)", origin: "Modern devotional",
    liturgical: "", feastDay: "", favorite: false,
    body:
      "To one who has faith, no explanation is necessary.\n" +
      "To one without faith, no explanation is possible.",
    background:
      "Neat, memorable, and not his. It appears in no work of Aquinas and in " +
      "no medieval source; its earliest traces are 20th-century, and the " +
      "usual route into circulation is Franz Werfel's 1941 novel *The Song of " +
      "Bernadette*, which opens with almost exactly this sentence as an " +
      "epigraph in the author's own voice.\n\n" +
      "It also, awkwardly, contradicts him. Aquinas spent his " +
      "working life writing explanations *for* people who did not accept his " +
      "premises — the whole method of the *Summa* is to state the strongest " +
      "objection first and answer it. A man who thought explanation was " +
      "impossible would not have written four million words of it. Kept here " +
      "as a labelled specimen, because it is repeated in good faith constantly.",
  },
  {
    title: "But Not Yet",
    occasion:
      "A prayer Augustine had actually prayed as a young man in Carthage, recorded against himself some fifteen years later in the Confessions (c. 397-400) as an example of a will divided against itself.",
    kind: "quote", tags: ["conversion", "chastity", "self-examination", "repentance"],
    source: "Confessions VIII.7",
    author: "St. Augustine of Hippo", year: "c. 397–400", origin: "Patristic",
    liturgical: "", feastDay: "28 August", favorite: false,
    body:
      "Grant me chastity and continence,\n" +
      "but not yet.",
    background:
      "This is not advice, and it is not a joke Augustine is making at " +
      "anyone else's expense. It is a confession, written down years later " +
      "against himself, of a prayer he had actually prayed as a young man in " +
      "Carthage — and he records it precisely because it is contemptible. He " +
      "adds immediately: 'I was afraid you would hear me too soon, and heal " +
      "me too soon of the disease of lust, which I wished to have satisfied " +
      "rather than extinguished.'\n\n" +
      "Quoted on its own it becomes a wink — the saint who liked sin, isn't " +
      "that relatable. In place it is something far more uncomfortable and " +
      "far more useful: an exact description of a will that is genuinely " +
      "divided, that wants the good and schedules it for later, and that " +
      "knows the scheduling is the evasion. Anyone who has ever meant to " +
      "change on Monday has prayed this prayer. Augustine's contribution is " +
      "to have written it down instead of pretending otherwise.",
  },
  {
    title: "Use Words If Necessary",
    occasion:
      "None — it is not his. Francis preached in the open air in up to five towns a day and walked into a Sultan's camp to preach; the saying first appears in print in the 1990s.",
    kind: "quote", tags: ["misattribution", "preaching", "Franciscan", "charity"],
    source: "Circulates as St. Francis of Assisi; absent from every early source",
    author: "Unknown",
    authorNote: "not in Francis's writings or any early biography — see background",
    year: "20th century", origin: "Modern devotional",
    liturgical: "", feastDay: "", favorite: false,
    body:
      "Preach the Gospel at all times;\n" +
      "when necessary, use words.",
    background:
      "Absent from Francis's own writings, from Celano, from Bonaventure, " +
      "from the *Fioretti* — from everything before the twentieth century. " +
      "The earliest printed versions appear in the 1990s.\n\n" +
      "The reason to keep it here is that it is not merely unsourced but " +
      "backwards. Francis preached constantly, in the open air, in up to five " +
      "towns a day; he walked into a Sultan's camp during a crusade in order " +
      "to preach; his Rule legislates for preaching. The one thing he cannot " +
      "be made into is a man who thought words optional. What the saying " +
      "actually smuggles in is a modern discomfort with saying anything out " +
      "loud — dressed in the habit of the most talkative saint in the " +
      "calendar. It flatters the reticence it should be curing.",
  },
  {
    title: "That You Are and Nothing More",
    occasion:
      "Written in the 1220s for his own friars, in a short chapter of the Admonitions aimed at the servant of God who is praised and begins to believe it.",
    kind: "quote", tags: ["humility", "Franciscan", "self-examination", "identity"],
    source: "Admonitions, XIX",
    author: "St. Francis of Assisi", year: "c. 1220s", origin: "Franciscan",
    liturgical: "", feastDay: "4 October", favorite: false,
    body:
      "What a man is before God,\n" +
      "that he is and nothing more.",
    background:
      "Authentic, and much harder than the famous line he did not write. " +
      "The *Admonitions* are short chapters given to his own friars, and this " +
      "one is aimed at the servant of God who is praised and starts to believe " +
      "it — Francis's next sentence is that such a man 'sets a value on " +
      "himself greater than the value God sets'.\n\n" +
      "It cuts in both directions, which is why it lasts. It removes the " +
      "inflation of being admired, and it removes just as firmly the deflation " +
      "of being despised or of despising yourself. Your reputation, including " +
      "the one you hold privately about yourself, is not the measurement. " +
      "Someone else has already taken it.",
  },
  {
    title: "When We Pray, When We Read",
    occasion:
      "Jerome wrote to Eustochium in 384, urging a young Roman noblewoman toward the ascetic life — 'You pray: you speak to the Bridegroom. You read: he speaks to you.' The smoothed wording everyone quotes is St. Alphonsus Liguori's paraphrase, made some fourteen centuries later.",
    kind: "quote",
    tags: ["contemplation", "Scripture", "reading", "biblical", "Patristic"],
    source: "St. Alphonsus Liguori's paraphrase of St. Jerome, Letter 22 (to Eustochium), 25",
    author: "St. Jerome",
    authorNote: "this familiar wording is St. Alphonsus Liguori's paraphrase — Jerome's own is in the background",
    year: "384 (Jerome) / 18th century (this wording)",
    origin: "Patristic",
    liturgical: "",
    feastDay: "30 September — St. Jerome",
    originalLanguage: "",
    favorite: false,
    body: "When we pray, we speak to God; but when we read, God speaks to us.",
    background:
      "Almost always seen over Jerome's name, and the thought is genuinely " +
      "his — but the sentence is not. What Jerome wrote to Eustochium in 384 " +
      "was terser and more intimate: 'Oras: loqueris ad sponsum; legis: ille " +
      "tibi loquitur' — 'You pray: you speak to the Bridegroom. You read: he " +
      "speaks to you.' The smoothed-out version everyone quotes comes from " +
      "St. Alphonsus Liguori, who paraphrased it in his treatise on spiritual " +
      "reading; from there it passed into common use with Jerome's name still " +
      "attached.\n\n" +
      "Worth keeping both. Liguori's is the more quotable, but Jerome's says " +
      "something the paraphrase loses: the one you are reading is not a " +
      "distant God issuing instructions, but the Bridegroom — and reading is " +
      "not study, it is being spoken to by someone who loves you.",
  },
  {
    title: "The Devil Can Imitate Everything",
    occasion:
      "Recorded among the sayings of the Egyptian desert monks, attributed to 'the fathers' collectively rather than to any one of them. It circulates widely under St. Moses the Black's name; that attribution is modern and unsupported.",
    kind: "quote",
    tags: ["humility", "spiritual combat", "fasting", "desert fathers", "Patristic", "charity"],
    source: "Apophthegmata Patrum, Systematic Collection 17.32 (trans. John Wortley)",
    author: "The Desert Fathers",
    authorNote: "circulates widely under St. Moses the Black's name; that attribution is modern and unsupported",
    year: "4th–5th century",
    origin: "Patristic",
    liturgical: "",
    feastDay: "28 August — St. Moses the Black",
    originalLanguage: "",
    favorite: false,
    body:
      "The devil can imitate everything. As for fasting, he never ate; as for " +
      "watching, he never slept. But humble-mindedness and love he cannot imitate.",
    background:
      "The version doing the rounds online reads: 'You fast, but Satan does " +
      "not eat. You labour fervently, but Satan never sleeps. The only " +
      "dimension with which you can outperform Satan is by acquiring " +
      "humility, for Satan has no humility' — always over St. Moses the " +
      "Black's name. The saying is authentic desert material; the attribution " +
      "is not. It sits in the Systematic Collection of the Sayings of the " +
      "Desert Fathers under 'the fathers' collectively, with Coptic sources " +
      "giving it to St. Macarius the Great. Nothing links it to Moses.\n\n" +
      "The argument is bracing and holds either way. Every ascetic feat you " +
      "can manage, the devil already outdoes without effort — he has never " +
      "once eaten or slept. So austerity proves nothing by itself. Only two " +
      "things are beyond him, and the older text names both: humility and " +
      "love. The popular rewrite drops love, which is a real loss.\n\n" +
      "St. Moses the Black is worth knowing regardless — an Ethiopian slave " +
      "turned bandit leader turned monk of Scetis, who when called to judge a " +
      "brother's fault arrived carrying a leaking basket of sand and said, " +
      "'My sins run out behind me and I do not see them, and today I come to " +
      "judge another.' That story is his.",
  },
  {
    // Seven parts, one per member — the numbered body drives the reader's
    // one-at-a-time navigation, same mechanism as the hourly prayers.
    title: "Rhythmica Oratio — the Members of the Crucified Christ",
    kind: "prayer",
    seedVersion: 2,
    tags: ["contemplation", "Passion", "Lent", "Cistercian", "suffering", "love"],
    source: "Salve mundi salutare — a seven-part meditation, one on each member of the crucified Christ",
    author: "Arnulf of Leuven, O.Cist.",
    authorNote: "long attributed to St. Bernard of Clairvaux; the attribution does not hold — see background",
    related: ["The Five Wounds"],
    year: "c. 1250",
    origin: "Cistercian",
    liturgical: "Lent and Holy Week; Fridays",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: false,
    body:
      "1. To the feet\n" +
      "Latin: Ad pedes — Salve mundi salutare\n" +
      "English: To the feet — Hail, salvation of the world\n" +
      "The meditation begins at the lowest point, at the nailed feet — the " +
      "place of a penitent, where Magdalene knelt.\n\n" +
      "2. To the knees\n" +
      "Latin: Ad genua — Salve, salve rex sanctorum\n" +
      "English: To the knees — Hail, hail, King of saints\n" +
      "The knees that buckled under the cross, addressed as a king's.\n\n" +
      "3. To the hands\n" +
      "Latin: Ad manus — Salve, salve Iesu bone\n" +
      "English: To the hands — Hail, hail, good Jesus\n" +
      "The hands that healed and blessed, now fixed open.\n\n" +
      "4. To the side\n" +
      "Latin: Ad latus — Salve, salve summe bonus\n" +
      "English: To the side — Hail, hail, highest good\n" +
      "The opened side, from which came blood and water.\n\n" +
      "5. To the breast\n" +
      "Latin: Ad pectus — Salve mea salus Deus\n" +
      "English: To the breast — Hail, my salvation, O God\n" +
      "The breast John leaned on at the Supper.\n\n" +
      "6. To the heart\n" +
      "Latin: Ad cor — Salve regis cor aveto\n" +
      "English: To the heart — Hail, heart of the King, I greet you\n" +
      "The heart itself — the section that most shaped later devotion to the " +
      "Sacred Heart.\n\n" +
      "7. To the face\n" +
      "Latin: Ad faciem — Salve caput cruentatum\n" +
      "English: To the face — Hail, bleeding head\n" +
      "The last and best known: through Paul Gerhardt's German version this " +
      "became the hymn “O Sacred Head, Now Wounded”.",
    background:
      "This entry gives the structure and the opening line of each of " +
      "the seven parts, not the whole poem — the Rhythmica oratio runs to " +
      "roughly 350 lines, seven hymns of ten-line stanzas, and would swamp " +
      "this library. Each part addresses one member of the crucified body in " +
      "turn, working upward from the feet to the face, so that the prayer is " +
      "a slow approach rather than a single act of attention.\n\n" +
      "It is very widely printed as St. Bernard's, and that is almost " +
      "certainly wrong. The author was Arnulf of Leuven, a Cistercian who was " +
      "abbot of Villers in Brabant and died around 1250 — a century after " +
      "Bernard. The oldest manuscript naming Arnulf dates to 1320; the " +
      "attribution to Bernard appears only from the late 14th century, some " +
      "two hundred years after his death, and seems to have arisen because " +
      "the poem's affective, bridal register sounds so much like Bernard's " +
      "sermons on the Song of Songs. Same school, different man.\n\n" +
      "Dieterich Buxtehude set all seven parts as the cantata cycle Membra " +
      "Jesu Nostri in 1680, which is how most people meet it now.",
  },
  {
    title: "Prayer to St. Michael the Archangel",
    kind: "prayer",
    tags: ["protection", "exorcism", "guardian angel", "courage"],
    source: "Composed by Pope Leo XIII; long said at the end of Low Mass",
    author: "Pope Leo XIII",
    year: "1886",
    origin: "Papal",
    liturgical: "Formerly among the Leonine Prayers after Low Mass",
    feastDay: "29 September — Ss. Michael, Gabriel and Raphael",
    favorite: false,
    originalLanguage: "Latin",
    latinBody:
      "Sancte Michael Archangele,\n" +
      "defende nos in proelio;\n" +
      "contra nequitiam et insidias diaboli esto praesidium.\n" +
      "Imperet illi Deus, supplices deprecamur:\n" +
      "tuque, Princeps militiae caelestis,\n" +
      "Satanam aliosque spiritus malignos,\n" +
      "qui ad perditionem animarum pervagantur in mundo,\n" +
      "divina virtute in infernum detrude. Amen.",
    body:
      "Saint Michael the Archangel,\n" +
      "defend us in battle.\n" +
      "Be our protection against the wickedness and snares of the devil.\n" +
      "May God rebuke him, we humbly pray;\n" +
      "and do thou, O Prince of the heavenly host,\n" +
      "by the power of God,\n" +
      "cast into hell Satan and all the evil spirits\n" +
      "who prowl about the world seeking the ruin of souls.\n\n" +
      "Amen.",
    background:
      "Composed by Pope Leo XIII and published in 1886, as part of a set of " +
      "prayers he ordered said after every Low Mass — the Leonine Prayers. A " +
      "much-repeated story has Leo writing it after a terrifying vision " +
      "following Mass; the story is late and not documented in his lifetime, " +
      "so treat it as pious legend rather than history. The prayer itself is " +
      "not legendary: it is a short, sober plea for protection, and it names " +
      "the enemy plainly. The Leonine Prayers were discontinued in 1964, but " +
      "the prayer never fell out of use, and it has been widely revived — " +
      "St. John Paul II encouraged it again in 1994.",
  },
  {
    // The body is a numbered sequence; the reader detects that and offers
    // one-at-a-time navigation over it. See splitNumberedParts().
    title: "Hourly Prayers of St. John Chrysostom",
    kind: "prayer",
    tags: ["hourly", "contemplation", "daily", "arrow prayers", "Patristic", "repentance"],
    source: "Twenty-four short prayers, one for each hour of the day",
    author: "St. John Chrysostom",
    authorNote: "traditional attribution; the collection is later than his lifetime",
    year: "traditional",
    origin: "Patristic",
    liturgical: "One for each hour, day and night",
    feastDay: "13 September — St. John Chrysostom",
    favorite: false,
    body:
      "1. O Lord, of Thy heavenly bounties, deprive me not.\n\n" +
      "2. O Lord, deliver me from the eternal torments.\n\n" +
      "3. O Lord, forgive me if I have sinned in my mind or my thought, whether in word or in deed.\n\n" +
      "4. O Lord, free me from all ignorance and forgetfulness, from despondency and stony insensibility.\n\n" +
      "5. O Lord, deliver me from every temptation.\n\n" +
      "6. O Lord, enlighten my heart which evil desires have darkened.\n\n" +
      "7. O Lord, as a man have I sinned, have Thou mercy on me, as the God full of compassion, seeing the feebleness of my soul.\n\n" +
      "8. O Lord, send down Thy grace to help me, that I may glorify Thy name.\n\n" +
      "9. O Lord Jesus Christ, write me down in the book of life and grant unto me a good end.\n\n" +
      "10. O Lord my God, even if I had not done anything good before Thee, do Thou help me, in Thy grace, to make a good beginning.\n\n" +
      "11. O Lord, sprinkle into my heart the dew of Thy grace.\n\n" +
      "12. O Lord of heaven and earth, remember me, Thy sinful servant, full of shame and impurity, in Thy kingdom. Amen.\n\n" +
      "13. O Lord, receive me in penitence.\n\n" +
      "14. O Lord, forsake me not.\n\n" +
      "15. O Lord, lead me not into misfortune.\n\n" +
      "16. O Lord, quicken in me a good thought.\n\n" +
      "17. O Lord, give me tears and remembrance of death, and contrition.\n\n" +
      "18. O Lord, make me solicitous of confessing my sins.\n\n" +
      "19. O Lord, give me humility, chastity, and obedience.\n\n" +
      "20. O Lord, give me patience, magnanimity, and meekness.\n\n" +
      "21. O Lord, implant in me the root of all good — Thy fear in my heart.\n\n" +
      "22. O Lord, vouchsafe that I may love Thee with all my soul and mind, and in everything do Thy will.\n\n" +
      "23. O Lord, shelter me from certain men, from demons and passions, and from any other unbecoming thing.\n\n" +
      "24. O Lord, Thou knowest that Thou dost as Thou wilt, let then Thy will be done in me, a sinner, for blessed art Thou unto the ages. Amen.",
    background:
      "Twenty-four deliberately tiny prayers, one for each hour — the classic " +
      "form of what the Fathers called the arrow prayer: short enough to be " +
      "remembered without a book, and short enough to be meant whole-" +
      "heartedly rather than merely recited. They fall into two sets of " +
      "twelve, for the hours of the day and the hours of the night.\n\n" +
      "A note on the clock: this app pairs prayer 1 with midnight and runs " +
      "through to prayer 24 at 11 pm, and shows you whichever one the hour " +
      "belongs to. That pairing is this app's convention, not the " +
      "tradition's — the sources number the prayers and say they cover the " +
      "hours, but do not fix them to particular clock times. Read them in " +
      "whatever order the day actually gives you.\n\n" +
      "The attribution to St. John Chrysostom is traditional rather than " +
      "established — the collection as we have it is later than his lifetime, " +
      "and the English text circulates in several translations, so wording " +
      "varies between sources. What is genuinely his is the underlying " +
      "conviction, which he preached often: that prayer does not require a " +
      "church, a posture, or a long stretch of free time, and that a line shot " +
      "up in the middle of ordinary work is real prayer.",
  },
  {
    // Kept as one entry rather than two: they are a single practice, and you
    // want the closing prayer already in front of you when the half-hour ends.
    title: "Preces for Mental Prayer",
    kind: "prayer",
    tags: [
      "contemplation", "preparation", "thanksgiving", "Opus Dei",
      "before prayer", "after prayer",
    ],
    source: "Said at the start and close of the daily half-hour of mental prayer",
    author: "Traditional — Opus Dei",
    year: "20th century",
    origin: "Opus Dei",
    liturgical: "Before and after mental prayer",
    feastDay: "",
    favorite: false,
    body:
      "— Before —\n\n" +
      "My Lord and my God,\n" +
      "I firmly believe that you are here,\n" +
      "that you see me,\n" +
      "that you hear me.\n\n" +
      "I adore you with profound reverence.\n" +
      "I ask your pardon for my sins\n" +
      "and grace to make this time of prayer fruitful.\n\n" +
      "My Immaculate Mother,\n" +
      "Saint Joseph, my father and lord,\n" +
      "my guardian angel,\n" +
      "intercede for me.\n\n" +
      "— After —\n\n" +
      "I thank you, my God,\n" +
      "for the good resolutions, affections and inspirations\n" +
      "that you have communicated to me during this meditation.\n\n" +
      "I ask your help to put them into effect.\n\n" +
      "My Immaculate Mother,\n" +
      "Saint Joseph, my father and lord,\n" +
      "my guardian angel,\n" +
      "intercede for me.",
    background:
      "The two short prayers that open and close the daily half-hour of mental " +
      "prayer in Opus Dei. The first answers the question you actually face " +
      "when you sit down — not what to say, but who you are speaking to. It " +
      "settles that first (you are here, you see me, you hear me) and only " +
      "then asks pardon and fruitfulness. The second assumes the meditation " +
      "gave you something, and that it was communicated rather than produced, " +
      "which is why its first word is thanks; the harder request follows, not " +
      "for more light but for help to act on the light already given. Both end " +
      "with the same three intercessors — Our Lady, St. Joseph, the guardian " +
      "angel — so the half-hour opens and shuts in the same company.",
  },
  {
    title: "Nicene Creed",
    kind: "prayer",
    tags: ["creed", "foundational", "Trinity", "Mass"],
    source: "The Profession of Faith of the Mass on Sundays and solemnities",
    author: "First Council of Nicaea (325) and First Council of Constantinople (381)",
    year: "325 / 381",
    origin: "Conciliar",
    liturgical: "Sundays and solemnities, after the homily",
    feastDay: "",
    favorite: false,
    originalLanguage: "Latin",
    latinBody:
      "Credo in unum Deum,\n" +
      "Patrem omnipoténtem,\n" +
      "factórem cæli et terræ,\n" +
      "visibílium ómnium et invisibílium.\n\n" +
      "Et in unum Dóminum Iesum Christum,\n" +
      "Fílium Dei unigénitum,\n" +
      "et ex Patre natum ante ómnia sǽcula.\n" +
      "Deum de Deo, lumen de lúmine,\n" +
      "Deum verum de Deo vero,\n" +
      "génitum, non factum, consubstantiálem Patri:\n" +
      "per quem ómnia facta sunt.\n" +
      "Qui propter nos hómines et propter nostram salútem\n" +
      "descéndit de cælis.\n" +
      "Et incarnátus est de Spíritu Sancto\n" +
      "ex María Vírgine, et homo factus est.\n" +
      "Crucifíxus étiam pro nobis sub Póntio Piláto;\n" +
      "passus et sepúltus est,\n" +
      "et resurréxit tértia die, secúndum Scriptúras,\n" +
      "et ascéndit in cælum,\n" +
      "sedet ad déxteram Patris.\n" +
      "Et íterum ventúrus est cum glória,\n" +
      "iudicáre vivos et mórtuos,\n" +
      "cuius regni non erit finis.\n\n" +
      "Et in Spíritum Sanctum, Dóminum et vivificántem:\n" +
      "qui ex Patre Filióque procédit.\n" +
      "Qui cum Patre et Fílio simul adorátur et conglorificátur:\n" +
      "qui locútus est per prophétas.\n\n" +
      "Et unam, sanctam, cathólicam et apostólicam Ecclésiam.\n" +
      "Confíteor unum baptísma in remissiónem peccatórum.\n" +
      "Et exspécto resurrectiónem mortuórum,\n" +
      "et vitam ventúri sǽculi. Amen.",
    body:
      "I believe in one God,\n" +
      "the Father almighty,\n" +
      "maker of heaven and earth,\n" +
      "of all things visible and invisible.\n\n" +
      "I believe in one Lord Jesus Christ,\n" +
      "the Only Begotten Son of God,\n" +
      "born of the Father before all ages.\n" +
      "God from God, Light from Light,\n" +
      "true God from true God,\n" +
      "begotten, not made, consubstantial with the Father;\n" +
      "through him all things were made.\n" +
      "For us men and for our salvation\n" +
      "he came down from heaven,\n" +
      "and by the Holy Spirit was incarnate of the Virgin Mary,\n" +
      "and became man.\n" +
      "For our sake he was crucified under Pontius Pilate,\n" +
      "he suffered death and was buried,\n" +
      "and rose again on the third day\n" +
      "in accordance with the Scriptures.\n" +
      "He ascended into heaven\n" +
      "and is seated at the right hand of the Father.\n" +
      "He will come again in glory\n" +
      "to judge the living and the dead\n" +
      "and his kingdom will have no end.\n\n" +
      "I believe in the Holy Spirit,\n" +
      "the Lord, the giver of life,\n" +
      "who proceeds from the Father and the Son,\n" +
      "who with the Father and the Son is adored and glorified,\n" +
      "who has spoken through the prophets.\n\n" +
      "I believe in one, holy, catholic and apostolic Church.\n" +
      "I confess one Baptism for the forgiveness of sins\n" +
      "and I look forward to the resurrection of the dead\n" +
      "and the life of the world to come. Amen.",
    background:
      "Properly the Niceno-Constantinopolitan Creed: drafted at Nicaea in 325 " +
      "against Arius, who held that the Son was the greatest of creatures " +
      "rather than God, and completed at Constantinople in 381, which filled " +
      "out the clause on the Holy Spirit. The decisive word is " +
      "'consubstantial' (homooúsios) — of the same substance as the Father — " +
      "chosen precisely because no one could read it in a merely honorific " +
      "sense. The Filioque ('and the Son') is a later Western addition and " +
      "remains a point of division with the Orthodox East. This is the creed " +
      "professed at Mass on Sundays and solemnities; the shorter Apostles' " +
      "Creed may be used in its place.",
  },
  {
    title: "Morning Offering",
    kind: "prayer",
    tags: ["morning", "daily"],
    source: "Traditional — Apostleship of Prayer",
    author: "Fr. François-Xavier Gautrelet, S.J.",
    related: ["The First Moment of the Day", "Night Prayer"],
    year: "1844",
    origin: "Apostleship of Prayer / Sacred Heart devotion",
    feastDay: "",
    favorite: true,
    body:
      "O Jesus,\n" +
      "through the Immaculate Heart of Mary,\n" +
      "I offer You my prayers, works,\n" +
      "joys and sufferings\n" +
      "of this day for all the intentions\n" +
      "of Your Sacred Heart,\n" +
      "in union with the Holy Sacrifice of the Mass\n" +
      "throughout the world,\n" +
      "in reparation for my sins,\n" +
      "for the intentions of all my relatives and friends,\n" +
      "and in particular\n" +
      "for the intentions of the Holy Father.\n" +
      "\n" +
      "Amen",
    background:
      "Written in 1844 by Fr. François-Xavier Gautrelet, S.J., at Vals, France, " +
      "for the Apostleship of Prayer he founded there. His Jesuit scholastics " +
      "couldn't yet go to the missions themselves, so he gave them a way to " +
      "support that work anyway: offer each day's ordinary actions — prayers, " +
      "work, joys, sufferings — to the Sacred Heart of Jesus. Fr. Henri Ramière, " +
      "S.J. later adapted it for parish use from 1861, which is how it spread " +
      "well beyond the Jesuits to become the everyday Catholic prayer it is now.",
  },
  {
    title: "Stay with Me, Lord",
    kind: "prayer",
    tags: ["eucharist", "communion"],
    source: "Traditional prayer after Communion, attributed to St. Padre Pio",
    author: "St. Padre Pio of Pietrelcina",
    year: "20th century (exact date undocumented)",
    origin: "Capuchin Franciscan",
    feastDay: "September 23",
    favorite: true,
    body:
      "Stay with me, Lord, for it is necessary to have You present so that I do not forget You. You know how easily I abandon You.\n\n" +
      "Stay with me Lord, because I am weak, and I need Your strength, so that I may not fall so often.\n\n" +
      "Stay with me Lord, for You are my life, and without You, I am without fervor.\n\n" +
      "Stay with me Lord, for You are my light, and without you, I am in darkness.\n\n" +
      "Stay with me Lord, to show me Your will.\n\n" +
      "Stay with me Lord, so that I hear Your voice and follow You.\n\n" +
      "Stay with me Lord, for I desire to love you very much, and always be in Your Company.\n\n" +
      "Stay with me Lord, if You wish me to be faithful to You.\n\n" +
      "Stay with me Lord, for as poor as my soul is, I want it to be a place of consolation for You, a nest of Love.\n\n" +
      "Stay with me, Jesus, for it is getting late, and the day is coming to a close, and life passes, death, judgment, eternity approach. It is necessary to renew my strength, so that I will not stop along the way and for that, I need You. It is getting late and death approaches. I fear the darkness, the temptations, the dryness, the cross, the sorrows. O how I need You, my Jesus, in this night of exile.\n\n" +
      "Stay with me tonight, Jesus, in life with all its dangers, I need You.\n\n" +
      "Let me recognize You as Your disciples did at the breaking of bread, so that the Eucharistic Communion be the light which disperses the darkness, the force which sustains me, the unique joy of my heart.\n\n" +
      "Stay with me Lord, because at the hour of my death, I want to remain united to you, if not by Communion, at least by grace and love.\n\n" +
      "Stay with me Jesus, I do not ask for divine consolation because I do not merit it, but the gift of Your presence, oh yes, I ask this of You.\n\n" +
      "Stay with me Lord, for it is You alone I look for, Your Love, Your Grace, Your Will, Your Heart, Your Spirit, because I love You and ask no other reward but to love You more and more.\n\n" +
      "With a firm love, I will love You with all my heart while on earth and continue to love You perfectly during all eternity.\n\n" +
      "Amen.",
    background:
      "Composed by St. Padre Pio (Francesco Forgione, 1887–1968), the Capuchin " +
      "Franciscan friar and stigmatist of San Giovanni Rotondo, as a prayer for " +
      "after receiving Holy Communion. It's his own Eucharistic spirituality on " +
      "display — daily Mass and constant recourse to Christ's presence were the " +
      "center of his life — asking Christ to remain present against the ordinary " +
      "weakness of forgetting Him, and moving into a longer meditation on death, " +
      "judgment, and the fear of the dark. Attribution to Padre Pio is consistent " +
      "and well-established across Catholic devotional sources, though the exact " +
      "date he composed it isn't documented.",
  },
  {
    title: "Prayer to the Holy Spirit",
    kind: "prayer",
    tags: ["Holy Spirit", "Dominican"],
    source: "The Prayers of Catherine of Siena, trans. Suzanne Noffke, O.P. (1983)",
    author: "St. Catherine of Siena",
    related: ["O Mad Lover", "Come, Holy Spirit", "Veni Creator Spiritus"],
    year: "c. 1378–1380",
    origin: "Dominican",
    feastDay: "April 29",
    favorite: false,
    body:
      "Holy Spirit, come into my heart;\n" +
      "draw it to Thee by Thy power,\n" +
      "O my God, and grant me charity with filial fear.\n" +
      "Preserve me, O ineffable Love,\n" +
      "from every evil thought;\n" +
      "warm me, inflame me with Thy dear love,\n" +
      "and every pain will seem light to me.\n" +
      "My Father, my sweet Lord,\n" +
      "help me in all my actions.\n" +
      "Jesus, love, Jesus, love.\n" +
      "\n" +
      "Amen.",
    background:
      "One of the prayers Catherine of Siena (1347–1380), a Dominican tertiary " +
      "and Doctor of the Church, dictated to her secretaries in the last years " +
      "of her life, mostly while in Rome working to heal the papal schism and " +
      "reform the Church. Unlike her earlier letters, these late prayers were " +
      "spoken aloud in states of ecstatic prayer and taken down as she spoke — " +
      "this one asks the Holy Spirit for 'filial' fear (the fear of a child who " +
      "loves) rather than servile fear, and for protection from evil thoughts. " +
      "Compiled and translated into modern English by Sr. Suzanne Noffke, O.P. " +
      "in The Prayers of Catherine of Siena (1983).",
  },
  {
    title: "Love Undefiled",
    kind: "prayer",
    tags: ["eucharist", "Trinity", "Dominican"],
    source: "The Prayers of Catherine of Siena, trans. Suzanne Noffke, O.P. (1983)",
    author: "St. Catherine of Siena",
    related: ["O Mad Lover"],
    year: "c. 1378–1380",
    origin: "Dominican",
    feastDay: "April 29",
    favorite: false,
    body:
      "Eternal God, eternal Trinity,\n" +
      "You have made the Blood of Christ so precious\n" +
      "through His sharing in Your Divine nature.\n" +
      "You are a mystery as deep as the sea;\n" +
      "the more I search, the more I find,\n" +
      "and the more I find the more I search for You.\n" +
      "But I can never be satisfied;\n" +
      "what I receive will ever leave me desiring more.\n" +
      "When You fill my soul I have an ever-greater hunger,\n" +
      "and I grow more famished for Your light.\n" +
      "I desire above all to see You,\n" +
      "the true light,\n" +
      "as you really are.",
    background:
      "One of the prayers Catherine of Siena (1347–1380), a Dominican tertiary " +
      "and Doctor of the Church, dictated to her secretaries in the last years " +
      "of her life. This one meditates on the Precious Blood of Christ as the " +
      "sign of the Trinity's self-giving love, and on the restless, " +
      "ever-deepening desire that prayer itself creates. It reflects the " +
      "Eucharistic and Trinitarian center of her theology, worked out at " +
      "greater length in her major work The Dialogue (dictated 1377–78). " +
      "Compiled and translated by Sr. Suzanne Noffke, O.P. in The Prayers of " +
      "Catherine of Siena (1983).",
  },
  {
    title: "The Angelus",
    kind: "prayer",
    seedVersion: 2,
    tags: ["Incarnation", "Marian", "morning", "noon", "evening"],
    source: "Traditional Catholic prayer, prayed at 6am, noon, and 6pm",
    author: "Traditional",
    related: ["Hail Mary", "Regina Caeli", "Litany of Loreto"],
    relatedSaints: ["mary"],
    authorNote: "developed communally, evening recitation formalized 1318–1327 under Pope John XXII",
    year: "developed 11th–18th century (evening recitation formalized 1318–1327 under Pope John XXII)",
    origin: "Monastic — memorial of the Incarnation",
    feastDay: "",
    favorite: true,
    body:
      "V. The Angel of the Lord declared unto Mary,\n" +
      "R. And she conceived of the Holy Spirit.\n\n" +
      "Hail Mary, full of grace, the Lord is with thee; blessed art thou amongst women, and blessed is the fruit of thy womb, Jesus. Holy Mary, Mother of God, pray for us sinners, now and at the hour of our death. Amen.\n\n" +
      "V. Behold the handmaid of the Lord.\n" +
      "R. Be it done unto me according to Thy word.\n\n" +
      "Hail Mary, full of grace, the Lord is with thee; blessed art thou amongst women, and blessed is the fruit of thy womb, Jesus. Holy Mary, Mother of God, pray for us sinners, now and at the hour of our death. Amen.\n\n" +
      "V. And the Word was made Flesh.\n" +
      "R. And dwelt among us.\n\n" +
      "Hail Mary, full of grace, the Lord is with thee; blessed art thou amongst women, and blessed is the fruit of thy womb, Jesus. Holy Mary, Mother of God, pray for us sinners, now and at the hour of our death. Amen.\n\n" +
      "V. Pray for us, O holy Mother of God.\n" +
      "R. That we may be made worthy of the promises of Christ.\n\n" +
      "Let us pray:\n" +
      "Pour forth, we beseech Thee, O Lord, Thy grace into our hearts; that we, to whom the Incarnation of Christ, Thy Son, was made known by the message of an Angel, may by His Passion and Cross be brought to the glory of His Resurrection. Through the same Christ our Lord. Amen.",
    background:
      "Traces back to medieval monastic practice — by the 11th century, monks in " +
      "Italy were saying three Hail Marys at the last bell of the night. " +
      "Franciscans spread the devotion through the 13th century (a 1269 " +
      "Franciscan chapter at Assisi urged friars to promote a Hail Mary greeting " +
      "after Compline; a liturgical text for it survives from the Franciscan " +
      "Benedetto Sinigardi of Arezzo). Pope John XXII gave it papal backing in " +
      "1318 and 1327, ordering the evening bell and three Hail Marys rung across " +
      "Rome — that evening recitation is the oldest part of what's now a " +
      "three-times-daily prayer; the morning and midday recitations were added " +
      "later, spreading gradually across Europe over the following centuries. " +
      "Structurally it walks through the Annunciation itself — the angel's " +
      "announcement, Mary's consent ('be it done unto me'), and the Word made " +
      "flesh — each followed by a Hail Mary, then a closing prayer asking that " +
      "Christ's Passion and Cross lead to the glory of His Resurrection.",
  },
  {
    title: "Tantum Ergo",
    kind: "hymn",
    tags: ["eucharist", "benediction", "adoration"],
    source: "Last two verses of Pange Lingua Gloriosi Corporis Mysterium; English by Fr. Edward Caswall (19th c.)",
    author: "St. Thomas Aquinas, O.P.",
    related: ["Panis Angelicus", "Prayer Before Mass", "The Divine Praises"],
    year: "c. 1264",
    origin: "Dominican",
    liturgical: "Benediction / Adoration of the Blessed Sacrament",
    feastDay: "January 28",
    favorite: true,
    latinBody:
      "Tantum ergo Sacramentum\n" +
      "Veneremur cernui:\n" +
      "Et antiquum documentum\n" +
      "Novo cedat ritui:\n" +
      "Praestet fides supplementum\n" +
      "Sensuum defectui.\n\n" +
      "Genitori, Genitoque\n" +
      "Laus et jubilatio,\n" +
      "Salus, honor, virtus quoque\n" +
      "Sit et benedictio:\n" +
      "Procedenti ab utroque\n" +
      "Compar sit laudatio.\n\n" +
      "V. Panem de caelo praestitisti eis.\n" +
      "R. Omne delectamentum in se habentem.\n\n" +
      "Oremus:\n" +
      "Deus, qui nobis sub sacramento mirabili passionis tuae memoriam reliquisti: " +
      "tribue, quaesumus, ita nos corporis et sanguinis tui sacra mysteria venerari, " +
      "ut redemptionis tuae fructum in nobis iugiter sentiamus. Qui vivis et regnas " +
      "in saecula saeculorum. Amen.",
    body:
      "Down in adoration falling,\n" +
      "Lo! the Sacred Host we hail,\n" +
      "Lo! o'er ancient forms departing\n" +
      "Newer rites of grace prevail;\n" +
      "Faith for all defects supplying,\n" +
      "Where the feeble senses fail.\n\n" +
      "To the Everlasting Father,\n" +
      "And the Son Who reigns on high,\n" +
      "With the Holy Spirit proceeding\n" +
      "Forth from Each eternally,\n" +
      "Be salvation, honour, blessing,\n" +
      "Might, and endless majesty.\n\n" +
      "V. Thou hast given them Bread from heaven.\n" +
      "R. Having within it all sweetness.\n\n" +
      "Let us pray:\n" +
      "O God, who in this wonderful Sacrament hast left us a memorial of Thy Passion: " +
      "grant us, we beseech Thee, so to venerate the sacred mysteries of Thy Body and " +
      "Blood, that we may ever feel within us the fruit of Thy redemption. Who livest " +
      "and reignest for ever and ever. Amen.",
    background:
      "The last two verses of Pange Lingua Gloriosi Corporis Mysterium, a longer " +
      "processional hymn St. Thomas Aquinas composed around 1264 for the newly " +
      "established Feast of Corpus Christi, at Pope Urban IV's request. These " +
      "closing verses broke off to become their own devotional unit, sung or " +
      "recited at Benediction and Eucharistic Adoration — the moment the priest " +
      "incenses the Host, right before the blessing. The English here is Fr. " +
      "Edward Caswall's 19th-century translation, 'Down in Adoration Falling,' " +
      "the version most commonly sung in English-speaking parishes today. It's " +
      "The versicle, response and closing collect that follow it at Benediction are " +
      "included here: the versicle quotes Wisdom 16:20 on the manna, and the collect " +
      "is the same one used on Corpus Christi itself — asking not for a feeling of " +
      "devotion but that the fruit of the redemption be continually felt (iugiter, " +
      "'unceasingly'). In practice the priest incenses the Blessed Sacrament during " +
      "the hymn, and the blessing with the monstrance follows the collect.",
  },
  {
    title: "Panis Angelicus",
    kind: "hymn",
    tags: ["eucharist", "Corpus Christi"],
    source: "Penultimate stanza of Sacris Solemniis; famously set to music separately by César Franck (1872)",
    author: "St. Thomas Aquinas, O.P.",
    related: ["Tantum Ergo", "Prayer Before Mass"],
    year: "c. 1264",
    origin: "Dominican",
    liturgical: "Corpus Christi; often sung at Eucharistic devotions and weddings",
    feastDay: "January 28",
    favorite: false,
    latinBody:
      "Panis angelicus fit panis hominum;\n" +
      "Dat panis caelicus figuris terminum:\n" +
      "O res mirabilis! manducat Dominum\n" +
      "Pauper, pauper, servus et humilis.\n\n" +
      "Te, trina Deitas unaque, poscimus:\n" +
      "Sic nos tu visita, sicut te colimus;\n" +
      "Per tuas semitas duc nos quo tendimus,\n" +
      "Ad lucem quam inhabitas.",
    body:
      "The bread of angels becomes the bread of men;\n" +
      "the heavenly bread puts an end to all figures and symbols:\n" +
      "O thing miraculous! The body of the Lord will nourish\n" +
      "the poor, the poor, a servant, and a humble one.\n\n" +
      "Thee, therefore, we beseech, O threefold and one Godhead,\n" +
      "so visit us as we now worship Thee;\n" +
      "lead us through Thy ways to where we are headed,\n" +
      "to the light in which Thou dwellest.",
    background:
      "Not really a stand-alone prayer, more a fragment of a longer hymn — it's " +
      "the second-to-last stanza of Sacris Solemniis, another Corpus Christi hymn Aquinas wrote " +
      "alongside Pange Lingua around 1264 (paired here with the hymn's actual " +
      "closing doxology stanza, 'Te, trina Deitas'). It became famous as an " +
      "independent piece mostly through César Franck's 1872 musical setting, " +
      "written for a friend's ordination and later folded into his Messe " +
      "solennelle — that setting, not the plainchant original, is what most " +
      "people mean today when they say 'Panis Angelicus.' Still sung " +
      "liturgically at Corpus Christi and Eucharistic devotions, and a common " +
      "choice at weddings.",
  },
  {
    title: "Anima Christi",
    kind: "prayer",
    tags: ["eucharist", "Ignatian", "communion"],
    source: "Traditional; placed at the opening of St. Ignatius of Loyola's Spiritual Exercises (1548)",
    author: "Traditional",
    related: ["The Seven Last Words", "The Five Wounds"],
    authorNote: "long misattributed to St. Ignatius of Loyola, who merely placed it at the start of his Spiritual Exercises",
    year: "early 14th century",
    origin: "Ignatian",
    liturgical: "After Holy Communion",
    feastDay: "",
    favorite: true,
    latinBody:
      "Anima Christi, sanctifica me.\n" +
      "Corpus Christi, salva me.\n" +
      "Sanguis Christi, inebria me.\n" +
      "Aqua lateris Christi, lava me.\n" +
      "Passio Christi, conforta me.\n" +
      "O bone Iesu, exaudi me.\n" +
      "Intra tua vulnera absconde me.\n" +
      "Ne permittas me separari a te.\n" +
      "Ab hoste maligno defende me.\n" +
      "In hora mortis meae voca me.\n" +
      "Et iube me venire ad te,\n" +
      "Ut cum Sanctis tuis laudem te\n" +
      "In saecula saeculorum.\n" +
      "Amen.",
    body:
      "Soul of Christ, sanctify me.\n" +
      "Body of Christ, save me.\n" +
      "Blood of Christ, inebriate me.\n" +
      "Water from the side of Christ, wash me.\n" +
      "Passion of Christ, strengthen me.\n" +
      "O good Jesus, hear me.\n" +
      "Within Thy wounds hide me.\n" +
      "Suffer me not to be separated from Thee.\n" +
      "From the malicious enemy defend me.\n" +
      "In the hour of my death call me.\n" +
      "And bid me come to Thee,\n" +
      "That with Thy saints I may praise Thee\n" +
      "For ever and ever.\n" +
      "Amen.",
    background:
      "A medieval Eucharistic prayer of unknown authorship, dating to the early " +
      "14th century — found in manuscripts and prayer books written a century " +
      "before St. Ignatius of Loyola (1491–1556) was even born, which makes his " +
      "supposed authorship a well-documented misattribution. What Ignatius " +
      "actually did was place it at the very opening of his Spiritual Exercises " +
      "(composed 1522–1548) as a prayer to say after receiving Communion, and " +
      "Jesuit spirituality carried it around the world from there — close " +
      "enough contact that most people now assume he wrote it. Separately, in " +
      "1330 Pope John XXII attached an indulgence to it — a formal Church " +
      "decree that praying it earned a remission of temporal punishment for " +
      "sin, meant to encourage the devotion, not a claim of authorship. But it " +
      "left his name officially attached to the prayer too, which is likely " +
      "why some later sources credited him as its author as well — a second, " +
      "equally mistaken attribution alongside the one to Ignatius.",
  },
  {
    title: "St. Benedict Medal Prayer",
    kind: "prayer",
    tags: ["protection", "Benedictine", "exorcism"],
    source: "Inscriptions of the Saint Benedict Medal (Jubilee Medal, struck 1880)",
    author: "Traditional",
    authorNote: "text traced to a 1415 manuscript at Metten Abbey, Bavaria",
    year: "medieval formula; medal's modern form struck 1880",
    origin: "Benedictine",
    liturgical: "",
    feastDay: "July 11",
    favorite: false,
    latinBody:
      "Crux sacra sit mihi lux,\n" +
      "Non draco sit mihi dux.\n\n" +
      "Vade retro Satana!\n" +
      "Nunquam suade mihi vana!\n" +
      "Sunt mala quae libas,\n" +
      "Ipse venena bibas!",
    body:
      "May the Holy Cross be my light,\n" +
      "may the dragon never be my guide.\n\n" +
      "Begone, Satan!\n" +
      "Never tempt me with your vanities!\n" +
      "What you offer me is evil;\n" +
      "drink your own poison!",
    background:
      "Not a prayer in the usual sense but the Latin inscribed around the edge " +
      "of the Saint Benedict Medal — a formula of exorcism against the devil. " +
      "Its meaning was actually lost for centuries: the initials (CSSML NDSMD, " +
      "and VRSNSMV SMQLIVB around the medal's edge) went unexplained until " +
      "1647, when a manuscript copy of the full prayer, dated 1415, was found " +
      "at Metten Abbey in Bavaria and matched to the letters. The medal was " +
      "struck in its current 'Jubilee' form in 1880 to mark the 1400th " +
      "anniversary of St. Benedict's birth, but the exorcism formula and the " +
      "medal's association with the cross long predate that — traditionally " +
      "traced to St. Benedict's own life (480–547) and the stories in St. " +
      "Gregory the Great's Life of Benedict of him overcoming diabolical " +
      "attacks with the sign of the Cross.",
  },
  {
    title: "Salve Regina",
    kind: "antiphon",
    seedVersion: 3,
    tags: ["Marian", "Compline", "antiphon"],
    source: "One of the four seasonal Marian antiphons sung/recited at the close of Compline",
    author: "Bl. Hermann of Reichenau, O.S.B.",
    related: ["Alma Redemptoris Mater", "Ave Regina Caelorum", "Regina Caeli", "Litany of Loreto"],
    relatedSaints: ["mary"],
    authorNote: "disputed — most musicologists regard it as anonymous",
    year: "11th century (attribution disputed)",
    origin: "Marian antiphon — Compline / Night Prayer",
    liturgical: "Trinity Sunday through the Saturday before the First Sunday of Advent",
    feastDay: "",
    favorite: true,
    latinBody:
      "Salve, Regina, mater misericordiae;\n" +
      "vita, dulcedo, et spes nostra, salve.\n" +
      "Ad te clamamus, exsules filii Evae.\n" +
      "Ad te suspiramus, gementes et flentes\n" +
      "in hac lacrimarum valle.\n\n" +
      "Eia, ergo, advocata nostra,\n" +
      "illos tuos misericordes oculos ad nos converte.\n" +
      "Et Jesum, benedictum fructum ventris tui,\n" +
      "nobis post hoc exsilium ostende.\n" +
      "O clemens, O pia, O dulcis Virgo Maria.",
    spanishBody:
      "Dios te salve, Reina y Madre de misericordia,\n" +
      "vida, dulzura y esperanza nuestra; Dios te salve.\n" +
      "A ti clamamos los desterrados hijos de Eva;\n" +
      "a ti suspiramos, gimiendo y llorando,\n" +
      "en este valle de l\u00e1grimas.\n\n" +
      "Ea, pues, Se\u00f1ora, abogada nuestra,\n" +
      "vuelve a nosotros esos tus ojos misericordiosos;\n" +
      "y despu\u00e9s de este destierro,\n" +
      "mu\u00e9stranos a Jes\u00fas, fruto bendito de tu vientre.\n" +
      "\u00a1Oh clement\u00edsima, oh piadosa, oh dulce Virgen Mar\u00eda!",
    body:
      "Hail, holy Queen, mother of mercy;\n" +
      "our life, our sweetness, and our hope, hail.\n" +
      "To thee do we cry, poor banished children of Eve.\n" +
      "To thee do we send up our sighs, mourning and weeping\n" +
      "in this valley of tears.\n\n" +
      "Turn then, most gracious advocate,\n" +
      "thine eyes of mercy toward us.\n" +
      "And after this our exile,\n" +
      "show unto us the blessed fruit of thy womb, Jesus.\n" +
      "O clement, O loving, O sweet Virgin Mary.",
    background:
      "Traditionally credited to the 11th-century Benedictine monk Bl. Hermann " +
      "of Reichenau ('Herman the Cripple' — severely disabled from childhood, " +
      "yet one of the leading scholars of his age), though most musicologists " +
      "treat it as anonymous; other names attached to it over the centuries " +
      "include Bernard of Clairvaux, Peter of Compostela, and Adhemar of Le " +
      "Puy. From the 12th century it became especially associated with the " +
      "Abbey of Cluny, and was later adopted as the blessing said over ships " +
      "setting out to sea — making it a favourite prayer of sailors. It's the " +
      "antiphon sung at the close of Compline for the largest stretch of the " +
      "church year: from Trinity Sunday all the way to the eve of Advent.",
  },
  {
    title: "Alma Redemptoris Mater",
    kind: "antiphon",
    seedVersion: 3,
    tags: ["Marian", "Compline", "antiphon", "Advent"],
    source: "One of the four seasonal Marian antiphons sung/recited at the close of Compline",
    author: "Bl. Hermann of Reichenau, O.S.B.",
    related: ["Salve Regina", "Ave Regina Caelorum", "Regina Caeli"],
    relatedSaints: ["mary"],
    year: "11th century (c. 1053)",
    origin: "Marian antiphon — Compline / Night Prayer",
    liturgical: "First Sunday of Advent through February 2 (the Presentation / Candlemas)",
    feastDay: "",
    favorite: true,
    latinBody:
      "Alma Redemptoris Mater, quae pervia caeli\n" +
      "porta manes, et stella maris, succurre cadenti,\n" +
      "surgere qui curat, populo: tu quae genuisti,\n" +
      "natura mirante, tuum sanctum Genitorem,\n" +
      "Virgo prius ac posterius, Gabrielis ab ore\n" +
      "sumens illud Ave, peccatorum miserere.",
    body:
      "Loving Mother of the Redeemer, who remain the accessible\n" +
      "gate of heaven and star of the sea, help thy falling people\n" +
      "who strive to rise: thou who gave birth, while nature\n" +
      "wondered how, to thy own holy Creator,\n" +
      "Virgin before and after, receiving that 'Ave'\n" +
      "from Gabriel's mouth, have mercy on us sinners.",
    background:
      "Composed by Bl. Hermann of Reichenau (1013–1054), a Benedictine monk at " +
      "Reichenau Abbey on Lake Constance who — despite severe disability from " +
      "childhood, which earned him the name 'Hermannus Contractus,' Herman the " +
      "Cripple — became one of the leading scholars, composers, and " +
      "instrument-makers of his age. Tradition holds he drew on the writings of " +
      "Fulgentius, Epiphanius, and Irenaeus of Lyon in composing it. It's the " +
      "oldest of the four seasonal Marian antiphons sung at the close of " +
      "Compline, and covers Advent through Candlemas — the church's season of " +
      "waiting for Christ's birth.",
  },
  {
    title: "Ave Regina Caelorum",
    kind: "antiphon",
    seedVersion: 3,
    tags: ["Marian", "Compline", "antiphon", "Lent"],
    source: "One of the four seasonal Marian antiphons sung/recited at the close of Compline",
    author: "Traditional",
    related: ["Salve Regina", "Alma Redemptoris Mater", "Regina Caeli"],
    relatedSaints: ["mary"],
    year: "12th century",
    origin: "Marian antiphon — Compline / Night Prayer",
    liturgical: "February 3 (day after Candlemas) through Wednesday of Holy Week",
    feastDay: "",
    favorite: false,
    latinBody:
      "Ave Regina caelorum,\n" +
      "Ave Domina Angelorum,\n" +
      "Salve radix, salve porta,\n" +
      "Ex qua mundo lux est orta.\n\n" +
      "Gaude, Virgo gloriosa,\n" +
      "Super omnes speciosa,\n" +
      "Vale, o valde decora,\n" +
      "Et pro nobis Christum exora.",
    body:
      "Hail, Queen of Heaven,\n" +
      "Hail, Lady of the Angels,\n" +
      "Hail, root, hail, gate,\n" +
      "from which the light arose for the world.\n\n" +
      "Rejoice, glorious Virgin,\n" +
      "lovely above all others,\n" +
      "farewell, most beautiful one,\n" +
      "and pray for us to Christ.",
    background:
      "Author unknown, like a great deal of medieval Latin liturgical chant — " +
      "it survives in monastic breviaries from at least the 12th century " +
      "onward, with no firmer attribution than that. It's one of the four " +
      "seasonal Marian antiphons sung at the close of Compline, covering the " +
      "day after Candlemas (February 2) through Wednesday of Holy Week: the " +
      "stretch of the church year between the Christmas and Easter cycles, " +
      "including all of Lent.",
  },
  {
    title: "Regina Caeli",
    kind: "antiphon",
    seedVersion: 3,
    tags: ["Marian", "Compline", "antiphon", "Easter"],
    source: "One of the four seasonal Marian antiphons; also replaces the Angelus during the Easter season",
    author: "Traditional",
    related: ["The Angelus", "Salve Regina", "Alma Redemptoris Mater", "Ave Regina Caelorum"],
    relatedSaints: ["mary"],
    year: "12th–13th century",
    origin: "Marian antiphon — Compline / Night Prayer",
    liturgical: "Easter Sunday through Pentecost",
    feastDay: "",
    favorite: true,
    latinBody:
      "Regina caeli, laetare, alleluia,\n" +
      "Quia quem meruisti portare, alleluia,\n" +
      "Resurrexit, sicut dixit, alleluia,\n" +
      "Ora pro nobis Deum, alleluia.",
    body:
      "Queen of Heaven, rejoice, alleluia,\n" +
      "for He whom you were worthy to bear, alleluia,\n" +
      "has risen, as He said, alleluia,\n" +
      "pray for us to God, alleluia.",
    background:
      "Author unknown, dating to the 12th or 13th century. It replaces the " +
      "Angelus during the Easter season — the same basic versicle-response " +
      "shape, but announcing the Resurrection instead of the Incarnation — and " +
      "is the antiphon sung at the close of Compline from Easter Sunday to " +
      "Pentecost. A popular legend holds that Pope St. Gregory the Great heard " +
      "angels singing its first three lines over Rome during an Easter " +
      "procession and himself added the fourth line, 'Ora pro nobis Deum' — a " +
      "good story, but not treated as historical by scholars, since Gregory " +
      "died in 604, centuries before the antiphon's actual 12th–13th century " +
      "appearance.",
  },
  {
    title: "Our Father",
    kind: "prayer",
    tags: ["foundational", "biblical"],
    source: "Matthew 6:9–13; Luke 11:2–4",
    author: "Jesus Christ",
    authorNote: "taught directly to his disciples, per Luke 11:1–4 and Matthew 6:9–13",
    year: "1st century AD",
    origin: "Biblical",
    liturgical: "",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: true,
    latinBody:
      "Pater noster, qui es in caelis,\n" +
      "sanctificetur nomen tuum.\n" +
      "Adveniat regnum tuum.\n" +
      "Fiat voluntas tua,\n" +
      "sicut in caelo et in terra.\n" +
      "Panem nostrum quotidianum da nobis hodie,\n" +
      "et dimitte nobis debita nostra,\n" +
      "sicut et nos dimittimus debitoribus nostris.\n" +
      "Et ne nos inducas in tentationem,\n" +
      "sed libera nos a malo.\n" +
      "Amen.",
    spanishBody:
      "Padre nuestro, que est\u00e1s en el cielo,\n" +
      "santificado sea tu Nombre;\n" +
      "venga a nosotros tu reino;\n" +
      "h\u00e1gase tu voluntad\n" +
      "en la tierra como en el cielo.\n" +
      "Danos hoy nuestro pan de cada d\u00eda;\n" +
      "perdona nuestras ofensas,\n" +
      "como tambi\u00e9n nosotros perdonamos\n" +
      "a los que nos ofenden;\n" +
      "no nos dejes caer en la tentaci\u00f3n,\n" +
      "y l\u00edbranos del mal.\n" +
      "Am\u00e9n.",
    body:
      "Our Father, who art in heaven,\n" +
      "hallowed be thy name.\n" +
      "Thy kingdom come.\n" +
      "Thy will be done\n" +
      "on earth as it is in heaven.\n" +
      "Give us this day our daily bread,\n" +
      "and forgive us our trespasses,\n" +
      "as we forgive those who trespass against us.\n" +
      "And lead us not into temptation,\n" +
      "but deliver us from evil.\n" +
      "Amen.",
    background:
      "The only prayer the Gospels show Jesus teaching his disciples directly, " +
      "in response to their own request: 'Lord, teach us to pray' (Luke 11:1). " +
      "It appears in two slightly different forms, in Matthew's Sermon on the " +
      "Mount and in Luke's shorter version, which is part of why the Latin and " +
      "liturgical traditions settled on Matthew's fuller wording as the " +
      "standard. The Latin here is the text used in the Roman liturgy; the " +
      "closing doxology sometimes added ('For thine is the kingdom...') is a " +
      "later liturgical addition, not part of the Gospel text itself, so it's " +
      "left out here.",
  },
  {
    title: "Hail Mary",
    kind: "prayer",
    seedVersion: 2,
    relatedSaints: ["mary"],
    tags: ["Marian", "foundational", "biblical"],
    source: "First half: Luke 1:28 and 1:42; second half: later ecclesial addition",
    author: "Biblical (Gabriel & Elizabeth)",
    authorNote: "the second half's petition was added later by an unknown ecclesial author",
    year: "Biblical greeting, 1st century; petition added by the Middle Ages, standardized 1568",
    origin: "Biblical",
    liturgical: "",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: true,
    latinBody:
      "Ave Maria, gratia plena,\n" +
      "Dominus tecum.\n" +
      "Benedicta tu in mulieribus,\n" +
      "et benedictus fructus ventris tui, Iesus.\n" +
      "Sancta Maria, Mater Dei,\n" +
      "ora pro nobis peccatoribus,\n" +
      "nunc et in hora mortis nostrae.\n" +
      "Amen.",
    spanishBody:
      "Dios te salve, Mar\u00eda,\n" +
      "llena eres de gracia,\n" +
      "el Se\u00f1or es contigo.\n" +
      "Bendita t\u00fa eres entre todas las mujeres,\n" +
      "y bendito es el fruto de tu vientre, Jes\u00fas.\n" +
      "Santa Mar\u00eda, Madre de Dios,\n" +
      "ruega por nosotros, pecadores,\n" +
      "ahora y en la hora de nuestra muerte.\n" +
      "Am\u00e9n.",
    body:
      "Hail Mary, full of grace,\n" +
      "the Lord is with thee.\n" +
      "Blessed art thou amongst women,\n" +
      "and blessed is the fruit of thy womb, Jesus.\n" +
      "Holy Mary, Mother of God,\n" +
      "pray for us sinners,\n" +
      "now and at the hour of our death.\n" +
      "Amen.",
    background:
      "The first half is taken almost word for word from Scripture: the Angel " +
      "Gabriel's greeting to Mary at the Annunciation ('Hail, full of grace, " +
      "the Lord is with thee' — Luke 1:28) joined to Elizabeth's greeting at " +
      "the Visitation ('Blessed art thou amongst women, and blessed is the " +
      "fruit of thy womb' — Luke 1:42). The second half — the actual petition, " +
      "'Holy Mary, Mother of God, pray for us sinners...' — has no biblical " +
      "source; it developed gradually in the medieval Church and was fixed in " +
      "its current wording in Pope St. Pius V's Roman Breviary of 1568. So the " +
      "prayer is, in effect, two different centuries' worth of material joined " +
      "into one.",
  },
  {
    title: "Glory Be",
    kind: "prayer",
    tags: ["doxology", "foundational"],
    source: "Traditional doxology, said after each decade of the Rosary and at the end of psalms",
    author: "Traditional",
    authorNote: "the doxology form itself dates to the early Church",
    year: "Trinitarian wording shaped by 4th-century controversies over Arianism",
    origin: "Liturgical doxology",
    liturgical: "",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: true,
    latinBody:
      "Gloria Patri, et Filio, et Spiritui Sancto.\n" +
      "Sicut erat in principio, et nunc, et semper,\n" +
      "et in saecula saeculorum. Amen.",
    spanishBody:
      "Gloria al Padre, y al Hijo, y al Esp\u00edritu Santo.\n" +
      "Como era en el principio, ahora y siempre,\n" +
      "por los siglos de los siglos. Am\u00e9n.",
    body:
      "Glory be to the Father, and to the Son, and to the Holy Spirit.\n" +
      "As it was in the beginning, is now, and ever shall be,\n" +
      "world without end. Amen.",
    background:
      "A doxology — a short formula of praise to the Trinity — rather than a " +
      "petition. Its precise wording (naming Father, Son, and Holy Spirit " +
      "together as equally glorified) took shape during the 4th-century " +
      "controversy with Arianism, which denied Christ's full divinity; " +
      "affirming the Son's and Spirit's equal glory alongside the Father's " +
      "became a deliberate, theologically pointed act, not just a nice-sounding " +
      "formula. It's said after every decade of the Rosary and at the close of " +
      "psalms and canticles throughout the Church's daily prayer.",
  },
  {
    title: "Apostles' Creed",
    kind: "prayer",
    tags: ["creed", "foundational"],
    source: "Symbolum Apostolorum — the baptismal creed of the Western Church",
    author: "Traditional",
    authorNote: "developed communally over centuries, no single author",
    year: "Roots to the 2nd century; present form attested by the 8th century (Caesarius of Arles, d. 542)",
    origin: "Baptismal creed",
    liturgical: "",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: false,
    latinBody:
      "Credo in Deum Patrem omnipotentem,\n" +
      "Creatorem caeli et terrae.\n" +
      "Et in Iesum Christum, Filium eius unicum, Dominum nostrum,\n" +
      "qui conceptus est de Spiritu Sancto,\n" +
      "natus ex Maria Virgine,\n" +
      "passus sub Pontio Pilato,\n" +
      "crucifixus, mortuus, et sepultus,\n" +
      "descendit ad inferos,\n" +
      "tertia die resurrexit a mortuis,\n" +
      "ascendit ad caelos,\n" +
      "sedet ad dexteram Dei Patris omnipotentis,\n" +
      "inde venturus est iudicare vivos et mortuos.\n" +
      "Credo in Spiritum Sanctum,\n" +
      "sanctam Ecclesiam catholicam,\n" +
      "sanctorum communionem,\n" +
      "remissionem peccatorum,\n" +
      "carnis resurrectionem,\n" +
      "et vitam aeternam. Amen.",
    spanishBody:
      "Creo en Dios, Padre todopoderoso,\n" +
      "Creador del cielo y de la tierra.\n" +
      "Creo en Jesucristo, su \u00fanico Hijo, nuestro Se\u00f1or,\n" +
      "que fue concebido por obra y gracia del Esp\u00edritu Santo,\n" +
      "naci\u00f3 de Santa Mar\u00eda Virgen,\n" +
      "padeci\u00f3 bajo el poder de Poncio Pilato,\n" +
      "fue crucificado, muerto y sepultado,\n" +
      "descendi\u00f3 a los infiernos,\n" +
      "al tercer d\u00eda resucit\u00f3 de entre los muertos,\n" +
      "subi\u00f3 a los cielos\n" +
      "y est\u00e1 sentado a la derecha de Dios, Padre todopoderoso.\n" +
      "Desde all\u00ed ha de venir a juzgar a vivos y muertos.\n" +
      "Creo en el Esp\u00edritu Santo,\n" +
      "la santa Iglesia cat\u00f3lica,\n" +
      "la comuni\u00f3n de los santos,\n" +
      "el perd\u00f3n de los pecados,\n" +
      "la resurrecci\u00f3n de la carne\n" +
      "y la vida eterna. Am\u00e9n.",
    body:
      "I believe in God, the Father almighty,\n" +
      "Creator of heaven and earth.\n" +
      "And in Jesus Christ, his only Son, our Lord,\n" +
      "who was conceived by the Holy Spirit,\n" +
      "born of the Virgin Mary,\n" +
      "suffered under Pontius Pilate,\n" +
      "was crucified, died, and was buried;\n" +
      "he descended into hell;\n" +
      "on the third day he rose again from the dead;\n" +
      "he ascended into heaven,\n" +
      "and is seated at the right hand of God the Father almighty;\n" +
      "from there he will come to judge the living and the dead.\n" +
      "I believe in the Holy Spirit,\n" +
      "the holy catholic Church,\n" +
      "the communion of saints,\n" +
      "the forgiveness of sins,\n" +
      "the resurrection of the body,\n" +
      "and life everlasting. Amen.",
    background:
      "Not written by any single person — it grew out of the early Church's " +
      "baptismal practice, where candidates professed faith in a set of " +
      "articles before being baptized. The earliest traceable ancestor is the " +
      "'Old Roman Symbol' of the 2nd–4th centuries; the wording used today is " +
      "first found complete in the writings of Caesarius of Arles around 542. " +
      "The name 'Apostles' Creed' reflects a legend — first recorded in 390 — " +
      "that each of the Twelve Apostles personally contributed one of its " +
      "twelve articles; that story isn't treated as historical, but the name " +
      "stuck.",
  },
  {
    title: "Act of Contrition",
    kind: "prayer",
    tags: ["confession", "penance"],
    source: "Traditional catechetical prayer, said in or after Confession",
    author: "Traditional",
    related: ["Act of Faith", "Act of Hope", "Act of Charity", "The Miracle Prayer"],
    authorNote: "standardized through catechisms, no single documented author",
    year: "Current common wording widespread by the 19th–20th century",
    origin: "Sacrament of Reconciliation",
    liturgical: "After examining one's conscience / during Confession",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body:
      "O my God, I am heartily sorry for having offended Thee,\n" +
      "and I detest all my sins because of Thy just punishments,\n" +
      "but most of all because they offend Thee, my God,\n" +
      "who art all good and deserving of all my love.\n" +
      "I firmly resolve, with the help of Thy grace,\n" +
      "to sin no more, and to avoid the near occasions of sin.\n" +
      "Amen.",
    background:
      "One of several traditional Acts (alongside Faith, Hope, and Charity, " +
      "also in this library) that developed through catechism teaching rather " +
      "than a single documented composition — this exact English wording " +
      "became close to universal in English-speaking parishes mostly through " +
      "19th- and 20th-century catechisms. It expresses what the Church calls " +
      "'perfect contrition' — sorrow for sin because it offends God himself, " +
      "not only because of fear of punishment — which the prayer's own middle " +
      "lines deliberately distinguish ('not only because of thy just " +
      "punishments... but most of all because they offend Thee').",
  },
  {
    title: "Act of Faith",
    kind: "prayer",
    tags: ["foundational", "catechetical"],
    source: "Traditional catechetical prayer, one of the four Acts (with Hope, Charity, and Contrition)",
    author: "Traditional",
    related: ["Act of Hope", "Act of Charity", "Act of Contrition"],
    authorNote: "standardized through catechisms, no single documented author",
    year: "Common wording widespread by the 19th–20th century",
    origin: "Catechetical",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "O my God, I firmly believe that Thou art one God in three Divine Persons,\n" +
      "Father, Son, and Holy Spirit;\n" +
      "I believe that Thy Divine Son became man and died for our sins,\n" +
      "and that He will come to judge the living and the dead.\n" +
      "I believe these and all the truths which the Holy Catholic Church teaches,\n" +
      "because Thou hast revealed them, who canst neither deceive nor be deceived.\n" +
      "Amen.",
    background:
      "One of the traditional four Acts taught together in catechism " +
      "preparation (Faith, Hope, Charity, and Contrition — all four are in " +
      "this library). Structurally it does something specific: it doesn't just " +
      "list beliefs, it grounds them in trust of the one revealing them ('who " +
      "canst neither deceive nor be deceived') — belief resting on God's own " +
      "trustworthiness rather than on the believer's own certainty.",
  },
  {
    title: "Act of Hope",
    kind: "prayer",
    tags: ["foundational", "catechetical"],
    source: "Traditional catechetical prayer, one of the four Acts (with Faith, Charity, and Contrition)",
    author: "Traditional",
    related: ["Act of Faith", "Act of Charity", "Act of Contrition"],
    authorNote: "standardized through catechisms, no single documented author",
    year: "Common wording widespread by the 19th–20th century",
    origin: "Catechetical",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "O my God, relying on Thy almighty power and infinite mercy and promises,\n" +
      "I hope to obtain pardon for my sins,\n" +
      "the help of Thy grace, and life everlasting,\n" +
      "through the merits of Jesus Christ, my Lord and Redeemer.\n" +
      "Amen.",
    background:
      "The middle one of the traditional four Acts (Faith, Hope, Charity, " +
      "Contrition — all four are in this library). Theologically it's careful " +
      "about what Christian hope actually rests on: not optimism or wishful " +
      "thinking, but God's 'almighty power and infinite mercy and promises' — " +
      "hope as trust in what God has committed to, not a feeling about how " +
      "things will probably turn out.",
  },
  {
    title: "Act of Charity",
    kind: "prayer",
    tags: ["foundational", "catechetical"],
    source: "Traditional catechetical prayer, one of the four Acts (with Faith, Hope, and Contrition)",
    author: "Traditional",
    related: ["Act of Faith", "Act of Hope", "Act of Contrition"],
    authorNote: "standardized through catechisms, no single documented author",
    year: "Common wording widespread by the 19th–20th century",
    origin: "Catechetical",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "O my God, I love Thee above all things,\n" +
      "with my whole heart and soul,\n" +
      "because Thou art all-good and worthy of all love.\n" +
      "I love my neighbor as myself for the love of Thee.\n" +
      "I forgive all who have injured me,\n" +
      "and ask pardon of all whom I have injured.\n" +
      "Amen.",
    background:
      "The last of the traditional four Acts (Faith, Hope, Charity, Contrition " +
      "— all four are in this library). It puts the two great commandments " +
      "(love of God, love of neighbor) into a single short prayer, and adds a " +
      "concrete, practical line most versions of the other Acts don't have: an " +
      "actual act of forgiving and asking forgiveness, not just a statement of " +
      "belief or feeling.",
  },
  {
    title: "Guardian Angel Prayer",
    kind: "prayer",
    tags: ["guardian angel", "children", "catechetical"],
    source: "Traditional catechetical prayer",
    author: "Traditional",
    authorNote: "popularized through catechisms",
    year: "Common English wording widespread by the 19th century",
    origin: "Devotion to the Guardian Angels",
    liturgical: "",
    feastDay: "October 2 (Feast of the Guardian Angels)",
    originalLanguage: "",
    favorite: false,
    spanishBody:
      "\u00c1ngel de la guarda, dulce compa\u00f1\u00eda,\n" +
      "no me desampares ni de noche ni de d\u00eda.\n" +
      "No me dejes solo, que me perder\u00eda.\n" +
      "Am\u00e9n.",
    body:
      "Angel of God, my guardian dear,\n" +
      "to whom God's love commits me here,\n" +
      "ever this day be at my side,\n" +
      "to light and guard, to rule and guide.\n" +
      "Amen.",
    background:
      "A short, simple prayer of unknown authorship, most often taught to " +
      "children but said by adults just as often — it rests on the Church's " +
      "belief, affirmed since the early Fathers and given its own feast day " +
      "(October 2), that each person is given a guardian angel from birth. The " +
      "four verbs in the last line — light, guard, rule, guide — map onto the " +
      "traditional understanding of what a guardian angel actually does: " +
      "illuminating the mind, protecting from harm, directing toward good, and " +
      "leading through difficulty.",
  },
  {
    title: "Let Nothing Disturb You",
    kind: "prayer",
    tags: ["Carmelite", "surrender", "poem"],
    source: "Found written in St. Teresa's own breviary at her death",
    author: "St. Teresa of Ávila",
    authorNote: "disputed — some scholars argue St. John of the Cross wrote it in the margin of her breviary",
    year: "16th century (she died in 1582)",
    origin: "Carmelite",
    liturgical: "",
    feastDay: "October 15 (St. Teresa of Ávila)",
    originalLanguage: "Spanish",
    favorite: true,
    latinBody:
      "Nada te turbe,\n" +
      "nada te espante,\n" +
      "todo se pasa,\n" +
      "Dios no se muda,\n" +
      "la paciencia todo lo alcanza;\n" +
      "quien a Dios tiene nada le falta:\n" +
      "solo Dios basta.",
    body:
      "Let nothing disturb you,\n" +
      "let nothing frighten you,\n" +
      "all things are passing away:\n" +
      "God never changes.\n" +
      "Patience obtains all things.\n" +
      "Whoever has God lacks nothing:\n" +
      "God alone suffices.",
    background:
      "Known as 'St. Teresa's Bookmark' — these lines were found written in " +
      "her own hand in the breviary she used for the Divine Office, discovered " +
      "after her death at Alba de Tormes in 1582. It's almost always credited " +
      "to her, but at least one scholar specializing in St. John of the Cross " +
      "(her close collaborator in reforming the Carmelite order) has argued the " +
      "terse language and stark imagery read more like his poetry than hers, " +
      "and that he may have written it in the margin of her breviary himself. " +
      "Either way it comes from the same small circle of 16th-century Spanish " +
      "Carmelite reformers your own pilgrimage was built around.",
  },
  {
    title: "Suscipe",
    kind: "prayer",
    tags: ["Ignatian", "self-offering"],
    source: "From the closing 'Contemplation to Attain the Love of God' in the Spiritual Exercises",
    author: "St. Ignatius of Loyola",
    authorNote: "the standard Latin text is a translation by André des Freux, S.J., not Ignatius's own wording",
    year: "Spiritual Exercises composed 1522–1548",
    origin: "Ignatian",
    liturgical: "",
    feastDay: "July 31 (St. Ignatius of Loyola)",
    originalLanguage: "Latin",
    favorite: true,
    latinBody:
      "Suscipe, Domine, universam meam libertatem.\n" +
      "Accipe memoriam, intellectum, atque voluntatem omnem.\n" +
      "Quidquid habeo vel possideo, mihi largitus es;\n" +
      "id tibi totum restituo, ac tuae prorsus voluntati trado gubernandum.\n" +
      "Amorem tui solum cum gratia tua mihi dones,\n" +
      "et dives sum satis, nec aliud quidquam ultra posco.",
    body:
      "Take, Lord, and receive all my liberty,\n" +
      "my memory, my understanding, and my entire will.\n" +
      "Whatsoever I have or hold, You have given me;\n" +
      "I give it all back to You, and surrender it wholly to be governed by Your will.\n" +
      "Give me only Your love and Your grace;\n" +
      "with these I am rich enough, and I have no more to ask.",
    background:
      "Comes from the very end of the Spiritual Exercises, the retreat " +
      "structure Ignatius of Loyola developed over 1522–1548 — the culminating " +
      "prayer of total self-offering after the whole retreat's work. One " +
      "wrinkle worth knowing: Ignatius, a Basque nobleman rather than a " +
      "classically trained scholar, wrote the Exercises mainly in Spanish and " +
      "was never a confident Latin stylist himself. The polished Latin wording " +
      "universally used today isn't his own hand — it's a translation by his " +
      "fellow early Jesuit André des Freux, which became the standard, " +
      "'authoritative' text over Ignatius's own less fluent version.",
  },
  {
    title: "Litany of Humility",
    kind: "litany",
    tags: ["humility", "self-examination"],
    source: "Popularized by Cardinal Rafael Merry del Val, who said it daily after Mass",
    author: "Cardinal Rafael Merry del Val",
    related: ["Litany of Trust"],
    authorNote: "a near-identical version predates him, already in print by 1880",
    year: "Published in its familiar form in the early 20th century, based on an 1880 original",
    origin: "Devotional",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body:
      "O Jesus, meek and humble of heart, hear me.\n\n" +
      "From the desire of being esteemed, deliver me, Jesus.\n" +
      "From the desire of being loved, deliver me, Jesus.\n" +
      "From the desire of being extolled, deliver me, Jesus.\n" +
      "From the desire of being honored, deliver me, Jesus.\n" +
      "From the desire of being praised, deliver me, Jesus.\n" +
      "From the desire of being preferred to others, deliver me, Jesus.\n" +
      "From the desire of being consulted, deliver me, Jesus.\n" +
      "From the desire of being approved, deliver me, Jesus.\n\n" +
      "From the fear of being humiliated, deliver me, Jesus.\n" +
      "From the fear of being despised, deliver me, Jesus.\n" +
      "From the fear of suffering rebukes, deliver me, Jesus.\n" +
      "From the fear of being calumniated, deliver me, Jesus.\n" +
      "From the fear of being forgotten, deliver me, Jesus.\n" +
      "From the fear of being ridiculed, deliver me, Jesus.\n" +
      "From the fear of being wronged, deliver me, Jesus.\n" +
      "From the fear of being suspected, deliver me, Jesus.\n\n" +
      "That others may be loved more than I, Jesus, grant me the grace to desire it.\n" +
      "That others may be esteemed more than I, Jesus, grant me the grace to desire it.\n" +
      "That, in the opinion of the world, others may increase and I may decrease, Jesus, grant me the grace to desire it.\n" +
      "That others may be chosen and I set aside, Jesus, grant me the grace to desire it.\n" +
      "That others may be praised and I go unnoticed, Jesus, grant me the grace to desire it.\n" +
      "That others may be preferred to me in everything, Jesus, grant me the grace to desire it.\n" +
      "That others may become holier than I, provided that I may become as holy as I should, Jesus, grant me the grace to desire it.",
    background:
      "Widely attributed to Cardinal Rafael Merry del Val (1865–1930), the " +
      "Spanish-English churchman who served as Cardinal Secretary of State " +
      "under Pope St. Pius X and was known to pray it daily after offering " +
      "Mass. But a nearly identical version was already circulating in print " +
      "in 1880 — years before Merry del Val would have composed anything " +
      "devotional himself — so what usually gets credited as his original " +
      "composition looks more like his personal adoption and popularization of " +
      "an already-existing, lesser-known prayer. Structurally it's two litanies " +
      "in one: a first half asking deliverance from wanting others' esteem and " +
      "fearing their disapproval, and a much harder second half asking for the " +
      "actual grace to want to be overlooked in favor of others.",
  },
  {
    title: "Litany of Trust",
    kind: "litany",
    tags: ["trust", "surrender", "anxiety"],
    source: "Sisters of Life (sistersoflife.org)",
    author: "Sr. Faustina Maria Pia, S.V.",
    related: ["Litany of Humility", "Jesus, I Trust in You"],
    year: "Contemporary (2010s); exact year of composition not widely documented",
    origin: "Sisters of Life",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body:
      "From the belief that I have to earn Your love, deliver me, Jesus.\n" +
      "From the fear that I am unlovable, deliver me, Jesus.\n" +
      "From the false security that I have what it takes, deliver me, Jesus.\n" +
      "From the fear that trusting You will leave me more destitute, deliver me, Jesus.\n" +
      "From all suspicion of Your words and promises, deliver me, Jesus.\n" +
      "From the rebellion against childlike dependency on You, deliver me, Jesus.\n" +
      "From refusals and reluctances in accepting Your will, deliver me, Jesus.\n" +
      "From anxiety about the future, deliver me, Jesus.\n" +
      "From resentment or excessive preoccupation with the past, deliver me, Jesus.\n" +
      "From restless self-seeking in the present moment, deliver me, Jesus.\n" +
      "From disbelief in Your love and presence, deliver me, Jesus.\n" +
      "From the fear of being asked to give more than I have, deliver me, Jesus.\n" +
      "From the belief that my life has no meaning or worth, deliver me, Jesus.\n" +
      "From the fear of what love demands, deliver me, Jesus.\n" +
      "From discouragement, deliver me, Jesus.\n\n" +
      "That You are continually holding me, sustaining me, loving me, Jesus, I trust in You.\n" +
      "That Your love goes deeper than my sins and failings, and transforms me, Jesus, I trust in You.\n" +
      "That not knowing what tomorrow brings is an invitation to lean on You, Jesus, I trust in You.\n" +
      "That You are with me in my suffering, Jesus, I trust in You.\n" +
      "That my suffering, united to Your own, will bear fruit in this life and the next, Jesus, I trust in You.\n" +
      "That You will not leave me orphan, that You are present in Your Church, Jesus, I trust in You.\n" +
      "That Your plan is better than anything else, Jesus, I trust in You.\n" +
      "That You always hear me and in Your goodness always respond to me, Jesus, I trust in You.\n" +
      "That You give me the grace to accept forgiveness and to forgive others, Jesus, I trust in You.\n" +
      "That You give me all the strength I need for what is asked, Jesus, I trust in You.\n" +
      "That my life is a gift, Jesus, I trust in You.\n" +
      "That You will teach me to trust You, Jesus, I trust in You.\n" +
      "That You are my Lord and my God, Jesus, I trust in You.\n" +
      "That I am Your beloved one, Jesus, I trust in You.",
    background:
      "Written by Sr. Faustina Maria Pia, S.V., a member of the Sisters of " +
      "Life — a contemplative-active order founded in 1991 by Cardinal John " +
      "O'Connor, dedicated to the sacredness of human life — while living in " +
      "the Bronx. By her own account, she had been praying before a crucifix " +
      "and realized her lack of peace came from a lack of trust rather than a " +
      "lack of faith; the petitions came to her in prayer and she wrote them " +
      "straight into her journal, deliberately modeling its two-part structure " +
      "(deliverance, then affirmation) on the older Litany of Humility. It's " +
      "one of the very few prayers in this library with a known, living-memory " +
      "author and a documented, recent origin story, rather than centuries of " +
      "manuscript history.",
  },
  {
    title: "Litany of Chastity",
    kind: "litany",
    tags: ["chastity", "purity", "identity"],
    source: "Echo Community (echocommunity.us) — Theology of the Body ministry; litanyofchastity.com",
    author: "Adam Fuselier",
    related: ["You — What Have You Done?"],
    year: "21st century; exact composition date not documented — grew out of his personal prayer",
    origin: "Theology of the Body",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord have mercy on me, Christ have mercy on me.\n" +
      "Lord have mercy on me, Christ hear me, Christ graciously hear me.\n\n" +
      "God the Father of heaven, have mercy on me.\n" +
      "God the Son, Redeemer of the World, have mercy on me.\n" +
      "God the Holy Spirit, have mercy on me.\n" +
      "Holy Trinity, One God, have mercy on me.\n\n" +
      "Mary, Most Pure, pray for me.\n" +
      "Joseph, Most Chaste, pray for me.\n" +
      "Jesus, Burning Fire of Love, heal and restore me.\n\n" +
      "From the lie that I am not good, deliver me, Jesus.\n" +
      "From the lie that I am not wanted, deliver me, Jesus.\n" +
      "From the lie that I am not chosen, deliver me, Jesus.\n" +
      "From the lie that I alone am responsible for my healing and freedom, deliver me, Jesus.\n" +
      "From the lie that I alone am responsible for my holiness, deliver me, Jesus.\n" +
      "From the lie that I am alone in the battle for purity, deliver me, Jesus.\n" +
      "From the lie that I have not been forgiven by You, deliver me, Jesus.\n" +
      "From the temptation to grasp at others to fill my heart, deliver me, Jesus.\n" +
      "From the temptations toward masturbation and pornography, deliver me, Jesus.\n" +
      "From the temptation to run and hide from Your loving gaze, deliver me, Jesus.\n" +
      "From the temptation to use and objectify others, deliver me, Jesus.\n" +
      "From any resentment toward the Father's plan for sexuality, deliver me, Jesus.\n" +
      "From any resentment toward my own body, deliver me, Jesus.\n" +
      "From any rejection of the gift of my masculinity/femininity, deliver me, Jesus.\n" +
      "From all forms of violence against my own dignity and the dignity of others, deliver me, Jesus.\n" +
      "From the sting of my past mistakes for which I've been forgiven, deliver me, Jesus.\n\n" +
      "That I may reject affections for all sexual sin and every temptation to impurity, please help me, Jesus.\n" +
      "That I may resist any shame that leads me to shut You out of my heart, please help me, Jesus.\n" +
      "That I may believe that my sexual desire is inherently good and a gift from You, please help me, Jesus.\n" +
      "That I may embrace the call to authentic love and all of its demands, please help me, Jesus.\n" +
      "That I may embrace and safeguard authentic love and life in every sincere gift of myself, please help me, Jesus.\n" +
      "That I may embrace the joys and crosses of my current state in life, please help me, Jesus.\n" +
      "That I may seek to be a sincere gift to everyone I encounter, please help me, Jesus.\n" +
      "That I may bring all of my struggles with chastity to the foot of the cross, please help me, Jesus.\n" +
      "That I may more fully receive and embrace the gift of my masculinity/femininity, please help me, Jesus.\n" +
      "That I may have the courage to defend the dignity of my brothers and sisters and speak truth over their lives, please help me, Jesus.\n" +
      "That I may have pure sight to see myself and others as You see them, please help me, Jesus.\n" +
      "That I may have the grace to wonder at the gift of Your creation, please help me, Jesus.\n" +
      "That I may trust in Your goodness and trust in Your plan for my life, please help me, Jesus.\n" +
      "That I may come to know and accept that You alone can fulfill the deepest desires of my heart, please help me, Jesus.\n\n" +
      "Lord, Jesus Christ, You promise me that Your yoke is easy and Your burden is light. Help me to embrace the call to love in Your image and, in doing so, to experience the freedom of being a child of God. I ask all of this through the intercession of the Immaculate Heart of Mary and the Chaste Heart of Joseph. Amen.",
    background:
      "Written by Adam Fuselier of Echo Community, a Theology of the Body " +
      "ministry — the litany grew out of his own personal prayer life rather " +
      "than an institutional commission, which makes it unusual among the " +
      "litanies here: most have murky or contested authorship centuries after " +
      "the fact, but this one has a named, living author and a known ministry " +
      "behind it. It's since been distributed in tens of thousands of physical " +
      "copies worldwide (in English and Spanish, with digital translations in " +
      "several more languages), alongside an audio version through the Amen " +
      "prayer app. Structurally it moves from an opening invocation (styled " +
      "after older litanies of the saints), through petitions against specific " +
      "lies and temptations, into positive petitions asking for the grace to " +
      "actually embrace chastity rather than just avoid its opposite — ending " +
      "with a closing prayer invoking Mary and Joseph together.",
  },
  {
    title: "Peace Prayer of St. Francis",
    kind: "prayer",
    tags: ["peace"],
    source: "First published anonymously in 1912 in La Clochette, a French Catholic magazine",
    author: "Unknown",
    authorNote: "falsely attributed to St. Francis of Assisi starting in 1927",
    year: "First published 1912; attributed to Francis from 1927 onward",
    origin: "Modern devotional, later attached to the Franciscan tradition",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord, make me an instrument of your peace;\n" +
      "where there is hatred, let me sow love;\n" +
      "where there is injury, pardon;\n" +
      "where there is doubt, faith;\n" +
      "where there is despair, hope;\n" +
      "where there is darkness, light;\n" +
      "where there is sadness, joy.\n\n" +
      "O Divine Master, grant that I may not so much seek\n" +
      "to be consoled as to console,\n" +
      "to be understood as to understand,\n" +
      "to be loved as to love.\n" +
      "For it is in giving that we receive;\n" +
      "it is in pardoning that we are pardoned;\n" +
      "and it is in dying that we are born to eternal life.\n" +
      "Amen.",
    background:
      "Despite the name, this has nothing to do with St. Francis of Assisi " +
      "(1182–1226) — it's entirely absent from his actual writings and cannot " +
      "be traced back further than 1912, when it appeared anonymously in La " +
      "Clochette, a small French Catholic magazine, under the title 'A " +
      "Beautiful Prayer to Say During the Mass.' The Francis connection seems " +
      "to have started with a 1920 postcard printing that put his picture on " +
      "the back; the first explicit attribution to him came in 1927, from a " +
      "French Protestant peace movement, and the first known English " +
      "translation (1936) already presented it as his. Seven centuries " +
      "separate the real Francis from this prayer's actual appearance.",
  },
  {
    title: "Memorare",
    kind: "prayer",
    seedVersion: 2,
    tags: ["Marian", "intercession"],
    source: "Manuscript tradition traces to Nicolas Salicetus's Antidotarius animae (1489)",
    author: "Traditional",
    related: ["The Measure of Love"],
    relatedSaints: ["mary"],
    authorNote: "long misattributed to St. Bernard of Clairvaux",
    year: "Traceable to the 15th century as part of a longer prayer; popularized in its short form in the 17th century",
    origin: "Marian devotional prayer",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body:
      "Remember, O most gracious Virgin Mary,\n" +
      "that never was it known that anyone who fled to thy protection,\n" +
      "implored thy help, or sought thy intercession\n" +
      "was left unaided.\n" +
      "Inspired by this confidence,\n" +
      "I fly unto thee, O Virgin of virgins, my Mother;\n" +
      "to thee do I come, before thee I stand, sinful and sorrowful.\n" +
      "O Mother of the Word Incarnate,\n" +
      "despise not my petitions,\n" +
      "but in thy mercy hear and answer me.\n" +
      "Amen.",
    background:
      "Often credited to St. Bernard of Clairvaux (1090–1153), but this is " +
      "chronologically impossible: the prayer's earliest traceable source, as " +
      "part of a longer 15th-century prayer called Ad sanctitatis tuae pedes, " +
      "only appears in print in 1489 — over 300 years after Bernard's death. " +
      "The real source of the confusion is likely a different Bernard " +
      "entirely: Fr. Claude Bernard, a 17th-century priest nicknamed 'the poor " +
      "priest,' who was reportedly healed through this prayer and printed over " +
      "200,000 leaflets of it to popularize the short form used today. " +
      "Later generations seem to have conflated the popularizing 'Bernard' " +
      "with the famous 12th-century saint of the same name.",
  },
  {
    title: "Pray, Hope, and Don't Worry",
    occasion:
      "His standard reply in spiritual direction, given in letters and in the confessional to people who came to San Giovanni Rotondo in distress.",
    kind: "quote",
    tags: ["trust", "anxiety"],
    source: "Widely and consistently documented across compilations of his sayings and letters",
    author: "St. Padre Pio of Pietrelcina",
    year: "20th century",
    origin: "Capuchin Franciscan",
    liturgical: "",
    feastDay: "September 23",
    originalLanguage: "",
    favorite: false,
    body: "Pray, hope, and don't worry. Worry is useless. God is merciful and will hear your prayer.",
    background:
      "One of Padre Pio's most consistently attested sayings — it appears across essentially every " +
      "reputable compilation of his correspondence and spiritual direction, with no serious dispute " +
      "about attribution (unlike several other quotes in this library). It compresses his whole approach " +
      "to anxiety into three imperatives in sequence: pray first, then hope, and only then — because the " +
      "first two are already doing the work — let go of worry as simply useless.",
  },
  {
    title: "The Same Father Who Cares for You Today",
    occasion:
      "From his letters of spiritual direction, written for lay people — merchants, wives, courtiers — who had asked how to live devoutly without leaving their ordinary state of life.",
    kind: "quote",
    tags: ["trust", "anxiety"],
    source: "From his letters of spiritual direction",
    author: "St. Francis de Sales",
    year: "17th century",
    origin: "Salesian spirituality",
    liturgical: "",
    feastDay: "January 24",
    originalLanguage: "",
    favorite: false,
    body:
      "Do not fear what may happen tomorrow; the same everlasting Father who cares for you today " +
      "will take care of you tomorrow and every day.",
    background:
      "St. Francis de Sales (1567–1622), Bishop of Geneva, was known above all for a gentle, " +
      "practical style of spiritual direction aimed at ordinary lay people rather than only monks and " +
      "religious — his Introduction to the Devout Life was one of the first major spiritual classics " +
      "written explicitly for people living ordinary secular lives. This line is characteristic: it " +
      "answers anxiety not with a grand theological argument but with a simple continuity — God's care " +
      "didn't start today and won't stop tomorrow.",
  },
  {
    title: "Jesus, I Trust in You",
    occasion:
      "The words she reported being told to inscribe on the image of Divine Mercy, in a vision at Plock in February 1931.",
    kind: "quote",
    tags: ["trust", "Divine Mercy"],
    source: "Diariusz — Divine Mercy in My Soul (her Diary)",
    author: "St. Faustina Kowalska",
    related: ["Litany of Trust"],
    year: "1930s",
    origin: "Divine Mercy devotion",
    liturgical: "",
    feastDay: "October 5",
    originalLanguage: "",
    favorite: false,
    body: "Jesus, I trust in You.",
    background:
      "The words Christ instructed be inscribed on the Divine Mercy image, according to the visions " +
      "St. Faustina Kowalska (1905–1938), a Polish religious sister, recorded in her Diary. Short as it " +
      "is, it's become one of the most widely repeated lines in modern Catholic devotion — the entire " +
      "Divine Mercy movement, and the Litany of Trust already in this library, both grow out of the same " +
      "basic act this sentence names.",
  },
  {
    title: "Begin by Descending",
    occasion:
      "Preached to his congregation at Hippo, where Augustine was working through the ambition of people who wanted spiritual progress the way they wanted advancement.",
    kind: "quote",
    tags: ["humility"],
    source: "Traditionally cited to a sermon of St. Augustine (commonly Sermon 117 or nearby)",
    author: "St. Augustine of Hippo",
    year: "4th–5th century",
    origin: "Patristic",
    liturgical: "",
    feastDay: "August 28",
    originalLanguage: "",
    favorite: false,
    body:
      "Do you wish to rise? Begin by descending. You plan a tower that will pierce the clouds? " +
      "Lay first the foundation of humility.",
    background:
      "Several close English paraphrases of this line circulate, which is common with Augustine's " +
      "sermons — they survive as transcriptions of preached homilies rather than a single polished text " +
      "he wrote once and fixed. The image is a deliberately physical one for a bishop preaching to a " +
      "congregation of builders and laborers: no one starts a tower at the top, and no one arrives at " +
      "genuine spiritual height without first going down.",
  },
  {
    title: "Humility Is Nothing But Truth",
    occasion:
      "From his conferences to the Daughters of Charity, the community he founded with St. Louise de Marillac to serve the sick poor of Paris.",
    kind: "quote",
    tags: ["humility"],
    source: "His conferences to the Daughters of Charity",
    author: "St. Vincent de Paul",
    year: "17th century",
    origin: "Vincentian",
    liturgical: "",
    feastDay: "September 27",
    originalLanguage: "",
    favorite: false,
    body: "Humility is nothing but truth, and pride is nothing but lying.",
    background:
      "St. Vincent de Paul (1581–1660) built two religious communities — the Congregation of the " +
      "Mission and, with St. Louise de Marillac, the Daughters of Charity — around direct, unglamorous " +
      "service to the poor, and his recorded conferences to those communities are full of this kind of " +
      "plain, almost blunt definition. Here humility isn't self-deprecation; it's simple accuracy about " +
      "what's actually true of oneself, which is why its opposite is framed as a form of lying rather " +
      "than just excessive self-regard.",
  },
  {
    title: "The Most Powerful Weapon",
    occasion:
      "From the same conferences to the Daughters of Charity — spoken to women doing unglamorous work among the poor, for whom pride was the live temptation.",
    kind: "quote",
    tags: ["humility"],
    source: "His conferences to the Daughters of Charity",
    author: "St. Vincent de Paul",
    year: "17th century",
    origin: "Vincentian",
    liturgical: "",
    feastDay: "September 27",
    originalLanguage: "",
    favorite: false,
    body:
      "The most powerful weapon to conquer the devil is humility. For, as he does not know at all " +
      "how to employ it, neither does he know how to defend himself from it.",
    background:
      "From the same conferences to the Daughters of Charity as his other sayings on humility. The logic here is " +
      "specifically about pride as the devil's own native weapon — since humility is the one thing pride " +
      "cannot counterfeit or turn to its own use, Vincent treats it as uniquely disarming rather than " +
      "merely virtuous.",
  },
  {
    title: "Suffering Accepted Produces a Good Crop",
    occasion:
      "Written in Story of a Soul, her autobiography, composed under obedience in the last years of a life spent largely in illness.",
    kind: "quote",
    tags: ["suffering"],
    source: "Story of a Soul",
    author: "St. Thérèse of Lisieux",
    year: "1890s",
    origin: "Carmelite",
    liturgical: "",
    feastDay: "October 1",
    originalLanguage: "",
    favorite: false,
    body:
      "Suffering, of itself, produces nothing, but suffering that is accepted, in whatever form it " +
      "takes, produces a good crop.",
    background:
      "From her autobiography, written at her prioress's request in the last years of her short life " +
      "(she died of tuberculosis at 24). The distinction she's drawing is deliberately narrow: suffering " +
      "on its own is neutral, not automatically redemptive or automatically wasted — the difference is " +
      "made entirely by whether it's accepted, which is the same acceptance her 'Little Way' asks for in " +
      "every small daily thing, not only in dramatic suffering.",
  },
  {
    title: "No Other Ladder",
    occasion:
      "From the sayings of a young woman in colonial Lima who imposed severe penances on herself and cared for the sick and the indigenous poor in her family's house. She died at 31.",
    kind: "quote",
    tags: ["suffering"],
    source: "Traditionally attributed in her hagiography",
    author: "St. Rose of Lima",
    year: "17th century",
    origin: "Dominican",
    liturgical: "",
    feastDay: "August 23",
    originalLanguage: "",
    favorite: false,
    body: "Apart from the cross there is no other ladder by which we may get to heaven.",
    background:
      "St. Rose of Lima (1586–1617), a Dominican tertiary in Peru and the first person born in the " +
      "Americas to be canonized, is remembered for an extreme, body-punishing asceticism that later " +
      "generations (including many Catholics) have found hard to hold up as a model without qualification. " +
      "This line is widely attributed to her and consistent with her recorded spirituality, though I " +
      "haven't traced it to a specific letter or manuscript page — worth knowing if precision matters to " +
      "you here.",
  },
  {
    title: "To Unleash Love in the Human Person",
    occasion:
      "From his teaching on the Good Samaritan, developed at length in the 1984 apostolic letter Salvifici Doloris on the Christian meaning of suffering.",
    kind: "quote",
    tags: ["suffering"],
    source: "Salvifici Doloris (apostolic letter on the Christian meaning of human suffering), §29",
    author: "St. John Paul II",
    year: "1984",
    origin: "Modern papal teaching",
    liturgical: "",
    feastDay: "October 22",
    originalLanguage: "",
    favorite: false,
    body:
      "Following the parable of the Gospel, we could say that suffering, which is present under so " +
      "many different forms in our human world, is also present in order to unleash love in the human " +
      "person, that unselfish gift of one's \"I\" on behalf of other people, especially those who suffer.",
    background:
      "From section 29 of Salvifici Doloris, John Paul II's 1984 apostolic letter devoted entirely to " +
      "the meaning of suffering — this section, titled 'The Good Samaritan,' reads the parable (Luke " +
      "10:25–37) as showing suffering's other-facing effect: it doesn't just happen to the sufferer, it " +
      "opens up the possibility of love in whoever encounters it. Pulled the exact sentence from the " +
      "Vatican's own text rather than the looser paraphrase first suggested, since this is a formal " +
      "papal document with an authoritative text available.",
  },
  {
    title: "Don't Let Your Life Be Sterile",
    occasion:
      "From The Way, a book of short points published in 1939 and written for young lay people in Spain, aimed at ordinary work and study rather than religious life.",
    kind: "quote",
    tags: ["perseverance"],
    source: "The Way",
    author: "St. Josemaría Escrivá",
    related: ["The Little Duty of Each Moment", "You — What Have You Done?"],
    year: "1930s (first published 1934/1939)",
    origin: "Opus Dei",
    liturgical: "",
    feastDay: "June 26",
    originalLanguage: "",
    favorite: false,
    body:
      "Don't let your life be sterile. Be useful. Blaze a trail. Shine forth with the light of your " +
      "faith and of your love.",
    background:
      "One of nearly a thousand short numbered points in The Way, Escrivá's best-known book — a " +
      "collection of maxims for ordinary lay Catholics trying to live out holiness through everyday " +
      "work, which is the founding idea of Opus Dei. The imperative pileup here (be useful, blaze a " +
      "trail, shine forth) is characteristic of the book's terse, almost military style of spiritual " +
      "exhortation.",
  },
  {
    title: "Patience Is the Companion of Wisdom",
    occasion:
      "From Augustine's writing on patience — a short treatise arguing that endurance is not passive but a form of understanding.",
    kind: "quote",
    tags: ["perseverance"],
    source: "Consistent with the themes of his treatise De Patientia (On Patience)",
    author: "St. Augustine of Hippo",
    year: "4th–5th century",
    origin: "Patristic",
    liturgical: "",
    feastDay: "August 28",
    originalLanguage: "",
    favorite: false,
    body: "Patience is the companion of wisdom.",
    background:
      "Augustine wrote an entire short treatise, De Patientia, arguing that true patience is a " +
      "theological virtue rooted in love of God, not just a natural temperament or gritted-teeth " +
      "endurance — he was explicitly arguing against a rival view (from a Pelagian-adjacent position) " +
      "that patience could be achieved by willpower alone. This exact aphorism is widely attributed to " +
      "him and fits that treatise closely, though I haven't pinned it to a specific paragraph.",
  },
  {
    title: "On Terms of Friendship With God",
    occasion:
      "From her Life, written under obedience for her confessors, describing what mental prayer had actually been for her over some twenty difficult years.",
    kind: "quote",
    tags: ["prayer"],
    source: "The Book of Her Life (her autobiography), chapter 8",
    author: "St. Teresa of Ávila",
    year: "1560s (written c. 1565)",
    origin: "Carmelite",
    liturgical: "",
    feastDay: "October 15",
    originalLanguage: "",
    favorite: false,
    body: "Prayer is nothing else than being on terms of friendship with God.",
    background:
      "From chapter 8 of her autobiography (usually called The Book of Her Life, or simply Life), " +
      "written at the direction of her confessors in the 1560s. It's one of her most famous single " +
      "sentences precisely because of how unmystical and relational it sounds — prayer defined not as " +
      "technique, vision, or ecstasy (all of which she also writes about at length) but as ordinary " +
      "friendship, extended toward God.",
  },
  {
    title: "A Sea of Love",
    occasion:
      "From his catechetical instructions to the people of Ars, a village he found largely indifferent and spent forty years re-converting.",
    kind: "quote",
    tags: ["prayer"],
    source: "Consistent with his recorded catechetical instructions",
    author: "St. John Vianney",
    year: "19th century",
    origin: "Diocesan priest — patron of parish priests",
    liturgical: "",
    feastDay: "August 4",
    originalLanguage: "",
    favorite: false,
    body: "The interior life is like a sea of love in which the soul is plunged and is, as it were, drowned in love.",
    background:
      "St. John Vianney (1786–1859), the Curé of Ars, spent decades as an ordinary parish priest in a " +
      "small French village, known especially for the enormous hours he spent hearing confessions. His " +
      "recorded catechism talks to his own parishioners are the source for most of his surviving sayings, " +
      "including this one, which is consistent with that body of teaching though I haven't traced it to " +
      "one specific instruction.",
  },
  {
    title: "Our Heart Is Restless",
    occasion:
      "The opening paragraph of the Confessions, written c. 397-400 — the first thing Augustine says to God after a life spent looking elsewhere.",
    kind: "quote",
    tags: ["love"],
    source: "Confessions, Book I",
    author: "St. Augustine of Hippo",
    year: "c. 397–400",
    origin: "Patristic",
    liturgical: "",
    feastDay: "August 28",
    originalLanguage: "",
    favorite: false,
    body: "You have made us for yourself, O Lord, and our heart is restless until it rests in you.",
    background:
      "The opening lines of the Confessions, Augustine's account of his own conversion, written in his " +
      "40s roughly a decade after his baptism. It's arguably the single most quoted sentence in Christian " +
      "literature outside Scripture itself — a claim, stated before the book even properly begins, that " +
      "everything restless in a human life (including all of Augustine's own long detour through " +
      "Manichaeism and ambition) was actually a search for God the whole time.",
  },
  {
    title: "Love Proves Itself By Deeds",
    occasion:
      "Written in Story of a Soul, as she worked out how a cloistered Carmelite with no great works available to her could love in any way that counted.",
    kind: "quote",
    tags: ["love", "little way"],
    source: "Story of a Soul",
    author: "St. Thérèse of Lisieux",
    related: ["Miss No Single Opportunity"],
    year: "1890s",
    origin: "Carmelite",
    liturgical: "",
    feastDay: "October 1",
    originalLanguage: "",
    favorite: false,
    body:
      "Love proves itself by deeds, so how am I to show my love? Great deeds are forbidden me... " +
      "the only way I can prove my love is by scattering flowers — every little sacrifice, every glance " +
      "and word, the doing of the least actions for love.",
    background:
      "The clearest single statement of what Thérèse's 'Little Way' actually is: not a lesser, easier " +
      "spirituality for people who can't do great things, but a deliberate claim that love is proved in " +
      "the smallest available action just as much as in heroic ones — which is precisely why a " +
      "cloistered 24-year-old with no public ministry could become a Doctor of the Church.",
  },
  {
    title: "Be Not Afraid",
    occasion:
      "Said at the Mass inaugurating his pontificate in St. Peter's Square on 22 October 1978 — the first Polish pope, elected from behind the Iron Curtain, addressing a Church and a continent that had reason to be afraid.",
    kind: "quote",
    tags: ["courage"],
    source: "First homily as Pope, St. Peter's Square, 22 October 1978",
    author: "St. John Paul II",
    related: ["I Cannot, I Must Not, I Will Not"],
    year: "1978",
    origin: "Modern papal teaching",
    liturgical: "",
    feastDay: "October 22",
    originalLanguage: "",
    favorite: true,
    body: "Be not afraid.",
    background:
      "Spoken in the opening homily of his pontificate, in St. Peter's Square on 22 October 1978 — an " +
      "exact date, place, and occasion that make this one of the most historically pinned-down quotes in " +
      "this whole library. He returned to the phrase throughout his 27-year pontificate, including in his " +
      "book Crossing the Threshold of Hope, where he describes it as inspired by the Holy Spirit rather " +
      "than a rhetorical flourish he planned in advance.",
  },
  {
    title: "Have Courage",
    occasion:
      "From his letters of spiritual direction to people who wrote to him about temptation and spiritual dryness.",
    kind: "quote",
    tags: ["courage"],
    source: "From his correspondence, as documented in secondary compilations",
    author: "St. Padre Pio of Pietrelcina",
    year: "20th century",
    origin: "Capuchin Franciscan",
    liturgical: "",
    feastDay: "September 23",
    originalLanguage: "",
    favorite: false,
    body:
      "Have courage and do not fear the assaults of the devil. Remember this forever: it is a healthy " +
      "sign if the devil shouts and roars around you.",
    background:
      "Consistent with Padre Pio's broader teaching on spiritual struggle, though the exact wording here " +
      "comes from secondary compilations of his letters rather than a manuscript I've checked directly " +
      "myself. The reassurance he's offering is a specific, almost counterintuitive one: real spiritual " +
      "opposition is itself a sign something is going right, not a sign of failure.",
  },
  {
    title: "Gloomy Saints",
    occasion:
      "Teresa's remark, of a piece with her practical distrust of piety that made people miserable — she was founding houses across Spain against considerable opposition at the time.",
    kind: "quote",
    tags: ["joy"],
    source: "Widely attributed; exact original page not traced",
    author: "St. Teresa of Ávila",
    year: "16th century",
    origin: "Carmelite",
    liturgical: "",
    feastDay: "October 15",
    originalLanguage: "",
    favorite: false,
    body: "May God protect me from gloomy saints.",
    background:
      "Extremely widely attributed to Teresa and entirely consistent with her recorded views elsewhere — " +
      "she was famously suspicious of dour, joyless piety and wrote approvingly about laughter and " +
      "ordinary human warmth among her nuns — but I could not trace this exact line to a specific page " +
      "in her works, so treat the sentiment as reliably hers and the precise wording as a step less " +
      "certain.",
  },
  {
    title: "Not to Become a Saint",
    occasion:
      "The closing line of Leon Bloy's 1912 novel The Woman Who Was Poor. Bloy was a layman and a novelist, not a saint — included here because the sentence is one of the sharpest in modern Catholic writing.",
    kind: "quote",
    tags: ["joy"],
    source: "La Femme pauvre (The Woman Who Was Poor)",
    author: "Léon Bloy",
    authorNote: "not a canonized saint — French Catholic novelist, 1846–1917",
    year: "1897",
    origin: "Catholic literary tradition",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body: "The only real sadness, the only real failure, the only great tragedy in life, is not to become a saint.",
    background:
      "Bloy wasn't a saint or cleric but a fierce, difficult French Catholic novelist and polemicist, " +
      "and this line — from his novel La Femme pauvre — has had an outsized afterlife, quoted constantly " +
      "in retreats and spiritual reading far beyond his own combative reputation. The commonly quoted " +
      "English wording may be a loose translation rather than word-for-word, which is worth knowing if " +
      "you want to track down the original French.",
  },
  {
    title: "Miss No Single Opportunity",
    occasion:
      "Written in Story of a Soul, describing the 'little way' she had worked out for a life in which no large sacrifices were on offer.",
    kind: "quote",
    tags: ["little way"],
    source: "Story of a Soul",
    author: "St. Thérèse of Lisieux",
    related: ["Love Proves Itself By Deeds", "The Little Duty of Each Moment"],
    year: "1890s",
    origin: "Carmelite",
    liturgical: "",
    feastDay: "October 1",
    originalLanguage: "",
    favorite: false,
    body:
      "Miss no single opportunity of making some small sacrifice, here by a smiling look, there by a " +
      "kindly word; always doing the smallest right and doing it all for love.",
    background:
      "A companion statement to 'Love Proves Itself By Deeds,' also in this library — same source, same " +
      "core idea, but framed here as a practical rule rather than a definition: don't wait for a large " +
      "opportunity to love well, because the small ones are constant and are the actual material of the " +
      "Little Way.",
  },
  {
    title: "The Little Duty of Each Moment",
    occasion:
      "From The Way (1939), addressed to students and young professionals who assumed sanctity required a different life from the one they had.",
    kind: "quote",
    tags: ["little way"],
    source: "The Way, no. 815",
    author: "St. Josemaría Escrivá",
    related: ["Don't Let Your Life Be Sterile", "Miss No Single Opportunity", "You — What Have You Done?"],
    year: "1930s (first published 1934/1939)",
    origin: "Opus Dei",
    liturgical: "",
    feastDay: "June 26",
    originalLanguage: "",
    favorite: false,
    body:
      "Do you really want to be a saint? Carry out the little duty of each moment: do what you ought " +
      "and put yourself into what you are doing.",
    background:
      "From the same numbered-maxim collection as 'Don't Let Your Life Be Sterile,' also in this " +
      "library. It's Escrivá's version of the same insight Thérèse's Little Way makes from a cloister: " +
      "holiness through ordinary, present-tense duty rather than through escaping to more obviously " +
      "'spiritual' circumstances — for Escrivá this meant sanctifying ordinary work specifically.",
  },
  {
    title: "I Will Spend My Heaven Doing Good on Earth",
    occasion:
      "Said in the last months of her life, in 1897, to the sisters attending her as she was dying of tuberculosis at 24.",
    kind: "quote",
    tags: ["death", "little way"],
    source: "Widely cited in the official biographical supplements to Story of a Soul",
    author: "St. Thérèse of Lisieux",
    year: "1897",
    origin: "Carmelite",
    liturgical: "",
    feastDay: "October 1",
    originalLanguage: "",
    favorite: true,
    body: "I will spend my heaven doing good on earth.",
    background:
      "Said in the final months of her life, as she was dying of tuberculosis at 24 — one of the " +
      "best-attested of her deathbed sayings, recorded by the sisters caring for her and included in the " +
      "supplementary material published alongside Story of a Soul. It became something close to a " +
      "personal motto for her posthumous devotion: the promise that her 'Little Way' of small, hidden " +
      "acts of love wasn't ending with her death but continuing on behalf of others.",
  },
  {
    title: "Go and Set the World Aflame",
    occasion:
      "His parting words to Francis Xavier, sending him to the Indies in 1541 — a journey from which Xavier never returned.",
    kind: "quote",
    tags: ["death", "Ignatian"],
    source: "Old Jesuit oral tradition; no primary manuscript citation confirmed",
    author: "St. Ignatius of Loyola",
    authorNote: "oral tradition — no primary manuscript source confirmed",
    year: "16th century (tradition)",
    origin: "Ignatian",
    liturgical: "",
    feastDay: "July 31",
    originalLanguage: "",
    favorite: false,
    body: "Go and set the world aflame.",
    background:
      "A very old and widely repeated line within Jesuit tradition, said to be what Ignatius told St. " +
      "Francis Xavier as Xavier left Rome for the missions that would take him across Asia. I haven't " +
      "verified an exact primary source for it — it belongs to the same category as several other lines " +
      "in this library that are authentically part of a saint's living tradition without a single " +
      "pinned-down document behind them.",
  },
  {
    title: "Set Fire to All Italy",
    occasion:
      "Written in Letter 368 to Stefano Maconi, a young Sienese nobleman she was urging toward monastic life. The famous universal version is a later paraphrase.",
    kind: "quote",
    tags: ["zeal"],
    source: "Letter 368, to Stefano di Corrado Maconi",
    author: "St. Catherine of Siena",
    related: ["Be Who God Meant You to Be", "O Mad Lover"],
    year: "14th century (c. 1378–1380)",
    origin: "Dominican",
    liturgical: "",
    feastDay: "April 29",
    originalLanguage: "",
    favorite: false,
    body: "If you are what you ought to be, you will set fire to all Italy, and not only yonder.",
    background:
      "Catherine's actual words, from one of the many letters she dictated to her lay disciples in the " +
      "last years of her life — this one to Stefano di Corrado Maconi, a young Sienese nobleman she was " +
      "mentoring. The far more famous modern version, 'Be who God meant you to be and you will set the " +
      "world on fire,' is a paraphrase, not this original — see the separate entry for that paraphrase " +
      "and its own, quite different, history.",
  },
  {
    title: "Be Who God Meant You to Be",
    occasion:
      "Said by John Paul II at World Youth Day in Rome in 2000, as his own rendering of St. Catherine of Siena's letter to Stefano Maconi. The official text notes it as a paraphrase.",
    kind: "quote",
    tags: ["zeal"],
    source: "Address at World Youth Day, Rome, 2000 — explicitly given there as a paraphrase of St. Catherine of Siena",
    author: "St. John Paul II",
    related: ["Set Fire to All Italy"],
    authorNote: "paraphrasing St. Catherine of Siena — see her original line, also in this library",
    year: "2000",
    origin: "Modern papal teaching",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body: "Be who God meant you to be and you will set the world on fire.",
    background:
      "This is the famous modern form — but it isn't a direct quotation of Catherine of Siena, whatever " +
      "the internet says. John Paul II used it at World Youth Day 2000, and the official text of his " +
      "address itself identifies it as a paraphrase, pointing back to Catherine's actual line in her " +
      "Letter 368 to Stefano di Corrado Maconi: 'If you are what you ought to be, you will set fire to " +
      "all Italy, and not only yonder' (also in this library, as its own entry). JPII's version " +
      "universalized what was originally a specific, regional image — so this entry is really a " +
      "20th-century papal restatement of a 14th-century letter, not a single quote from a single author.",
  },
  {
    title: "To Speak Well, Love Well",
    occasion:
      "From his letters and instruction on preaching — de Sales held that persuasion was a function of affection rather than of technique.",
    kind: "quote",
    tags: ["communication", "love"],
    source: "Cited by Pope Francis in his 2023 World Communications Day message, released on de Sales's feast day",
    author: "St. Francis de Sales",
    year: "17th century",
    origin: "Salesian spirituality",
    liturgical: "",
    feastDay: "January 24",
    originalLanguage: "",
    favorite: true,
    body: "In order to speak well, it is enough to love well.",
    background:
      "Genuinely his, and given fresh visibility when Pope Francis quoted it in his 2023 World Day of " +
      "Social Communications message — released, deliberately, on de Sales's own feast day, since the " +
      "Church names him patron of writers and journalists. The idea behind it: he treated communication " +
      "not as a technique to master but as something that simply reveals whatever is already in the " +
      "speaker's heart, so the real work of 'speaking well' happens before anyone opens their mouth.",
  },
  {
    title: "Love Until It Hurts",
    occasion:
      "Said in talks and interviews, usually to audiences who had told her they found her work admirable but extreme.",
    kind: "quote",
    tags: ["love", "suffering"],
    source: "One Heart Full of Love, ed. José Luis González-Balado",
    author: "St. Teresa of Calcutta (Mother Teresa)",
    year: "20th century",
    origin: "Missionaries of Charity",
    liturgical: "",
    feastDay: "September 5",
    originalLanguage: "",
    favorite: false,
    body: "I have found the paradox, that if you love until it hurts, there can be no more hurt, only more love.",
    background:
      "Recorded in one of the published compilations of her sayings and writings; like much of her " +
      "material, it comes from talks and interviews rather than a single fixed text she wrote once, so " +
      "slightly different wordings circulate ('if I love' instead of 'if you love,' and similar small " +
      "variants) without changing the substance. The paradox she's naming is specific: real love isn't " +
      "measured by how good it feels, but by how much of the cost of loving is actually absorbed.",
  },
  {
    title: "Prayer Is the Oxygen of the Soul",
    occasion:
      "From his spiritual direction; the image recurs across his letters rather than belonging to one of them.",
    kind: "quote",
    tags: ["prayer"],
    source: "Widely attributed across compilations of his sayings; no primary source pinned",
    author: "St. Padre Pio of Pietrelcina",
    year: "20th century",
    origin: "Capuchin Franciscan",
    liturgical: "",
    feastDay: "September 23",
    originalLanguage: "",
    favorite: false,
    body: "Prayer is the oxygen of the soul.",
    background:
      "Consistently attributed to Padre Pio across Catholic devotional sources, but — unlike 'Pray, " +
      "hope, and don't worry,' already in this library — I couldn't trace this one to a specific letter " +
      "or recorded conversation, so treat the wording as slightly less certain than the sentiment (which " +
      "fits everything else known about his own life of near-constant prayer).",
  },
  {
    title: "Humbled to Be an Example",
    occasion:
      "From his letters of direction, addressed to people struggling with the humiliations of ordinary life rather than chosen penances.",
    kind: "quote",
    tags: ["humility"],
    source: "Consistent with the themes of Introduction to the Devout Life; exact page not pinned",
    author: "St. Francis de Sales",
    year: "17th century",
    origin: "Salesian spirituality",
    liturgical: "",
    feastDay: "January 24",
    originalLanguage: "",
    favorite: false,
    body:
      "If our sweet Saviour so humbled Himself to be an example for us, then certainly we ought to " +
      "humble ourselves so profoundly that we would ever remain in deep acknowledgment of our nothingness.",
    background:
      "Consistent with de Sales's recurring argument in Introduction to the Devout Life that humility is " +
      "grounded in imitating Christ's own self-emptying rather than in a generic idea of modesty — I " +
      "haven't pinned this specific sentence to an exact page, so treat it as reliably in his voice and " +
      "themes rather than a verified verbatim citation.",
  },
  {
    title: "Nothing Is So Strong as Gentleness",
    kind: "quote",
    seedVersion: 1,
    tags: ["humility", "charity", "gentleness", "meekness", "strength", "self-knowledge"],
    source: "The received form of a saying of St. Francis de Sales — see background",
    author: "St. Francis de Sales",
    authorNote: "attributed everywhere, sourced almost nowhere; the nearest text is in the Treatise, Book I ch. 6",
    related: ["Humbled to Be an Example", "Do Your Best and Leave the Rest", "The Two Portions of the Soul", "Litany of Humility"],
    relatedSaints: ["francis-de-sales"],
    year: "Early 17th century",
    origin: "Devotional",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Nothing is so strong as gentleness, nothing so gentle as real strength.\n\nWHERE TO READ MORE\n\n**St. Francis de Sales, Treatise on the Love of God, Book I** — chapter 6 carries the sentence this one appears to descend from. Free, full text.\nhttps://www.ccel.org/ccel/desales/love.toc.html\n\n**St. Francis de Sales, Introduction to the Devout Life, Part III** — his sustained teaching on gentleness, including gentleness towards oneself, which is the harder half.\nhttps://www.ccel.org/ccel/desales/devout_life.toc.html",
    background:
      "The line most often quoted from de Sales, and the one that best summarises him: he was known for a gentleness that his contemporaries found almost implausible in a bishop of the Counter-Reformation, and he insisted it was not weakness but the harder discipline.\n\nA note on the wording, because it is worth knowing. This exact sentence is attributed to him everywhere and sourced almost nowhere — the quotation sites all cite each other. Searching the full text of the Treatise on the Love of God and of his sermons, I could not find it. What is there, in the Treatise (Book I, ch. 6), is a sentence of the same shape about love rather than gentleness: he says that love holds everything in its obedience with a force so delightful that as nothing is so strong as love, nothing is so sweet as its strength.\n\nChange love to gentleness and sweet to gentle and you have the popular form. Whether that reshaping happened in a later translation, in a letter I have not seen, or in someone's summary, I cannot say — his letters run to many volumes and I have not searched them all. So: the sentiment is unmistakably his and the structure is demonstrably his; the exact wording above should be treated as the received form rather than a verified quotation.\n\nThe claim itself is worth sitting with rather than admiring. Both halves are doing work. The first says gentleness is not the absence of strength but its most effective form. The second is the sharper one: that anything genuinely strong will be gentle, so harshness is evidence of weakness rather than of force. On his own account this was not natural to him — he described his temper as something he spent twenty years learning to govern.",
  },
  {
    title: "To Know That You Died for Him",
    occasion:
      "From the Confessions, in the long meditation on what it means to be sought by God before one has begun looking.",
    kind: "quote",
    tags: ["love", "conversion"],
    source: "Commonly attributed; exact citation in his works not verified",
    author: "St. Augustine of Hippo",
    year: "4th–5th century",
    origin: "Patristic",
    liturgical: "",
    feastDay: "August 28",
    originalLanguage: "",
    favorite: false,
    body: "Is it possible for man to know that You died for him, and for him not to live for You?",
    background:
      "I wasn't able to trace this exact sentence to a specific passage of Confessions or any other " +
      "Augustine text despite a real search — worth knowing before you treat it as a precise citation. " +
      "The question it poses is entirely consistent with his theology (the logic that real knowledge of " +
      "the Cross should be inseparable from a changed life), but the wording itself may be a later " +
      "paraphrase or a line from a secondary source rather than Augustine's own.",
  },
  {
    title: "Goodwill Compensates for the Lack of Success",
    occasion:
      "Written to his companions from Somasca, where Jerome Emiliani ran orphanages and hospitals for children left destitute by war, plague and famine in northern Italy. He died in 1537 of a disease caught from the sick he was nursing.",
    kind: "quote",
    tags: ["perseverance", "work"],
    source: "Letter 5, §4",
    author: "St. Jerome Emiliani",
    year: "16th century (d. 1537)",
    origin: "Founder of the Somaschi Fathers — patron of orphans and abandoned children",
    liturgical: "",
    feastDay: "February 8",
    originalLanguage: "",
    favorite: false,
    body:
      "Therefore, having done what you could, the Lord will be satisfied with you because for Him, " +
      "who is the most benign, goodwill compensates for the lack of success.",
    background:
      "From one of his own surviving letters — a genuinely well-documented citation, unlike several " +
      "others on this list. Jerome Emiliani (1486–1537) spent his life caring for orphans and abandoned " +
      "children in plague- and famine-ravaged northern Italy after his own conversion following capture " +
      "and imprisonment as a soldier; this line reflects a man used to work whose outcomes he couldn't " +
      "control or guarantee.",
  },
  {
    title: "Do Your Best and Leave the Rest",
    occasion:
      "From his letters of spiritual direction, written for lay people prone to scrupulosity about their own efforts.",
    kind: "quote",
    tags: ["trust", "perseverance"],
    source: "Consistent with Introduction to the Devout Life; exact phrase not found verbatim",
    author: "St. Francis de Sales",
    year: "17th century",
    origin: "Salesian spirituality",
    liturgical: "",
    feastDay: "January 24",
    originalLanguage: "",
    favorite: false,
    body:
      "Do your best and leave the rest to God. Do not lose your peace over your imperfections, but " +
      "immediately look to God with confidence.",
    background:
      "The sentiment matches Introduction to the Devout Life closely — de Sales repeatedly tells his " +
      "reader to work diligently at her own affairs while refusing anxious over-attachment to the " +
      "outcome — but I could not find this exact wording verbatim in the searchable text, so it may be a " +
      "later paraphrase of his teaching rather than a direct quotation.",
  },
  {
    title: "Work as if Everything Depended on You",
    occasion:
      "The wording comes from Gabriel Hevenesi's Scintillae Ignatianae (1705), a collection summarising Ignatian principles some 150 years after Ignatius died. The ordering is often reversed in circulation.",
    kind: "quote",
    tags: ["work", "trust"],
    source: "Cited in the Catechism of the Catholic Church, §2834, referencing Joseph de Guibert's The Jesuits",
    author: "St. Ignatius of Loyola",
    authorNote: "cited in the Catechism, but no direct source in his own writings",
    year: "16th century (tradition)",
    origin: "Ignatian",
    liturgical: "",
    feastDay: "July 31",
    originalLanguage: "",
    favorite: true,
    body: "Work as if everything depended on you. Pray as if everything depended on God.",
    background:
      "Attributed to Ignatius in an official Church document — it's cited at CCC §2834 — yet no direct " +
      "line to it exists in his own surviving writings; some 19th-century sources call it simply 'an old " +
      "saying' without naming an author, which raises real doubt about a clean 16th-century Jesuit " +
      "origin. There's a related, better-attested formulation closer to his actual voice: 'Let your " +
      "first rule of action be to trust in God as if success depended entirely on yourself and not on " +
      "him; but use all your efforts as if God alone did everything, and yourself nothing' — which " +
      "reverses the famous version's logic in an interesting way (trust as if it's all on you, effort as " +
      "if it's all on God, rather than the other way round).",
  },
  {
    title: "God Does Not Require Us to Succeed",
    occasion:
      "Said to co-workers and volunteers discouraged by the scale of what they were facing in Calcutta.",
    kind: "quote",
    tags: ["perseverance", "faithfulness"],
    source: "The Joy in Loving: A Guide to Daily Living (compiled from her sayings)",
    author: "St. Teresa of Calcutta (Mother Teresa)",
    year: "20th century",
    origin: "Missionaries of Charity",
    liturgical: "",
    feastDay: "September 5",
    originalLanguage: "",
    favorite: false,
    body: "God doesn't require us to succeed, He only requires that you try.",
    background:
      "Appears, in slightly different wordings, across several published compilations of her sayings " +
      "(one close variant: 'God does not require that we be successful, only that we be faithful') — " +
      "consistent with how much of her material survives as transcribed talks rather than a single fixed " +
      "text, so treat the exact phrasing as approximate even though the sentiment is reliably hers.",
  },
  {
    title: "Every Saint Became a Saint Through Mental Prayer",
    occasion:
      "From his writing on prayer, of a piece with the argument of The Great Means of Salvation that mental prayer is the ordinary channel of grace rather than an advanced option.",
    kind: "quote",
    tags: ["prayer"],
    source: "The Great Means of Salvation and of Perfection",
    author: "St. Alphonsus Liguori",
    related: ["Night Prayer"],
    year: "18th century",
    origin: "Redemptorist",
    liturgical: "",
    feastDay: "August 1",
    originalLanguage: "",
    favorite: false,
    body:
      "All the saints became saints because of mental prayer... We know from experience that it is " +
      "far from easy for a person who practices mental prayer to fall into mortal sin.",
    background:
      "From Alphonsus Liguori's own published work on prayer — one of the better-documented citations in " +
      "this batch. 'Mental prayer' here means quiet, unstructured reflective prayer (as opposed to vocal, " +
      "formula-based prayer) — his claim isn't that mental prayer replaces virtue, but that it's " +
      "practically inseparable from it: he's making an empirical claim about what actually keeps people " +
      "out of serious sin, not just a pious generalization.",
  },
  {
    title: "Escape from Your Everyday Business",
    kind: "prayer",
    tags: ["contemplation"],
    source: "Proslogion, Chapter 1",
    author: "St. Anselm of Canterbury",
    year: "c. 1077–1078",
    origin: "Benedictine",
    liturgical: "",
    feastDay: "April 21",
    originalLanguage: "",
    favorite: false,
    body:
      "Insignificant man, escape from your everyday business for a short while, hide yourself for a " +
      "moment from your restless thoughts. Break off from your cares and troubles and turn to God. " +
      "Enter into the inner chamber of your mind. Shut out all things except God and those things which " +
      "can help you in seeking Him, and when you have shut the door, say with your whole heart to God: " +
      "I seek Your face; Your face, O Lord, I desire.",
    background:
      "The opening of Anselm's Proslogion, the short treatise where he goes on to develop his famous " +
      "'ontological argument' for God's existence — but before any of that philosophical apparatus, the " +
      "book actually opens like this: not an argument, but an exhortation to withdraw and pray, addressed " +
      "to 'homuncio,' literally 'little man' or 'insignificant man.' Worth knowing given how the book is " +
      "usually taught (as pure logic) that Anselm himself frames the whole argument as something that " +
      "only makes sense from inside prayer, not before it.",
  },
  {
    title: "Fasting Cleanses the Soul",
    occasion:
      "From Augustine's preaching on fasting to his congregation at Hippo, most of whom were doing it as a matter of course in Lent.",
    kind: "quote",
    tags: ["fasting"],
    source: "A sermon of St. Augustine (De orat. et Jejun.), quoted at length by St. Thomas Aquinas, Summa Theologiae II-II, Q.147",
    author: "St. Augustine of Hippo",
    authorNote: "commonly misattributed directly to St. Thomas Aquinas, who only quotes it",
    year: "4th–5th century (Augustine); quoted by Aquinas, 13th century",
    origin: "Patristic",
    liturgical: "Lent",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Fasting cleanses the soul, raises the mind, subjects one's flesh to the spirit, renders the " +
      "heart contrite and humble, scatters the clouds of concupiscence, quenches the fire of lust, and " +
      "kindles the true light of chastity.",
    background:
      "A good example of how attribution drifts: this line is Augustine's, from one of his sermons on " +
      "prayer and fasting, but Aquinas quotes it approvingly and at length in his own question on fasting " +
      "in the Summa Theologiae (II-II, Q.147) — and because Aquinas's citation is where most people " +
      "encounter it today, it's very often given as a straight Aquinas quote rather than Aquinas citing " +
      "someone else, the way it actually happened.",
  },
  {
    title: "Late Have I Loved You",
    occasion:
      "From Book X of the Confessions, looking back on the years in which he had searched for God everywhere except where God already was.",
    kind: "quote",
    tags: ["love", "conversion"],
    source: "Confessions, Book X, Chapter 27",
    author: "St. Augustine of Hippo",
    year: "c. 397–400",
    origin: "Patristic",
    liturgical: "",
    feastDay: "August 28",
    originalLanguage: "",
    favorite: true,
    body:
      "Late have I loved You, O Beauty ever ancient, ever new, late have I loved You! You were within " +
      "me, but I was outside myself, and there I sought You. Let me find You now within, and let all the " +
      "world fall away. Amen.",
    background:
      "From late in the Confessions (Book X), well past the conversion narrative itself — Augustine is " +
      "looking back at the whole shape of his search for God and locating the actual problem precisely: " +
      "not God's distance, but his own. 'You were within me, but I was outside myself' is doing the real " +
      "work of the passage — the seeking was misdirected outward the whole time, toward exactly the kind " +
      "of restless external searching the opening line of the Confessions ('our heart is restless until " +
      "it rests in you,' also in this library) had already diagnosed.",
  },
  {
    title: "Prayer Before the Crucifix",
    kind: "prayer",
    tags: ["Franciscan", "faith", "hope", "charity"],
    source: "Recorded in the margins of two early manuscripts of the Legend of the Three Companions",
    author: "St. Francis of Assisi",
    year: "c. 1205–1206",
    origin: "Franciscan",
    liturgical: "",
    feastDay: "October 4",
    originalLanguage: "",
    favorite: true,
    body:
      "Most High, glorious God,\n" +
      "enlighten the darkness of my heart\n" +
      "and give me true faith, certain hope, and perfect charity,\n" +
      "sense and knowledge, Lord,\n" +
      "that I may carry out Your holy and true command.\n" +
      "Amen.",
    background:
      "Unlike the 'Peace Prayer' also attributed to Francis elsewhere (and deliberately excluded from " +
      "this library as a known 20th-century misattribution), this one has a real claim to authenticity: " +
      "Franciscan scholars trace it to Francis himself, connected to the pivotal early moment in his " +
      "conversion when, praying before the crucifix in the ruined chapel of San Damiano near Assisi " +
      "(around 1205–1206), he reported hearing Christ speak to him — 'Francis, go and rebuild my house.' " +
      "That crucifix and that moment are what set his whole later life in motion; this prayer is the one " +
      "the early Franciscan sources actually place in his mouth there.",
  },
  {
    title: "Lenten Prayer of St. Ephrem",
    kind: "prayer",
    tags: ["Lent", "repentance", "humility"],
    source: "Byzantine Rite Lenten liturgy — oldest surviving Greek texts in 9th–10th century euchologia (service books)",
    author: "St. Ephrem the Syrian",
    authorNote: "attributed; the earliest surviving liturgical text postdates his life by 500+ years",
    year: "Ephrem d. 373; earliest surviving text 9th–10th century",
    origin: "Byzantine / Eastern Christian — Great Lent",
    liturgical: "Great Lent — daily Vespers, Compline, and the Little Hours, Clean Monday through Holy Wednesday",
    feastDay: "June 9 (Doctor of the Church, Roman calendar)",
    originalLanguage: "",
    favorite: false,
    body:
      "O Lord and Master of my life, take from me the spirit of sloth, despair, lust of power, and idle talk.\n\n" +
      "But give rather the spirit of chastity, humility, patience, and love to Thy servant.\n\n" +
      "Yea, O Lord and King, grant me to see my own transgressions, and not to judge my brother, for blessed art Thou, unto ages of ages. Amen.",
    background:
      "In the Byzantine Rite — used by both the Eastern Orthodox and the Eastern Catholic churches — " +
      "this is considered the Lenten prayer par excellence, prayed at nearly every weekday service " +
      "throughout Great Lent (skipped on Saturdays, Sundays, and certain feasts), traditionally with " +
      "three full prostrations, one after each of its two halves and a third after the final petition. " +
      "It's attributed to St. Ephrem the Syrian (c. 306–373), a deacon, hymnographer, and Doctor of the " +
      "Church known as the 'Harp of the Spirit' for his enormous body of Syriac hymnody — but the oldest " +
      "surviving Greek liturgical texts of this specific prayer only appear in euchologia (service books) " +
      "from the 9th and 10th centuries, over 500 years after his death, so the exact path from his own " +
      "Syriac writing to this Greek liturgical text isn't fully documented. It's much less used in Western " +
      "Latin practice than in the Christian East, where it functions as Lent's structural rhythm.",
  },
  {
    title: "Prayer Before Mass",
    kind: "prayer",
    tags: ["eucharist", "Mass", "preparation"],
    source: "The CTS New Sunday Missal; traditionally titled Oratio Sancti Thomae Aquinatis ante Missam",
    author: "St. Thomas Aquinas, O.P.",
    related: ["Tantum Ergo", "Panis Angelicus"],
    authorNote: "English translations vary in wording slightly between missals",
    year: "13th century (c. 1264, contemporaneous with his other Eucharistic works)",
    origin: "Dominican",
    liturgical: "Before Mass / before receiving Communion",
    feastDay: "January 28",
    originalLanguage: "Latin",
    favorite: true,
    latinBody:
      "Omnipotens sempiterne Deus, ecce, accedo ad sacramentum unigeniti Filii tui, Domini nostri Iesu " +
      "Christi; accedo tamquam infirmus ad medicum vitae, immundus ad fontem misericordiae, caecus ad " +
      "lumen claritatis aeternae, pauper et egenus ad Dominum caeli et terrae.\n\n" +
      "Rogo ergo immensae largitatis tuae abundantiam, quatenus meam curare digneris infirmitatem, " +
      "lavare foeditatem, illuminare caecitatem, ditare paupertatem, vestire nuditatem: ut panem " +
      "Angelorum, Regem regum et Dominum dominantium, tanta suscipiam reverentia et humilitate, tanta " +
      "contritione et devotione, tanta puritate et fide, tali proposito et intentione, sicut expedit " +
      "saluti animae meae. Amen.",
    body:
      "Almighty and ever-living God, I draw near to the sacrament of your only-begotten Son, our Lord " +
      "Jesus Christ. I come sick to the physician of life, unclean to the fountain of mercy, blind to " +
      "the light of eternal brightness, poor and needy to the Lord of heaven and earth.\n\n" +
      "So I ask you, most generous Lord: graciously heal my infirmity, wash me clean, illumine my " +
      "blindness, enrich my poverty, and clothe my nakedness. May I receive the Bread of angels, the " +
      "King of kings, and Lord of lords, with such reverence and humility, such contrition and " +
      "devotion, such purity and faith, and such resolve and determination as may secure my soul's " +
      "salvation. Amen.",
    background:
      "One of a pair of prayers traditionally credited to Aquinas for framing the Mass — this one " +
      "before, and a companion 'Prayer After Mass' giving thanks afterward (not included here). The " +
      "Eucharist was the center of his own life and theology, not just his intellectual work: alongside " +
      "the great Eucharistic hymns also in this library (Tantum Ergo, Panis Angelicus), tradition holds " +
      "that during periods of difficult theological writing he would lean his head against the " +
      "tabernacle in prayer for insight. The prayer's own structure moves through four honest images of " +
      "need before Christ — sick before the physician, unclean before the fountain of mercy, blind " +
      "before the light, poor before the Lord of all — before asking to be healed, cleansed, " +
      "illumined, and enriched in each respect.",
  },
  {
    title: "The Measure of Love",
    occasion:
      "From On Loving God, written for Haimeric, chancellor of the Roman Church, who had asked Bernard why and how God should be loved.",
    kind: "quote",
    tags: ["love"],
    source: "Popular paraphrase of a line from On Loving God (De Diligendo Deo), ch. 1, c. 1132–1135",
    author: "St. Bernard of Clairvaux",
    related: ["Memorare"],
    authorNote: "sometimes also misattributed to St. Augustine, without a documented source",
    year: "12th century (treatise c. 1132–1135)",
    origin: "Cistercian",
    liturgical: "",
    feastDay: "August 20",
    originalLanguage: "",
    favorite: true,
    body: "The measure of love is to love without measure.",
    background:
      "The popular English form doesn't map to one exact sentence in Bernard's actual treatise — it's a " +
      "condensed, catchier paraphrase. The line it's paraphrasing, from the opening chapter of On Loving " +
      "God, where he takes up the question of why and how much God should be loved, reads (in the " +
      "standard Christian Classics Ethereal Library translation): 'the measure of love due to Him is " +
      "immeasurable love.' Worth noting Bernard's own point was specifically about love owed to God, not " +
      "a general statement about love between people, though the popular paraphrase gets quoted in both " +
      "senses today. It's also sometimes floated as an Augustine quote online, without any documented " +
      "source in his actual writings — a mix-up in the same family as the Memorare's Bernard/Bernard " +
      "confusion elsewhere in this library, except here the two names being confused are Bernard and " +
      "Augustine rather than two different men named Bernard.",
  },
  {
    title: "A Visit of the Holy Spirit",
    occasion:
      "From his catechetical instructions at Ars, teaching villagers to recognise grace in ordinary interior movements rather than in extraordinary events.",
    kind: "quote",
    tags: ["Holy Spirit", "prayer"],
    source: "Widely attested in compilations of his catechetical sermons; no primary manuscript pinned",
    author: "St. John Vianney",
    related: ["Come, Holy Spirit"],
    year: "19th century",
    origin: "Diocesan priest — patron of parish priests",
    liturgical: "",
    feastDay: "August 4",
    originalLanguage: "",
    favorite: false,
    body: "When good thoughts come to us, it is a visit of the Holy Spirit.",
    background:
      "Like almost everything attributed to Vianney (the Curé of Ars), this survives through the notes " +
      "of parishioners and pilgrims who wrote down his catechism talks and sermons, not through anything " +
      "he set out to publish himself — he wasn't a writer by inclination, and spent most of his priesthood " +
      "hearing confessions for up to sixteen hours a day rather than at a desk. The line makes a small " +
      "but real claim: that an unbidden good thought isn't neutral or self-generated, but something to " +
      "notice as a kind of visitation.",
  },
  {
    title: "The Intrepid Eagle",
    occasion:
      "From his catechetical instructions at Ars — an image drawn, like most of his, from birds and animals his farming parishioners saw every day.",
    kind: "quote",
    tags: ["prayer"],
    source: "On the Joys of the Interior Life (devotional compilation); no primary manuscript pinned",
    author: "St. John Vianney",
    year: "19th century",
    origin: "Diocesan priest — patron of parish priests",
    liturgical: "",
    feastDay: "August 4",
    originalLanguage: "",
    favorite: false,
    body: "He who does not pray is like a hen or a turkey that cannot rise into the air. He who prays is like an intrepid eagle!",
    background:
      "Vianney served a small, poor rural parish at Ars for his entire priesthood, and his surviving " +
      "sayings are full of exactly this kind of concrete barnyard imagery rather than abstract theology — " +
      "he was talking to farmers, not scholars. The contrast he's drawing isn't about talent or effort; a " +
      "hen and an eagle are both birds, built the same way in principle, but only one actually uses what " +
      "it has to rise.",
  },
  {
    title: "The First Moment of the Day",
    occasion:
      "From his instructions at Ars on how the day should begin, given to people whose work started before dawn.",
    kind: "quote",
    tags: ["morning", "prayer"],
    source: "Widely attested in compilations of his sayings; no primary manuscript pinned",
    author: "St. John Vianney",
    related: ["Morning Offering", "Night Prayer"],
    year: "19th century",
    origin: "Diocesan priest — patron of parish priests",
    liturgical: "",
    feastDay: "August 4",
    originalLanguage: "",
    favorite: true,
    body:
      "We must take great care never to do anything before having said our morning prayers. The Devil " +
      "once declared that if he could have the first moment of the day, he was sure of all the rest.",
    background:
      "Same category as Vianney's other sayings here — widely and consistently attributed, without a " +
      "pinned original manuscript source. The claim is a practical one about sequencing rather than " +
      "willpower: not that the rest of the day is doomed without prayer, but that whatever gets the very " +
      "first moment tends to set the terms for what follows — a fairly direct match for the same instinct " +
      "behind a Morning Offering said on waking, before anything else.",
  },
  {
    title: "Night Prayer",
    kind: "prayer",
    tags: ["evening", "protection"],
    source: "Widely and consistently attributed across compilations of his prayers; no single manuscript pinned",
    author: "St. Alphonsus Liguori",
    related: ["Morning Offering", "Every Saint Became a Saint Through Mental Prayer"],
    year: "18th century",
    origin: "Redemptorist",
    liturgical: "Night, before sleep",
    feastDay: "August 1",
    originalLanguage: "",
    favorite: true,
    body:
      "Lord Jesus Christ, my God, I adore Thee and thank Thee for all the blessings which Thou hast " +
      "conferred upon me this day. I offer Thee my rest and all the moments of this night, and I beseech " +
      "Thee to preserve me from sin. Therefore I place myself in the most sacred wound of Thy side, and " +
      "under the protecting mantle of Mary my Mother. May Thy holy angels assist me and preserve me in " +
      "peace. May Thy blessing be upon me forever more. Amen.",
    background:
      "One of a large number of short devotional prayers attributed to Alphonsus Liguori (also the " +
      "author of 'Every Saint Became a Saint Through Mental Prayer,' already in this library, and of the " +
      "treatise The Great Means of Salvation, where that line is actually pinned to a page) — Alphonsus " +
      "wrote so prolifically on prayer and devotion that many individual prayers circulate under his name " +
      "in compilations without a single traceable manuscript source, this one included. Structurally it's " +
      "a night-time counterpart to the Morning Offering: naming the day just past, handing over the " +
      "coming hours of sleep specifically, and asking protection through the night rather than for " +
      "anything beyond it — a natural close to an evening chain of prayer.",
  },
  {
    title: "Tu scendi dalle stelle (You Come Down from the Stars)",
    kind: "hymn",
    tags: ["Christmas", "Nativity"],
    source: "Based on the Neapolitan folk song 'Quanno nascette Ninno'; standard Italian version later popularized in the 19th century",
    author: "St. Alphonsus Liguori",
    year: "Traditionally 1732 (at Deliceto) or 1754 (at Nola, as bishop) — exact date and place disputed by scholars",
    origin: "Redemptorist — Neapolitan folk-hymn tradition",
    liturgical: "Christmas",
    feastDay: "August 1",
    originalLanguage: "Italian",
    favorite: true,
    latinBody:
      "Tu scendi dalle stelle,\n" +
      "O Re del Cielo,\n" +
      "e vieni in una grotta\n" +
      "al freddo e al gelo.\n\n" +
      "A te, che sei del mondo\n" +
      "il Creatore,\n" +
      "mancano panni e fuoco;\n" +
      "O mio Signore!",
    body:
      "You come down from the stars,\n" +
      "O King of Heaven,\n" +
      "and come to a grotto\n" +
      "in the cold and the frost.\n\n" +
      "You, who are the Creator\n" +
      "of the world,\n" +
      "lack clothes and fire;\n" +
      "O my Lord!",
    background:
      "Still Italy's best-loved Christmas carol, written by Alphonsus Liguori — better known in this " +
      "library for weightier theological works like The Great Means of Salvation — for poor shepherds in " +
      "rural Puglia who couldn't read, which is why it first existed in Neapolitan dialect ('Quanno " +
      "nascette Ninno') rather than literary Italian, built on an existing folk tune. Scholars disagree on " +
      "exactly when and where he wrote it — 1732 at the Convent of the Consolation in Deliceto, or 1754 " +
      "in Nola while he was bishop there, possibly writing both a dialect and a standard-Italian version " +
      "at once. The full hymn runs to seven verses, considerably less purely joyful than its popularity " +
      "suggests — most of it dwells on the sacrifice of a King choosing utter poverty and cold, not just " +
      "the scene of the manger — and what's given here is its well-known, most commonly sung opening, not " +
      "the complete text.",
  },
  {
    title: "Christ in the Beggar",
    kind: "quote",
    tags: ["charity", "eucharist", "justice", "the poor"],
    source: "Widely attributed; the same argument is documented in his Homily 50 on Matthew, 3–4 (PG 58, 508–509)",
    author: "St. John Chrysostom",
    related: ["Prayer Before Mass", "The Works of Mercy"],
    authorNote: "this exact wording is not traceable to a specific homily — see background",
    year: "4th century",
    origin: "Patristic",
    liturgical: "",
    feastDay: "September 13",
    originalLanguage: "",
    favorite: true,
    body: "If you cannot find Christ in the beggar at the church door, you will not find Him in the chalice.",
    background:
      "The wording everyone quotes cannot be pinned to a particular homily, so treat it as a compressed " +
      "version of Chrysostom rather than a verbatim line — but unlike several other famous 'quotes' in " +
      "this library, this one is not a misattribution: the argument is unmistakably his, and he makes it " +
      "at length, with the same chalice image, in his Homily 50 on Matthew. There he asks: 'Of what use " +
      "is it to weigh down Christ's table with golden cups, when he himself is dying of hunger? First, " +
      "fill him when he is hungry; then use the means you have left to adorn his table' — adding that God " +
      "wants not golden chalices but golden souls, and that your brother in distress 'is more properly a " +
      "temple' than the building you are decorating. The logic is that the Christ of Matthew 25 ('you saw " +
      "me hungry') and the Christ of the altar are the same person, so honouring one while stepping over " +
      "the other is not devotion but a contradiction. He preached this in Antioch and Constantinople to " +
      "congregations wealthy enough for it to sting, which is a fair part of why he ended up twice exiled " +
      "and died on a forced march.",
  },
  {
    title: "Litany of St. Joseph",
    kind: "litany",
    tags: ["St. Joseph", "vocation", "work", "protection", "discernment"],
    source: "Approved for public use by Pope St. Pius X, 1909; seven invocations added by Pope Francis, 1 May 2021",
    author: "Traditional / Anonymous",
    related: ["Litany of the Undiscovered Spouse", "Litany of the Most Precious Blood", "Litany of Loreto", "Litany of the Saints"],
    authorNote: "no single author — the invocations accumulated over centuries and were formally fixed in 1909",
    year: "Approved 1909; current form since 2021",
    origin: "Approved devotional litany",
    liturgical: "St. Joseph's feasts (19 March, 1 May); traditionally prayed by those seeking a spouse or work",
    feastDay: "March 19 (Solemnity); May 1 (St. Joseph the Worker)",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord, have mercy.\n" +
      "Christ, have mercy.\n" +
      "Lord, have mercy.\n" +
      "Christ, hear us.\n" +
      "Christ, graciously hear us.\n\n" +
      "God the Father of Heaven, have mercy on us.\n" +
      "God the Son, Redeemer of the world, have mercy on us.\n" +
      "God the Holy Spirit, have mercy on us.\n" +
      "Holy Trinity, one God, have mercy on us.\n\n" +
      "Holy Mary, pray for us.\n" +
      "St. Joseph, pray for us.\n" +
      "Renowned offspring of David, pray for us.\n" +
      "Light of Patriarchs, pray for us.\n" +
      "Spouse of the Mother of God, pray for us.\n" +
      "Guardian of the Redeemer, pray for us.\n" +
      "Chaste guardian of the Virgin, pray for us.\n" +
      "Foster father of the Son of God, pray for us.\n" +
      "Diligent protector of Christ, pray for us.\n" +
      "Servant of Christ, pray for us.\n" +
      "Minister of salvation, pray for us.\n" +
      "Head of the Holy Family, pray for us.\n" +
      "Joseph most just, pray for us.\n" +
      "Joseph most chaste, pray for us.\n" +
      "Joseph most prudent, pray for us.\n" +
      "Joseph most strong, pray for us.\n" +
      "Joseph most obedient, pray for us.\n" +
      "Joseph most faithful, pray for us.\n" +
      "Mirror of patience, pray for us.\n" +
      "Lover of poverty, pray for us.\n" +
      "Model of workers, pray for us.\n" +
      "Glory of family life, pray for us.\n" +
      "Guardian of virgins, pray for us.\n" +
      "Pillar of families, pray for us.\n" +
      "Support in difficulties, pray for us.\n" +
      "Solace of the wretched, pray for us.\n" +
      "Hope of the sick, pray for us.\n" +
      "Patron of exiles, pray for us.\n" +
      "Patron of the afflicted, pray for us.\n" +
      "Patron of the poor, pray for us.\n" +
      "Patron of the dying, pray for us.\n" +
      "Terror of demons, pray for us.\n" +
      "Protector of Holy Church, pray for us.\n\n" +
      "Lamb of God, who takes away the sins of the world, spare us, O Lord.\n" +
      "Lamb of God, who takes away the sins of the world, graciously hear us, O Lord.\n" +
      "Lamb of God, who takes away the sins of the world, have mercy on us.\n\n" +
      "V. He made him the lord of His household.\n" +
      "R. And prince over all His possessions.\n\n" +
      "Let us pray:\n" +
      "O God, in Your ineffable providence You were pleased to choose Blessed Joseph to be the spouse of " +
      "Your most holy Mother; grant, we beg You, that we may be worthy to have him for our intercessor in " +
      "heaven whom on earth we venerate as our Protector: You who live and reign forever and ever. Amen.",
    background:
      "The oldest and only formally approved litany in this library — the other three here (Humility, " +
      "Trust, Chastity) are all modern private compositions. Its invocations accumulated over centuries " +
      "of devotion before Pope St. Pius X fixed the text and approved it for public use in 1909. It is " +
      "the Church's actual litany for those seeking a spouse: Joseph is invoked under the titles 'Spouse " +
      "of the Mother of God,' 'Head of the Holy Family' and 'Pillar of families,' and the closing collect " +
      "asks precisely on the grounds that God chose him as husband to Mary. It is equally the litany for " +
      "work and provision ('Model of workers'), which is why the second Josephite feast is 1 May.\n\n" +
      "The text changed recently. On 1 May 2021, during the Year of St. Joseph, Pope Francis added seven " +
      "new invocations, drawn mainly from modern papal writing on Joseph — including John Paul II's 1989 " +
      "Redemptoris Custos, which supplies 'Guardian of the Redeemer.' The seven are: Guardian of the " +
      "Redeemer, Servant of Christ, Minister of salvation, Support in difficulties, Patron of exiles, " +
      "Patron of the afflicted, and Patron of the poor. The version here is the current post-2021 text, " +
      "so older printed cards and books will be missing those lines.\n\n" +
      "'Terror of demons' is the invocation people tend to stop at, and it is genuinely old — the logic " +
      "is not that Joseph was a warrior but that a quiet, obedient, chaste life is what the devil cannot " +
      "work with.",
  },
  {
    title: "Litany of the Undiscovered Spouse",
    kind: "litany",
    tags: ["spouse", "discernment", "singleness", "marriage", "waiting"],
    source: "Circulates as a shared image; transcribed from a carousel posted by @juliannarvivas on Instagram",
    author: "Traditional / Anonymous",
    related: ["Litany of St. Joseph", "Litany of Humility", "Litany of Trust"],
    authorNote: "modern and unattributed — no author, no approval; see background before praying it",
    year: "Contemporary (2020s); no earlier source traceable",
    origin: "Modern devotional — private composition",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord, have mercy.\n" +
      "Christ, have mercy.\n" +
      "Lord, have mercy.\n\n" +
      "Jesus, hear us.\n" +
      "Jesus, graciously hear us.\n\n" +
      "From the belief that I have missed the moment, deliver me, Jesus.\n" +
      "From discouragement in the waiting, deliver me, Jesus.\n" +
      "From the lie that there is no one for me, deliver me, Jesus.\n" +
      "From the temptation to settle for less than I am made for, deliver me, Jesus.\n" +
      "From the temptation to orchestrate my own love story, deliver me, Jesus.\n" +
      "From the lie that my desires will go unfulfilled, deliver me, Jesus.\n" +
      "From the lie that I must change to be loved, deliver me, Jesus.\n" +
      "From the lie that I can earn real love, deliver me, Jesus.\n" +
      "From idolizing relationship and marriage, deliver me, Jesus.\n" +
      "From neglecting the grace of my season of singleness, deliver me, Jesus.\n\n" +
      "For the grace of our future together:\n\n" +
      "That I may know in peace the call to another, we ask You, Jesus.\n" +
      "That we may recognize one another when our paths meet, we ask You, Jesus.\n" +
      "That we may be healed from past relationships and lingering \"what-ifs,\" we ask You, Jesus.\n" +
      "That we may love one another well and in truth, we ask You, Jesus.\n" +
      "That we may cherish one another with reverence and purity, we ask You, Jesus.\n" +
      "That we may keep our gaze fixed on heaven, we ask You, Jesus.\n" +
      "That we may remain united especially in suffering, we ask You, Jesus.\n" +
      "That we may rest in the security of real love, we ask You, Jesus.\n" +
      "That we may treasure and respect each other's whole person, we ask You, Jesus.\n" +
      "That we may never forget You as the life of our relationship, we ask You, Jesus.\n\n" +
      "For the formation of our hearts:\n\n" +
      "For hearts steadfast in unwavering loyalty, we ask You, Jesus.\n" +
      "For hearts willing to suffer for love, we ask You, Jesus.\n" +
      "For hearts equally yoked and intentionally matched, we ask You, Jesus.\n" +
      "For hearts that correct in gentleness and truth, we ask You, Jesus.\n" +
      "For hearts that glorify Your love in union, we ask You, Jesus.\n\n" +
      "Lamb of God, who takes away the sins of the world, spare us, O Lord.\n" +
      "Lamb of God, who takes away the sins of the world, graciously hear us, O Lord.\n" +
      "Lamb of God, who takes away the sins of the world, have mercy on us.\n\n" +
      "Let us pray:\n" +
      "Lord Jesus, Bridegroom of our souls, form my heart in trust, patience, and hope. Prepare both me " +
      "and the spouse You desire for me in Your perfect time. Heal what is broken, strengthen what is " +
      "weak, and purify what is wounded, so that our love may glorify You now and forever.\n\n" +
      "Amen.",
    background:
      "Recorded here verbatim, exactly as it circulates — no line has been altered, including one that is " +
      "theologically loose (see below). This is a transcription of an artefact, not an edited text.\n\n" +
      "PROVENANCE. Unusually for anything in this library, it has essentially none. It spreads as a " +
      "graphic — words baked into an image, which is why no amount of searching finds it as text — and " +
      "the copy transcribed here comes from a carousel by the Instagram account @juliannarvivas, which " +
      "presents it simply as 'an extra litany you can pray' alongside several novenas. No author, no " +
      "imprimatur, no institutional source, and the phrase 'undiscovered spouse' appears nowhere in the " +
      "Church's devotional vocabulary. Treat it as a recent private composition of unknown origin.\n\n" +
      "SOUNDNESS. Better than the provenance suggests. Whoever wrote it knew the form: the Kyrie opening, " +
      "'Jesus, hear us / graciously hear us,' a deliverance section, two petition sections, the threefold " +
      "Agnus Dei with its correct responses, then 'Let us pray' and a collect — the same architecture as " +
      "the Litany of Humility and the Litany of Trust. Nothing in it is heretical or superstitious, and " +
      "crucially it makes no promises: none of the 'pray this and your spouse will appear' machinery that " +
      "usually marks the genre. Two petitions are the ones this kind of prayer normally omits and are " +
      "what keep it honest — 'From idolizing relationship and marriage' and 'From neglecting the grace of " +
      "my season of singleness.' It clears the bar the Church actually sets for private devotion: free of " +
      "error and superstition. It is not approved for public or liturgical use, and does not claim to be.\n\n" +
      "TWO CAVEATS WORTH KNOWING. First, it presumes the vocation. Every petition assumes a spouse exists " +
      "and will be found, which makes this a marriage-preparation prayer rather than a discernment " +
      "prayer; if the question of marriage versus another path is genuinely still open, praying it daily " +
      "quietly settles that question in advance. Second, the line 'From the lie that there is no one for " +
      "me' leans on soulmate theology the Church does not teach — there is no predestined person, and for " +
      "someone called to celibacy the statement is not a lie but simply true, so the petition asks " +
      "deliverance from possibly believing something factual. Note that the litany's three other 'From " +
      "the lie that...' petitions are precise, since those propositions really are false. If you want the " +
      "line to hold, the fix is to move it off the question of whether a spouse exists and onto the real " +
      "spiritual danger, which is despair of God's care: 'From the fear that I am forgotten, deliver me, " +
      "Jesus' — true whichever way a vocation resolves. 'From the lie that I am beyond Your care' keeps " +
      "the original rhythm and works for the same reason.\n\n" +
      "For a version of this intention with actual provenance, the Litany of St. Joseph is also in this " +
      "library: formally approved in 1909, and the Church's own litany for those seeking a spouse.",
  },
  {
    title: "You — What Have You Done?",
    kind: "quote",
    tags: ["chastity", "purity", "mortification", "examination"],
    source: "The Way, no. 143 (chapter: Holy Purity)",
    author: "St. Josemaría Escrivá",
    related: ["Litany of Chastity", "The Little Duty of Each Moment", "Don't Let Your Life Be Sterile"],
    year: "1930s (first published 1934/1939)",
    origin: "Opus Dei",
    liturgical: "",
    feastDay: "June 26",
    originalLanguage: "",
    favorite: false,
    body:
      "To defend his purity, St. Francis of Assisi rolled in the snow, St. Benedict threw himself into a " +
      "thorn bush, St. Bernard plunged into an icy pond… You — what have you done?",
    background:
      "From the 'Holy Purity' chapter of The Way, Escrivá's collection of short numbered maxims — the " +
      "same book as the two other Escrivá entries in this library, though this one works very " +
      "differently from them. It is built entirely to land on its last four words: three saints, three " +
      "violent acts, and then the ellipsis turning on the reader. It is one of the more confronting " +
      "points in the book, and deliberately so.\n\n" +
      "The three stories are traditional hagiography, and worth knowing they are not equally " +
      "documented. Benedict throwing himself into briars comes from Book II of St. Gregory the Great's " +
      "Dialogues, which is essentially the sole source for anything known about Benedict's life at all. " +
      "Francis rolling in the snow comes from the early Franciscan sources — in the fuller telling he " +
      "also builds figures out of the snow and tells himself they are the family he would have had. " +
      "Bernard plunging into a frozen pond comes from his early Lives. All three are the kind of story " +
      "that accumulates around a saint rather than the kind independently attested, so read them as " +
      "what the tradition holds up rather than as reportage.\n\n" +
      "The point is not really the snow or the thorns. Escrivá's whole project was that holiness belongs " +
      "in ordinary secular life rather than the cloister, so the implied answer is not that you should " +
      "find a thorn bush — it is that the reader has probably not paid any comparable price, in any " +
      "currency at all, for something he claims to value.",
  },
  {
    title: "O Mad Lover",
    kind: "quote",
    tags: ["love", "Dominican", "Trinity"],
    source: "The Dialogue, from the closing prayer — trans. Suzanne Noffke, O.P.",
    author: "St. Catherine of Siena",
    related: ["Love Undefiled", "Prayer to the Holy Spirit", "Set Fire to All Italy"],
    year: "The Dialogue dictated 1377–78",
    origin: "Dominican",
    liturgical: "",
    feastDay: "April 29",
    originalLanguage: "",
    favorite: true,
    body:
      "O eternal, infinite Good! O mad lover! And have you need of your creature? It seems so to me… " +
      "Why then are you so mad? Because you have fallen in love with what you have made!",
    background:
      "From the closing prayer of The Dialogue, Catherine's major work, dictated to secretaries in " +
      "1377–78 — much of it, by the accounts of those present, while she was in ecstasy. The English " +
      "here is Suzanne Noffke, O.P.'s translation, the same translator behind the two prayers of hers " +
      "already in this library.\n\n" +
      "The Italian behind 'mad lover' is 'pazzo d'amore' — literally crazed, out of one's mind, with " +
      "love. It is not a decorative flourish: Catherine is pressing an argument to its uncomfortable " +
      "end. God, being God, needs nothing. Yet He behaves — she says — exactly as though He could not " +
      "live without a creature who owes Him her existence in the first place. She can find no cause for " +
      "this proportionate to the effect, and the conclusion she lands on is not that He is generous or " +
      "merciful but that He is out of His mind, having fallen in love with something He Himself made.\n\n" +
      "Worth knowing when hunting the citation: 'O mad lover' recurs in The Dialogue and is not a single " +
      "famous line — another passage runs 'O mad lover! It was not enough for you to take on our " +
      "humanity, you had to die as well!' This entry is the one about God's love for creation " +
      "specifically. Chapter numbering varies between editions and translations, so the closing prayer " +
      "is cited here by position rather than by a number that would only be right for one edition.",
  },
  {
    title: "The Miracle Prayer",
    kind: "prayer",
    tags: ["healing", "repentance", "surrender", "conversion"],
    source: "Text of the Miracle Prayer © 1993 Fr. Peter M. Rookey and Servite Fathers, O.S.M.",
    author: "Fr. Peter Mary Rookey, O.S.M.",
    authorNote: "not a saint — a 20th-century Servite priest (1916–2014); the text is under copyright, reproduced here with its notice",
    related: ["Act of Contrition", "The Seven Sorrows of Mary"],
    relatedSaints: ["peregrine-laziosi"],
    year: "1993",
    origin: "Servite (Order of the Servants of Mary)",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord Jesus, I come before You, just as I am, I am sorry for my sins, I repent of my sins, please " +
      "forgive me. In Your Name, I forgive all others for what they have done against me. I renounce " +
      "satan, the evil spirits and all their works. I give You my entire self, Lord Jesus, now and " +
      "forever. I invite You into my life, Jesus. I accept You as my Lord, God and Savior. Heal me, " +
      "change me, strengthen me in body, soul, and spirit.\n\n" +
      "Come Lord Jesus, cover me with Your Precious Blood, and fill me with Your Holy Spirit. I love You " +
      "Lord Jesus. I praise You Jesus. I thank You Jesus. I shall follow You every day of my life. Amen.\n\n" +
      "Mary, my Mother, Queen of Peace, St. Peregrine, the cancer saint, all the Angels and Saints, " +
      "please help me. Amen.",
    background:
      "Composed in 1993 by Fr. Peter Mary Rookey, O.S.M. (1916–2014), an American Servite priest widely " +
      "known for a public healing ministry he exercised from 1948 onward. It is unusual in this library " +
      "on two counts: the author is a modern priest rather than a saint or an anonymous tradition, and " +
      "the text carries an explicit copyright, kept here in the source line as every reputable " +
      "reproduction of it does.\n\n" +
      "The name oversells what the text actually is. Despite 'Miracle Prayer' and its association with a " +
      "healing ministry, the prayer itself is not a request for a wonder and attaches no promise or " +
      "condition — no counts, no novena arithmetic, nothing guaranteed in exchange. Structurally it is a " +
      "straightforward act of conversion, and a well-ordered one: repentance first, then forgiving " +
      "others before asking anything for oneself, then renunciation of evil, then self-surrender and " +
      "invitation, and only at the end the petition for healing of body, soul and spirit. That ordering " +
      "is the substance of it; read on the page it sits much closer to the Act of Contrition than to the " +
      "genre its title suggests.\n\n" +
      "The closing invocation reflects the author's own order. St. Peregrine Laziosi was a Servite friar " +
      "whose reported cure of a cancerous leg made him the traditional patron of cancer patients, which " +
      "is why a Servite prayer ends by naming him alongside Our Lady, Queen of Peace.",
  },
  {
    title: "I Cannot, I Must Not, I Will Not",
    kind: "quote",
    tags: ["conscience", "courage", "martyrdom", "obedience"],
    source: "His reply to General Miollis, Rome, 1810, refusing the oath of allegiance to Napoleon",
    author: "St. Gaspar del Bufalo",
    relatedSaints: ["gaspar-del-bufalo"],
    related: ["Be Not Afraid", "Litany of the Most Precious Blood"],
    year: "1810",
    origin: "Missionaries of the Precious Blood (C.PP.S.)",
    liturgical: "",
    feastDay: "October 21",
    originalLanguage: "Italian",
    favorite: true,
    latinBody: "Non posso, non debbo, non voglio.",
    body: "I cannot, I must not, I will not.",
    background:
      "Spoken in Rome in 1810. Napoleon had annexed the Papal States and imprisoned Pius VII, and was " +
      "requiring the Roman clergy to swear an oath of allegiance to himself; the Pope had forbidden it. " +
      "Summoned before General Miollis, the French military governor, and worked on with both threats " +
      "and inducements, Gaspar — then twenty-four and only four years ordained — gave this answer, and " +
      "it is the sentence he is remembered by.\n\n" +
      "The three verbs are doing distinct work, which is why the line survived: 'non posso' (I am not " +
      "able), 'non debbo' (I ought not — the moral obligation), 'non voglio' (I do not will it — the " +
      "personal act). Refusal at the level of capacity, of duty, and of will, closing off in turn every " +
      "escape route a frightened man might reach for.\n\n" +
      "It cost him four years. He was banished from Rome and then imprisoned in the dungeons of Imola " +
      "and Rocca until Napoleon's fall in 1814. He is not a martyr — he survived, returned, and went on " +
      "to found the Missionaries of the Precious Blood — which arguably makes the line more useful than " +
      "a martyr's would be: he had to live afterwards with what refusing had cost him, and did.\n\n" +
      "Longer English versions circulate, typically prefacing it with something like 'I would rather die " +
      "or suffer evil than take such an oath.' What is actually documented is the Italian triple.",
  },
  {
    title: "Litany of the Most Precious Blood",
    kind: "litany",
    tags: ["Precious Blood", "redemption", "eucharist", "approved"],
    source: "Drawn up by the Sacred Congregation of Rites; promulgated by Pope John XXIII, 24 February 1960",
    author: "Traditional / Anonymous",
    authorNote: "one of only six litanies approved for public liturgical use",
    related: ["Litany of St. Joseph", "I Cannot, I Must Not, I Will Not", "Litany of Loreto", "Litany of the Saints", "Litany of the Sacred Heart"],
    relatedSaints: ["gaspar-del-bufalo"],
    year: "Promulgated 1960",
    origin: "Approved devotional litany",
    liturgical: "July — the month of the Precious Blood",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord, have mercy.\n" +
      "Christ, have mercy.\n" +
      "Lord, have mercy.\n" +
      "Christ, hear us.\n" +
      "Christ, graciously hear us.\n\n" +
      "God the Father of Heaven, have mercy on us.\n" +
      "God the Son, Redeemer of the world, have mercy on us.\n" +
      "God the Holy Spirit, have mercy on us.\n" +
      "Holy Trinity, one God, have mercy on us.\n\n" +
      "Blood of Christ, only-begotten Son of the Eternal Father, save us.\n" +
      "Blood of Christ, Incarnate Word of God, save us.\n" +
      "Blood of Christ, of the New and Eternal Testament, save us.\n" +
      "Blood of Christ, falling upon the earth in the Agony, save us.\n" +
      "Blood of Christ, shed profusely in the Scourging, save us.\n" +
      "Blood of Christ, flowing forth in the Crowning with Thorns, save us.\n" +
      "Blood of Christ, poured out on the Cross, save us.\n" +
      "Blood of Christ, price of our salvation, save us.\n" +
      "Blood of Christ, without which there is no forgiveness, save us.\n" +
      "Blood of Christ, Eucharistic drink and refreshment of souls, save us.\n" +
      "Blood of Christ, stream of mercy, save us.\n" +
      "Blood of Christ, victor over demons, save us.\n" +
      "Blood of Christ, courage of Martyrs, save us.\n" +
      "Blood of Christ, strength of Confessors, save us.\n" +
      "Blood of Christ, bringing forth Virgins, save us.\n" +
      "Blood of Christ, help of those in peril, save us.\n" +
      "Blood of Christ, relief of the burdened, save us.\n" +
      "Blood of Christ, solace in sorrow, save us.\n" +
      "Blood of Christ, hope of the penitent, save us.\n" +
      "Blood of Christ, consolation of the dying, save us.\n" +
      "Blood of Christ, peace and tenderness of hearts, save us.\n" +
      "Blood of Christ, pledge of Eternal Life, save us.\n" +
      "Blood of Christ, freeing souls from purgatory, save us.\n" +
      "Blood of Christ, most worthy of all glory and honour, save us.\n\n" +
      "Lamb of God, who takest away the sins of the world, spare us, O Lord.\n" +
      "Lamb of God, who takest away the sins of the world, graciously hear us, O Lord.\n" +
      "Lamb of God, who takest away the sins of the world, have mercy on us.\n\n" +
      "V. Thou hast redeemed us, O Lord, in Thy Blood.\n" +
      "R. And made us, for our God, a kingdom.\n\n" +
      "Let us pray:\n" +
      "Almighty and eternal God, Thou hast appointed Thine only-begotten Son the Redeemer of the world " +
      "and willed to be appeased by His Blood. Grant, we beg of Thee, that we may worthily adore this " +
      "price of our salvation and through its power be safeguarded from the evils of the present life so " +
      "that we may rejoice in its fruits forever in heaven. Through the same Christ our Lord. Amen.",
    background:
      "The second formally approved litany in this library, alongside the Litany of St. Joseph — and one " +
      "of only six the Church has ever approved for public liturgical use — the others being the Holy " +
      "Name, the Sacred Heart, Loreto, St. Joseph and the Saints. It is the most recent of the six: drawn up by " +
      "the Sacred Congregation of Rites and promulgated by Pope John XXIII on 24 February 1960, so where " +
      "the others accumulated over centuries this one was composed deliberately, in living memory.\n\n" +
      "Its structure is unlike the other litanies here. There are no petitions asking to be delivered " +
      "from anything and no list of titles for a saint — instead twenty-four invocations that all name " +
      "the same thing, the Blood, and simply say 'save us.' They move in order: through the Incarnation, " +
      "then the Passion in sequence (the Agony, the Scourging, the Crowning with Thorns, the Cross), then " +
      "what the Blood accomplishes (price, forgiveness, Eucharist, mercy), then who it reaches — martyrs, " +
      "confessors, virgins, those in peril, the burdened, the sorrowing, the penitent, the dying, and " +
      "finally the souls in purgatory. It is a single image held up and turned twenty-four times.\n\n" +
      "July is traditionally the month of the Precious Blood. The devotion's great modern promoter was " +
      "St. Gaspar del Bufalo, also in this library, who founded the Missionaries of the Precious Blood " +
      "after the four years of exile and imprisonment he accepted rather than swear Napoleon's oath.",
  },
  {
    title: "Litany of Loreto",
    kind: "litany",
    seedVersion: 2,
    tags: ["Marian", "approved", "intercession"],
    source: "Litany of the Blessed Virgin Mary — text as published by the Holy See; approved for public use by Sixtus V, 1587",
    author: "Traditional / Anonymous",
    authorNote: "one of only six litanies approved for public liturgical use; invocations added by successive popes",
    related: ["Litany of St. Joseph", "Litany of the Most Precious Blood", "Salve Regina", "The Angelus", "Litany of the Saints", "Litany of the Sacred Heart"],
    relatedSaints: ["mary"],
    year: "In use at Loreto by the 16th century; approved 1587; last additions 2020",
    origin: "Approved devotional litany",
    liturgical: "May and October; traditionally prayed after the Rosary",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord, have mercy.\n" +
      "Christ, have mercy.\n" +
      "Lord, have mercy.\n" +
      "Christ, hear us.\n" +
      "Christ, graciously hear us.\n\n" +
      "God, the Father of heaven, have mercy on us.\n" +
      "God the Son, Redeemer of the world, have mercy on us.\n" +
      "God the Holy Spirit, have mercy on us.\n" +
      "Holy Trinity, one God, have mercy on us.\n\n" +
      "Holy Mary, pray for us.\n" +
      "Holy Mother of God, pray for us.\n" +
      "Holy Virgin of virgins, pray for us.\n" +
      "Mother of Christ, pray for us.\n" +
      "Mother of the Church, pray for us.\n" +
      "Mother of Mercy, pray for us.\n" +
      "Mother of divine grace, pray for us.\n" +
      "Mother of Hope, pray for us.\n" +
      "Mother most pure, pray for us.\n" +
      "Mother most chaste, pray for us.\n" +
      "Mother inviolate, pray for us.\n" +
      "Mother undefiled, pray for us.\n" +
      "Mother most amiable, pray for us.\n" +
      "Mother most admirable, pray for us.\n" +
      "Mother of good counsel, pray for us.\n" +
      "Mother of our Creator, pray for us.\n" +
      "Mother of our Saviour, pray for us.\n" +
      "Virgin most prudent, pray for us.\n" +
      "Virgin most venerable, pray for us.\n" +
      "Virgin most renowned, pray for us.\n" +
      "Virgin most powerful, pray for us.\n" +
      "Virgin most merciful, pray for us.\n" +
      "Virgin most faithful, pray for us.\n" +
      "Mirror of justice, pray for us.\n" +
      "Seat of wisdom, pray for us.\n" +
      "Cause of our joy, pray for us.\n" +
      "Spiritual vessel, pray for us.\n" +
      "Vessel of honour, pray for us.\n" +
      "Singular vessel of devotion, pray for us.\n" +
      "Mystical rose, pray for us.\n" +
      "Tower of David, pray for us.\n" +
      "Tower of ivory, pray for us.\n" +
      "House of gold, pray for us.\n" +
      "Ark of the covenant, pray for us.\n" +
      "Gate of heaven, pray for us.\n" +
      "Morning star, pray for us.\n" +
      "Health of the sick, pray for us.\n" +
      "Refuge of sinners, pray for us.\n" +
      "Solace of Migrants, pray for us.\n" +
      "Comfort of the afflicted, pray for us.\n" +
      "Help of Christians, pray for us.\n" +
      "Queen of Angels, pray for us.\n" +
      "Queen of Patriarchs, pray for us.\n" +
      "Queen of Prophets, pray for us.\n" +
      "Queen of Apostles, pray for us.\n" +
      "Queen of Martyrs, pray for us.\n" +
      "Queen of Confessors, pray for us.\n" +
      "Queen of Virgins, pray for us.\n" +
      "Queen of all Saints, pray for us.\n" +
      "Queen conceived without original sin, pray for us.\n" +
      "Queen assumed into heaven, pray for us.\n" +
      "Queen of the most holy Rosary, pray for us.\n" +
      "Queen of families, pray for us.\n" +
      "Queen of peace, pray for us.\n" +
      "\n" +
      "Lamb of God, who takes away the sins of the world, spare us, O Lord.\n" +
      "Lamb of God, who takes away the sins of the world, graciously hear us, O Lord.\n" +
      "Lamb of God, who takes away the sins of the world, have mercy on us.\n\n" +
      "V. Pray for us, O holy Mother of God.\n" +
      "R. That we may be made worthy of the promises of Christ.\n\n" +
      "Let us pray:\n" +
      "Grant, we beseech Thee, O Lord God, that we Thy servants may enjoy perpetual health of mind and " +
      "body; and by the glorious intercession of the Blessed Mary, ever Virgin, be delivered from present " +
      "sorrow, and obtain eternal joy. Through Christ our Lord. Amen.",
    background:
      "The Marian litany, named for the shrine at Loreto where it was in use by the 16th century and " +
      "approved for public use by Sixtus V in 1587. The third of the six approved litanies now in this " +
      "library, alongside St. Joseph and the Precious Blood.\n\n" +
      "Its most striking feature is that it has kept growing, and the layers can be dated — popes added " +
      "invocations at moments that mattered to them:\n" +
      "• 1854 — Queen conceived without original sin (Pius IX, on defining the Immaculate Conception)\n" +
      "• 1883 — Queen of the most holy Rosary (Leo XIII)\n" +
      "• 1903 — Mother of good counsel (Leo XIII)\n" +
      "• 1917 — Queen of peace (Benedict XV, during the First World War)\n" +
      "• 1950 — Queen assumed into heaven (Pius XII, on defining the Assumption)\n" +
      "• 1980 — Mother of the Church (John Paul II)\n" +
      "• 1995 — Queen of families (John Paul II)\n" +
      "• 2020 — Mother of Mercy · Mother of Hope · Solace of Migrants (Francis)\n" +
      "\n" +
      "All of the above are present in the text here. The litany is in effect a sedimentary record of " +
      "what the Church has most needed to say about Mary in each age.\n\n" +
      "Structurally it moves in blocks: Mother, then Virgin, then the biblical and symbolic images " +
      "(Mirror of justice, Tower of ivory, Ark of the covenant — mostly drawn from the Song of Songs, " +
      "Proverbs and the Psalms read Marianly), then those she helps, then Queen. Fifty-four invocations " +
      "in all.",
  },
  {
    title: "Litany of the Saints",
    kind: "litany",
    tags: ["approved", "intercession", "communion of saints"],
    source: "Traditional form, from the Roman Ritual — public domain. See the note on the modern liturgical text below",
    author: "Traditional / Anonymous",
    authorNote: "the oldest of the six approved litanies; its core dates to the early Church",
    related: ["Litany of Loreto", "Litany of St. Joseph", "Litany of the Most Precious Blood"],
    year: "Core in use by the 6th–7th century; this form from the Roman Ritual",
    origin: "Approved devotional litany",
    liturgical: "Easter Vigil, ordinations, religious profession, consecration of churches; Rogation Days",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord, have mercy on us.\n" +
      "Christ, have mercy on us.\n" +
      "Lord, have mercy on us.\n" +
      "Christ, hear us.\n" +
      "Christ, graciously hear us.\n\n" +
      "God the Father of heaven, have mercy on us.\n" +
      "God the Son, Redeemer of the world, have mercy on us.\n" +
      "God the Holy Ghost, have mercy on us.\n" +
      "Holy Trinity, one God, have mercy on us.\n\n" +
      "Holy Mary, pray for us.\n" +
      "Holy Mother of God, pray for us.\n" +
      "Holy Virgin of virgins, pray for us.\n" +
      "St. Michael, pray for us.\n" +
      "St. Gabriel, pray for us.\n" +
      "St. Raphael, pray for us.\n" +
      "All ye holy Angels and Archangels, pray for us.\n" +
      "All ye holy orders of blessed Spirits, pray for us.\n" +
      "St. John the Baptist, pray for us.\n" +
      "St. Joseph, pray for us.\n" +
      "All ye holy Patriarchs and Prophets, pray for us.\n" +
      "St. Peter, pray for us.\n" +
      "St. Paul, pray for us.\n" +
      "St. Andrew, pray for us.\n" +
      "St. James, pray for us.\n" +
      "St. John, pray for us.\n" +
      "St. Thomas, pray for us.\n" +
      "St. James, pray for us.\n" +
      "St. Philip, pray for us.\n" +
      "St. Bartholomew, pray for us.\n" +
      "St. Matthew, pray for us.\n" +
      "St. Simon, pray for us.\n" +
      "St. Thaddeus, pray for us.\n" +
      "St. Matthias, pray for us.\n" +
      "St. Barnabas, pray for us.\n" +
      "St. Luke, pray for us.\n" +
      "St. Mark, pray for us.\n" +
      "All ye holy Apostles and Evangelists, pray for us.\n" +
      "All ye holy Disciples of the Lord, pray for us.\n" +
      "All ye holy Innocents, pray for us.\n" +
      "St. Stephen, pray for us.\n" +
      "St. Lawrence, pray for us.\n" +
      "St. Vincent, pray for us.\n" +
      "Ss. Fabian and Sebastian, pray for us.\n" +
      "Ss. John and Paul, pray for us.\n" +
      "Ss. Cosmas and Damian, pray for us.\n" +
      "Ss. Gervase and Protase, pray for us.\n" +
      "All ye holy Martyrs, pray for us.\n" +
      "St. Sylvester, pray for us.\n" +
      "St. Gregory, pray for us.\n" +
      "St. Ambrose, pray for us.\n" +
      "St. Augustine, pray for us.\n" +
      "St. Jerome, pray for us.\n" +
      "St. Martin, pray for us.\n" +
      "St. Nicholas, pray for us.\n" +
      "All ye holy Bishops and Confessors, pray for us.\n" +
      "All ye holy Doctors, pray for us.\n" +
      "St. Anthony, pray for us.\n" +
      "St. Benedict, pray for us.\n" +
      "St. Bernard, pray for us.\n" +
      "St. Dominic, pray for us.\n" +
      "St. Francis, pray for us.\n" +
      "All ye holy Priests and Levites, pray for us.\n" +
      "All ye holy Monks and Hermits, pray for us.\n" +
      "St. Mary Magdalen, pray for us.\n" +
      "St. Agatha, pray for us.\n" +
      "St. Lucy, pray for us.\n" +
      "St. Agnes, pray for us.\n" +
      "St. Cecilia, pray for us.\n" +
      "St. Catherine, pray for us.\n" +
      "St. Anastasia, pray for us.\n" +
      "All ye holy Virgins and Widows, pray for us.\n" +
      "All ye Holy Saints of God, make intercession for us.\n\n" +
      "Be merciful, spare us, O Lord.\n" +
      "Be merciful, graciously hear us, O Lord.\n\n" +
      "From all evil, O Lord deliver us.\n" +
      "From all sin, O Lord deliver us.\n" +
      "From Thy wrath, O Lord deliver us.\n" +
      "From sudden and unprovided death, O Lord deliver us.\n" +
      "From the snares of the devil, O Lord deliver us.\n" +
      "From anger, hatred, and all ill will, O Lord deliver us.\n" +
      "From the spirit of fornication, O Lord deliver us.\n" +
      "From lightning and tempest, O Lord deliver us.\n" +
      "From the scourge of earthquake, O Lord deliver us.\n" +
      "From plague, famine, and war, O Lord deliver us.\n" +
      "From everlasting death, O Lord deliver us.\n" +
      "Through the mystery of Thy holy Incarnation, O Lord deliver us.\n" +
      "Through Thy Coming, O Lord deliver us.\n" +
      "Through Thy Nativity, O Lord deliver us.\n" +
      "Through Thy Baptism and holy Fasting, O Lord deliver us.\n" +
      "Through Thy Cross and Passion, O Lord deliver us.\n" +
      "Through Thy Death and Burial, O Lord deliver us.\n" +
      "Through Thy holy Resurrection, O Lord deliver us.\n" +
      "Through Thine admirable Ascension, O Lord deliver us.\n" +
      "Through the coming of the Holy Ghost, the Paraclete, O Lord deliver us.\n" +
      "In the day of judgment, O Lord deliver us.\n" +
      "\nWe sinners, we beseech Thee, hear us.\n" +
      "That Thou wouldst spare us, we beseech Thee, hear us.\n" +
      "That Thou wouldst pardon us, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to bring us to true penance, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to govern and preserve Thy holy Church, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to preserve our Apostolic Prelate, and all ecclesiastical orders in holy religion, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to humble the enemies of holy Church, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to grant peace and unity to all Christian people, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to bring back to the unity of the Church all those who have strayed, and to lead all unbelievers to the light of the Gospel, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to confirm and preserve us in Thy holy service, we beseech Thee, hear us.\n" +
      "That Thou wouldst lift up our minds to heavenly desires, we beseech Thee, hear us.\n" +
      "That Thou wouldst render eternal blessings to all our benefactors, we beseech Thee, hear us.\n" +
      "That Thou wouldst deliver our souls, and those of our brethren, relations, and benefactors, from eternal damnation, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to give and preserve the fruits of the earth, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe to give eternal rest to all the faithful departed, we beseech Thee, hear us.\n" +
      "That Thou wouldst vouchsafe graciously to hear us, we beseech Thee, hear us.\n" +
      "Son of God, we beseech Thee, hear us.\n\n" +
      "Lamb of God, who takest away the sins of the world, spare us, O Lord.\n" +
      "Lamb of God, who takest away the sins of the world, graciously hear us, O Lord.\n" +
      "Lamb of God, who takest away the sins of the world, have mercy on us.\n\n" +
      "Christ, hear us.\n" +
      "Christ, graciously hear us.\n\n" +
      "Lord, have mercy on us.\n" +
      "Lord, have mercy on us.",
    background:
      "The oldest of the six litanies approved for public use, and the model every other litany in this " +
      "library imitates — the Kyrie opening, the ranked invocations, the Agnus Dei close all begin here. " +
      "Its core was in use by the 6th–7th century, and it is the only litany the Church still uses at the " +
      "great hinge moments of her life: the Easter Vigil, ordinations, religious profession, and the " +
      "consecration of a church.\n\n" +
      "One thing to know about the text. The version here is the TRADITIONAL form from the Roman Ritual, " +
      "which is public domain. The form used in the current liturgy is differently ordered and somewhat " +
      "shorter, and its official English translation is held under copyright by ICEL — which is why this " +
      "entry uses the older text rather than reproducing the modern one on a publicly hosted page. The " +
      "substance is the same; the wording and the saint list differ.\n\n" +
      "The saint list is deliberately extensible. In liturgical use, local and national saints are " +
      "inserted at the appropriate rank, and the patron of the church or the person being ordained is " +
      "added — so an England and Wales celebration will name Alban, Augustine of Canterbury, Bede, " +
      "George, David and the Martyrs alongside these. That adaptability is the point: the litany is a " +
      "roll-call of the household, and every household adds its own.\n\n" +
      "Note also its structure, which is unlike the later litanies. It is in four movements — the saints " +
      "are asked to pray; then God is asked to deliver, first from evils and then BY the mysteries of " +
      "Christ's life (an unusual move: pleading the Incarnation, Cross and Resurrection as grounds); " +
      "then a long list of petitions for the Church and the world; then the Agnus Dei.",
  },
  {
    title: "Litany of the Holy Name of Jesus",
    kind: "litany",
    tags: ["Holy Name", "approved", "Jesus"],
    source: "Traditional form; approved for public use by Leo XIII, 1886",
    author: "Traditional / Anonymous",
    authorNote: "roots in the 15th-century preaching of St. Bernardine of Siena and St. John Capistrano",
    related: ["Litany of the Saints", "Litany of Loreto", "Litany of St. Joseph", "Litany of the Most Precious Blood", "Litany of the Sacred Heart"],
    year: "Devotion 15th century; litany approved 1886",
    origin: "Approved devotional litany",
    liturgical: "January — the month of the Holy Name; 3 January, the Most Holy Name of Jesus",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord, have mercy on us.\n" +
      "Christ, have mercy on us.\n" +
      "Lord, have mercy on us.\n" +
      "Jesus, hear us.\n" +
      "Jesus, graciously hear us.\n\n" +
      "God the Father of heaven, have mercy on us.\n" +
      "God the Son, Redeemer of the world, have mercy on us.\n" +
      "God the Holy Ghost, have mercy on us.\n" +
      "Holy Trinity, one God, have mercy on us.\n\n" +
      "Jesus, Son of the living God, have mercy on us.\n" +
      "Jesus, splendour of the Father, have mercy on us.\n" +
      "Jesus, brightness of eternal light, have mercy on us.\n" +
      "Jesus, King of glory, have mercy on us.\n" +
      "Jesus, sun of justice, have mercy on us.\n" +
      "Jesus, Son of the Virgin Mary, have mercy on us.\n" +
      "Jesus, most amiable, have mercy on us.\n" +
      "Jesus, most admirable, have mercy on us.\n" +
      "Jesus, mighty God, have mercy on us.\n" +
      "Jesus, Father of the world to come, have mercy on us.\n" +
      "Jesus, angel of great counsel, have mercy on us.\n" +
      "Jesus, most powerful, have mercy on us.\n" +
      "Jesus, most patient, have mercy on us.\n" +
      "Jesus, most obedient, have mercy on us.\n" +
      "Jesus, meek and humble of heart, have mercy on us.\n" +
      "Jesus, lover of chastity, have mercy on us.\n" +
      "Jesus, lover of us, have mercy on us.\n" +
      "Jesus, God of peace, have mercy on us.\n" +
      "Jesus, author of life, have mercy on us.\n" +
      "Jesus, model of virtues, have mercy on us.\n" +
      "Jesus, zealous for souls, have mercy on us.\n" +
      "Jesus, our God, have mercy on us.\n" +
      "Jesus, our refuge, have mercy on us.\n" +
      "Jesus, father of the poor, have mercy on us.\n" +
      "Jesus, treasure of the faithful, have mercy on us.\n" +
      "Jesus, good Shepherd, have mercy on us.\n" +
      "Jesus, true light, have mercy on us.\n" +
      "Jesus, eternal wisdom, have mercy on us.\n" +
      "Jesus, infinite goodness, have mercy on us.\n" +
      "Jesus, our way and our life, have mercy on us.\n" +
      "Jesus, joy of the Angels, have mercy on us.\n" +
      "Jesus, King of the Patriarchs, have mercy on us.\n" +
      "Jesus, Master of the Apostles, have mercy on us.\n" +
      "Jesus, teacher of the Evangelists, have mercy on us.\n" +
      "Jesus, strength of Martyrs, have mercy on us.\n" +
      "Jesus, light of Confessors, have mercy on us.\n" +
      "Jesus, purity of Virgins, have mercy on us.\n" +
      "Jesus, crown of all Saints, have mercy on us.\n" +
      "\nBe merciful, spare us, O Jesus.\n" +
      "Be merciful, graciously hear us, O Jesus.\n\n" +
      "From all evil, Jesus, deliver us.\n" +
      "From all sin, Jesus, deliver us.\n" +
      "From Thy wrath, Jesus, deliver us.\n" +
      "From the snares of the devil, Jesus, deliver us.\n" +
      "From the spirit of fornication, Jesus, deliver us.\n" +
      "From everlasting death, Jesus, deliver us.\n" +
      "From the neglect of Thine inspirations, Jesus, deliver us.\n" +
      "Through the mystery of Thy holy Incarnation, Jesus, deliver us.\n" +
      "Through Thy Nativity, Jesus, deliver us.\n" +
      "Through Thine Infancy, Jesus, deliver us.\n" +
      "Through Thy most divine Life, Jesus, deliver us.\n" +
      "Through Thy labours, Jesus, deliver us.\n" +
      "Through Thine agony and passion, Jesus, deliver us.\n" +
      "Through Thy cross and dereliction, Jesus, deliver us.\n" +
      "Through Thy sufferings, Jesus, deliver us.\n" +
      "Through Thy death and burial, Jesus, deliver us.\n" +
      "Through Thy Resurrection, Jesus, deliver us.\n" +
      "Through Thine Ascension, Jesus, deliver us.\n" +
      "Through Thine institution of the Most Holy Eucharist, Jesus, deliver us.\n" +
      "Through Thy joys, Jesus, deliver us.\n" +
      "Through Thy glory, Jesus, deliver us.\n" +
      "\nLamb of God, who takest away the sins of the world, spare us, O Jesus.\n" +
      "Lamb of God, who takest away the sins of the world, graciously hear us, O Jesus.\n" +
      "Lamb of God, who takest away the sins of the world, have mercy on us, O Jesus.\n\n" +
      "Jesus, hear us.\n" +
      "Jesus, graciously hear us.\n\n" +
      "Let us pray:\n" +
      "O Lord Jesus Christ, who hast said: Ask and you shall receive, seek and you shall find, knock " +
      "and it shall be opened to you; grant, we beseech Thee, to us who ask, the gift of Thy most " +
      "divine love, that we may ever love Thee with all our hearts, and in all our words and actions, " +
      "and never cease from showing forth Thy praise. Make us, O Lord, to have both a perpetual fear " +
      "and love of Thy holy Name; for Thou never failest to govern those whom Thou dost solidly " +
      "establish in Thy love. Who livest and reignest world without end. Amen.",
    background:
      "The fourth of the six approved litanies now in this library, with the Saints, Loreto, St. Joseph " +
      "and the Precious Blood. Approved for public use by Leo XIII in 1886, though the devotion behind " +
      "it is much older: the 15th-century preaching of St. Bernardine of Siena and St. John Capistrano, " +
      "who carried the IHS monogram through Italian towns and made the Name itself the object of " +
      "devotion.\n\n" +
      "The shape is worth noticing. Where Loreto piles up titles for Mary and the Precious Blood turns " +
      "one image twenty-four times, this one simply says the Name again and again — thirty-eight times " +
      "in the invocations alone — on the premise that the Name is itself the prayer. That is the whole " +
      "logic of the devotion: Philippians 2:10, that at the name of Jesus every knee should bend.\n\n" +
      "A note on this text: the fetchable sources kept returning the structure rather than the full " +
      "list of invocations, so this was assembled from the standard traditional (pre-1886 English) " +
      "wording, which is fixed and public domain. It is worth a spot-check against a printed missal if " +
      "precision matters to you — the ordering of the middle invocations varies slightly between " +
      "editions.",
  },
  {
    title: "The Rosary",
    kind: "prayer",
    seedVersion: 2,
    tags: ["Marian", "Rosary", "meditation", "daily"],
    source: "Structure of the Rosary; the Luminous Mysteries added by John Paul II, Rosarium Virginis Mariae, 2002",
    author: "Traditional / Anonymous",
    authorNote: "the Dominican attribution to St. Dominic is devotional tradition, not documented history",
    related: ["Hail Mary", "Our Father", "Glory Be", "Salve Regina", "Apostles' Creed", "Litany of Loreto"],
    relatedSaints: ["mary", "dominic"],
    year: "Developed 12th–16th century; current form since 2002",
    origin: "Dominican",
    liturgical: "October — the month of the Rosary; 7 October, Our Lady of the Rosary",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body:
      "HOW TO PRAY IT\n1. Make the Sign of the Cross.\n2. Holding the crucifix, say the Apostles' Creed.\n3. On the first bead, an Our Father.\n4. On the next three beads, three Hail Marys — for faith, hope and charity.\n5. A Glory Be.\n6. Announce the first mystery, then an Our Father.\n7. On each of the ten beads, a Hail Mary while holding the mystery in mind.\n8. A Glory Be, then the Fatima Prayer.\n9. Announce the next mystery and repeat, through all five decades.\n10. Close with the Hail Holy Queen and the closing prayer.\n\nTHE FATIMA PRAYER\nO my Jesus, forgive us our sins, save us from the fires of hell, lead all souls to Heaven, especially those in most need of Thy mercy.\n\nTHE JOYFUL MYSTERIES — MONDAY AND SATURDAY\n1. The Annunciation — Luke 1:26–38\n2. The Visitation — Luke 1:39–56\n3. The Nativity — Luke 2:1–20\n4. The Presentation in the Temple — Luke 2:22–38\n5. The Finding of Jesus in the Temple — Luke 2:41–52\n\nTHE LUMINOUS MYSTERIES — THURSDAY\n1. The Baptism of Jesus in the Jordan — Matthew 3:13–17\n2. The Wedding at Cana — John 2:1–11\n3. The Proclamation of the Kingdom — Mark 1:14–15\n4. The Transfiguration — Luke 9:28–36\n5. The Institution of the Eucharist — Matthew 26:26–29\n\nTHE SORROWFUL MYSTERIES — TUESDAY AND FRIDAY\n1. The Agony in the Garden — Luke 22:39–46\n2. The Scourging at the Pillar — John 19:1\n3. The Crowning with Thorns — Matthew 27:27–31\n4. The Carrying of the Cross — Luke 23:26–32\n5. The Crucifixion and Death — Luke 23:33–46\n\nTHE GLORIOUS MYSTERIES — WEDNESDAY AND SUNDAY\n1. The Resurrection — Matthew 28:1–10\n2. The Ascension — Acts 1:6–11\n3. The Descent of the Holy Spirit — Acts 2:1–13\n4. The Assumption of Our Lady — Revelation 12:1; Judith 13:18–20\n5. The Coronation of Our Lady — Revelation 12:1\n\nST. LOUIS DE MONTFORT'S METHOD\nHis second method adds a word or two after the name of Jesus in every Hail Mary of the decade, so that the mystery is held in mind while the words are said:\n\nJoyful\n1. …Jesus incarnate.\n2. …Jesus sanctifying.\n3. …Jesus born in poverty.\n4. …Jesus sacrificed.\n5. …Jesus, Saint among Saints.\n\nSorrowful\n1. …Jesus in His agony.\n2. …Jesus scourged.\n3. …Jesus crowned with thorns.\n4. …Jesus carrying His Cross.\n5. …Jesus crucified.\n\nGlorious\n1. …Jesus risen from the dead.\n2. …Jesus ascending to Heaven.\n3. …Jesus filling Thee with the Holy Spirit.\n4. …Jesus raising Thee up.\n5. …Jesus crowning Thee.\n\nMontfort gives no words for the Luminous Mysteries — he died in 1716, and they were not proposed until 2002.",
    background:
      "The structure rather than the words — the individual prayers (Our Father, Hail Mary, Glory Be, " +
      "Apostles' Creed, Salve Regina) each have their own entry here, and this is the frame that holds " +
      "them. Fifty Hail Marys across five decades, each decade held against one scene from the life of " +
      "Christ, so the repeated words occupy the mouth while the mind looks at something.\n\n" +
      "On origins: the tradition that Our Lady gave the Rosary to St. Dominic in 1214 is devotional " +
      "rather than documented — the form we have grew gradually between the 12th and 16th centuries " +
      "out of the monastic practice of praying 150 psalms, which the unlettered replaced with 150 Hail " +
      "Marys. The Dominicans genuinely did spread it, which is where the association is earned. Pius V, " +
      "a Dominican, fixed the form in 1569.\n\n" +
      "The Luminous Mysteries are new: John Paul II proposed them in 2002 (Rosarium Virginis Mariae) to " +
      "fill the gap between the Nativity and the Passion — Christ's public ministry had no place in the " +
      "older fifteen. They are optional, and anything printed before 2002 will not have them.\n\n" +
      "ST. LOUIS DE MONTFORT'S THE SECRET OF THE ROSARY is the classic book on it, and its structure is " +
      "itself an image: fifty-three short chapters, each called a Rose, offered as a bouquet. The three " +
      "that open it are addressed to different readers —\n" +
      "• the White Rose, to priests\n" +
      "• the Red Rose, to sinners\n" +
      "• the Mystical Rose Tree, to devout souls\n" +
      "\n" +
      "then Part One on what the Rosary is, and Part Two on how to say it. His governing image is that " +
      "praying it devoutly places a crown on the heads of Jesus and Mary — a hundred and fifty-three " +
      "red roses and sixteen white, being the Hail Marys and Our Fathers of the full fifteen decades. " +
      "Montfort died in 1716, so his Rosary has no Luminous Mysteries.",
  },
  {
    title: "The Stations of the Cross",
    kind: "prayer",
    tags: ["Passion", "Lent", "meditation", "Way of the Cross"],
    source: "The Way of the Cross of St. Alphonsus Liguori — the standard form since the 18th century",
    author: "St. Alphonsus Liguori",
    authorNote: "the devotion is older; Liguori wrote the meditations that became the standard text",
    related: ["Night Prayer", "Tu scendi dalle stelle (You Come Down from the Stars)", "Every Saint Became a Saint Through Mental Prayer", "The Rosary", "The Seven Last Words", "The Five Wounds", "The Seven Sorrows of Mary", "Stabat Mater"],
    relatedSaints: ["alphonsus-liguori"],
    year: "Liguori's text, 18th century; the devotion itself medieval",
    origin: "Franciscan in origin; Liguori's version Redemptorist",
    liturgical: "Lent, especially Fridays; Good Friday",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body:
      "OPENING PRAYER\nMy Lord Jesus Christ, Thou hast made this journey to die for me with love unutterable, and I have so many times unworthily abandoned Thee; but now I love Thee with my whole heart, and because I love Thee, I repent sincerely for having ever offended Thee. Pardon me, my God, and permit me to accompany Thee on this journey. Thou goest to die for love of me; I wish also, my beloved Redeemer, to die for love of Thee. My Jesus, I will live and die always united to Thee.\n\nSAID AT EVERY STATION\nV. We adore Thee, O Christ, and we bless Thee.\nR. Because by Thy holy Cross Thou hast redeemed the world.\n\n— then the meditation for that station, then: —\n\nI love Thee, Jesus, my love, above all things; I repent with my whole heart for having offended Thee. Never permit me to separate myself from Thee again. Grant that I may love Thee always; and then do with me what Thou wilt.\n\n— then an Our Father, Hail Mary and Glory Be, and a verse of the Stabat Mater. —\n\nTHE FOURTEEN STATIONS\n1. Jesus is condemned to death\nConsider how Jesus, after having been scourged and crowned with thorns, was unjustly condemned by Pilate to die on the Cross.\n\n2. Jesus takes up His Cross\nConsider how Jesus, in making this journey with the Cross on His shoulders, thought of us, and for us offered to His Father the death He was about to undergo.\n\n3. Jesus falls the first time\nConsider this first fall of Jesus under His Cross. His flesh was torn by the scourges, His head crowned with thorns, and He had lost a great quantity of blood.\n\n4. Jesus meets His Mother\nConsider the meeting of the Son and the Mother, which took place on this journey. Jesus and Mary looked at each other, and their looks became as so many arrows to wound those hearts which loved each other so tenderly.\n\n5. Simon of Cyrene helps Jesus carry the Cross\nConsider how the Jews, seeing that at each step Jesus from weakness was on the point of expiring, and fearing that He would die on the way, when they wished Him to die the ignominious death of the Cross, constrained Simon the Cyrenian to carry the Cross behind our Lord.\n\n6. Veronica wipes the face of Jesus\nConsider how the holy woman named Veronica, seeing Jesus so afflicted, and His face bathed in sweat and blood, presented Him with a towel, with which He wiped His adorable face, leaving on it the impression of His holy countenance.\n\n7. Jesus falls the second time\nConsider the second fall of Jesus under the Cross — a fall which renews the pain of all the wounds of the head and members of our afflicted Lord.\n\n8. Jesus meets the women of Jerusalem\nConsider how those women wept with compassion at seeing Jesus in such a pitiable state, streaming with blood, as He walked along. But Jesus said to them: Weep not for Me, but for your children.\n\n9. Jesus falls the third time\nConsider the third fall of Jesus Christ. His weakness was extreme, and the cruelty of His executioners was excessive, who tried to hasten His steps when He had scarcely strength to move.\n\n10. Jesus is stripped of His garments\nConsider the violence with which the executioners stripped Jesus. His inner garments adhered to His torn flesh, and they dragged them off so roughly that the skin came with them.\n\n11. Jesus is nailed to the Cross\nConsider how Jesus, after being thrown on the Cross, extended His hands, and offered to His Eternal Father the sacrifice of His death for our salvation. These barbarians fastened Him with nails, and then, raising the Cross, allowed Him to die with anguish on this infamous gibbet.\n\n12. Jesus dies on the Cross\nConsider how thy Jesus, after three hours' Agony on the Cross, consumed at length with anguish, abandons Himself to the weight of His body, bows His head, and dies.\n\n13. Jesus is taken down from the Cross\nConsider how, after the death of our Lord, two of His disciples, Joseph and Nicodemus, took Him down from the Cross, and placed Him in the arms of His afflicted Mother, who received Him with unutterable tenderness, and pressed Him to her bosom.\n\n14. Jesus is laid in the tomb\nConsider how the disciples carried the body of Jesus to bury it, accompanied by His holy Mother, who arranged it in the sepulchre with her own hands. They then closed the tomb, and all withdrew.\n\nAT THE CLOSE\nPray for the intentions of the Holy Father.",
    background:
      "The devotion began with pilgrims walking the actual route in Jerusalem, and with the Franciscans — given custody of the Holy Places in the 14th century — who set up carved stations in Europe so that people who would never reach Jerusalem could make the walk anyway. The number settled at fourteen in the 17th–18th century.\n\nThis is St. Alphonsus Liguori's version in full: the opening prayer, the versicle and response said at each station, the act of love repeated fourteen times, and his own fourteen meditations, each beginning 'Consider how…' and addressed directly to Christ. It has been the standard text almost everywhere since he wrote it. The meditations are short on purpose — Liguori wrote for parish congregations walking a church wall on a Friday in Lent, not for a reading audience, and the brevity is the point: each gives you one thing to look at before you move on.\n\nTwo things worth knowing. Nine of the fourteen stations are drawn from the Gospels; five are not — the three falls, the meeting with Mary, and Veronica — and come from tradition rather than Scripture. In 1991 John Paul II introduced a Scriptural Way of the Cross replacing those five with recorded episodes, and both forms are in legitimate use. Second, the closing intention for the Holy Father is not decorative: it is one of the traditional conditions attached to the indulgence for making the Stations.",
  },
  {
    title: "Come, Holy Spirit",
    kind: "prayer",
    tags: ["Holy Spirit", "invocation", "before work"],
    source: "The Church's standard invocation of the Holy Spirit — versicle, response and collect",
    author: "Traditional / Anonymous",
    authorNote: "the Church's own formula, said before councils, synods, study and any serious undertaking",
    related: ["Prayer to the Holy Spirit", "Veni Creator Spiritus", "A Visit of the Holy Spirit", "The Seven Gifts of the Holy Spirit"],
    year: "Collect in use by the medieval period",
    origin: "Roman liturgy",
    liturgical: "Pentecost; before any deliberation, study or work",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: true,
    latinBody:
      "Veni, Sancte Spiritus, reple tuorum corda fidelium,\net tui amoris in eis ignem accende.\n\nV. Emitte Spiritum tuum, et creabuntur.\nR. Et renovabis faciem terrae.\n\nOremus:\nDeus, qui corda fidelium Sancti Spiritus illustratione docuisti, da nobis in eodem Spiritu recta sapere, et de eius semper consolatione gaudere. Per Christum Dominum nostrum. Amen.",
    body:
      "Come, Holy Spirit, fill the hearts of Thy faithful,\nand kindle in them the fire of Thy love.\n\nV. Send forth Thy Spirit, and they shall be created.\nR. And Thou shalt renew the face of the earth.\n\nLet us pray:\nO God, who didst instruct the hearts of the faithful by the light of the Holy Spirit, grant that by the gift of the same Spirit we may be always truly wise and ever rejoice in His consolation. Through Christ our Lord. Amen.",
    background:
      "This is the Church's own prayer to the Holy Spirit — not one saint's composition but the formula she uses institutionally: at the opening of councils, synods and conclaves, before theological study, before any undertaking that needs light rather than only effort. If there is a single prayer to reach for before sitting down to work, this is the one the Church herself reaches for.\n\nIt is built from Psalm 104:30 — 'Send forth Thy Spirit and they shall be created, and Thou shalt renew the face of the earth' — which supplies the versicle and response. The collect asks for two things specifically: to be 'truly wise' (recta sapere, to judge rightly) and to rejoice in the Spirit's consolation. Wisdom and consolation, not success.\n\nEasily confused with the two great Pentecost hymns that begin similarly: Veni Creator Spiritus (also here) and Veni Sancte Spiritus, the 'Golden Sequence' sung at the Pentecost Mass. This is neither — it is the short working formula.",
  },
  {
    title: "Veni Creator Spiritus",
    kind: "hymn",
    tags: ["Holy Spirit", "Pentecost", "ordination"],
    source: "9th-century hymn, traditionally attributed to Rabanus Maurus; English by Edward Caswall",
    author: "Attributed to Rabanus Maurus",
    authorNote: "attribution traditional, not certain",
    related: ["Come, Holy Spirit", "Prayer to the Holy Spirit", "Tantum Ergo", "The Seven Gifts of the Holy Spirit"],
    year: "9th century",
    origin: "Latin hymnody",
    liturgical: "Pentecost; ordinations, conclaves, councils, the dedication of churches",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: false,
    latinBody:
      "Veni, Creator Spiritus,\nmentes tuorum visita,\nimple superna gratia,\nquae tu creasti pectora.\n\nQui diceris Paraclitus,\naltissimi donum Dei,\nfons vivus, ignis, caritas,\net spiritalis unctio.\n\nTu septiformis munere,\ndigitus paternae dexterae,\ntu rite promissum Patris,\nsermone ditans guttura.\n\nAccende lumen sensibus,\ninfunde amorem cordibus,\ninfirma nostri corporis\nvirtute firmans perpeti.\n\nHostem repellas longius,\npacemque dones protinus;\nductore sic te praevio\nvitemus omne noxium.\n\nPer te sciamus da Patrem,\nnoscamus atque Filium,\nteque utriusque Spiritum\ncredamus omni tempore.\n\nDeo Patri sit gloria,\net Filio, qui a mortuis\nsurrexit, ac Paraclito,\nin saeculorum saecula. Amen.",
    body:
      "Come, Holy Ghost, Creator blest,\nand in our hearts take up Thy rest;\ncome with Thy grace and heavenly aid\nto fill the hearts which Thou hast made.\n\nO Comforter, to Thee we cry,\nThou heavenly gift of God most high,\nThou fount of life and fire of love,\nand sweet anointing from above.\n\nThou in Thy sevenfold gifts art known,\nthe finger of God's hand we own;\nthe promise of the Father Thou,\nwho dost the tongue with power endow.\n\nKindle our senses from above,\nand make our hearts o'erflow with love;\nwith patience firm and virtue high\nthe weakness of our flesh supply.\n\nFar from us drive the foe we dread,\nand grant us Thy true peace instead;\nso shall we not, with Thee for guide,\nturn from the path of life aside.\n\nOh, may Thy grace on us bestow\nthe Father and the Son to know,\nand Thee, through endless times confessed,\nof both the eternal Spirit blest.\n\nNow to the Father and the Son\nwho rose from death, be glory given,\nwith Thee, O Holy Comforter,\nhenceforth by all in earth and heaven. Amen.",
    background:
      "The hymn the Church sings when something irreversible is about to happen: ordinations, the consecration of bishops, the opening of a conclave or a council, the dedication of a church. Moments where she is asking the Holy Spirit to act rather than merely be praised. A plenary indulgence is attached to reciting it on 1 January and at Pentecost.\n\nNinth century, traditionally credited to Rabanus Maurus, Archbishop of Mainz — old and plausible, not certain. The English is Edward Caswall's, the same translator behind 'Down in Adoration Falling' for the Tantum Ergo.\n\nThe third stanza calls the Spirit 'sevenfold in gift' — the seven gifts of Isaiah 11: wisdom, understanding, counsel, fortitude, knowledge, piety and fear of the Lord.",
  },
  {
    title: "The Seven Last Words",
    kind: "teaching",
    seedVersion: 3,
    tags: ["Passion", "Good Friday", "meditation"],
    source: "The four Gospels, in the traditional harmonised order",
    author: "Jesus Christ",
    authorNote: "assembled from all four Gospels — no single Gospel records all seven",
    related: ["The Stations of the Cross", "Anima Christi", "The Five Wounds"],
    year: "1st century sayings; traditional harmony",
    origin: "Biblical",
    liturgical: "Good Friday; the Three Hours devotion",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body:
      "1. \"Father, forgive them, for they know not what they do.\"\n— Luke 23:34\n\n2. \"Amen I say to thee, this day thou shalt be with me in paradise.\"\n— Luke 23:43\n\n3. \"Woman, behold thy son… Behold thy mother.\"\n— John 19:26–27\n\n4. \"My God, my God, why hast Thou forsaken me?\"\n— Matthew 27:46; Mark 15:34\n\n5. \"I thirst.\"\n— John 19:28\n\n6. \"It is finished.\"\n— John 19:30\n\n7. \"Father, into Thy hands I commend my spirit.\"\n— Luke 23:46\n\nWHERE TO READ MORE\n\n**Fr. Alonso Mesía, The Devotion of the Three Hours' Agony** — The 1732 Lima devotion in English, with Herbert Thurston's historical introduction — which is where the account of its origin after the 1687 earthquake comes from. Scanned, full text, free.\nhttps://archive.org/stream/thedevotionofthe00mesiuoft/thedevotionofthe00mesiuoft_djvu.txt",
    background:
      "A harmony, not a single passage — no one Gospel records all seven. Luke has the first, second and seventh; John the third, fifth and sixth; Matthew and Mark preserve only the fourth, the cry of dereliction. The traditional sequence is the order the Church has long assumed, but the Gospels themselves do not establish it.\n\nThey are the backbone of the Three Hours devotion, noon to three on Good Friday, one word preached at a time. Haydn wrote his Seven Last Words as orchestral meditations for exactly that service in Cádiz.\n\nTwo are worth pausing on. The fourth is a quotation: Christ is praying Psalm 22, which opens in that abandonment and ends in vindication — so it is genuinely a cry, and also the first line of a psalm whose ending He knew. And the sixth, 'It is finished' (tetelestai), is not collapse; the Greek is the word used for a debt discharged or a commission completed." +
      "\n\nThe Good Friday service built on these seven — the Three Hours' Agony, or Tre Ore, kept from noon to three — began in Lima. It was devised by Fr. Alonso Mesía Bedoya, a Jesuit born in Peru in 1665, who directed a confraternity there called the School of Christ; Herbert Thurston's history of the devotion traces the impulse to the Lima earthquake of 1687 and the public acts of atonement that followed it, with the three-hour Good Friday form growing out of the confraternity's ordinary Friday exercises rather than being composed in one sitting. Mesía died in 1732, his text was printed after his death, and it reached Rome around 1788. He is not a saint and is barely remembered by name — but this is the one devotion in the library that came from Peru before it came from anywhere else.",
  },
  {
    title: "The Five Wounds",
    kind: "teaching",
    seedVersion: 3,
    tags: ["Passion", "devotion", "reparation"],
    source: "Medieval devotion to the wounds of the crucified Christ",
    author: "Traditional / Anonymous",
    authorNote: "no single authorised formula — devotional arrangements vary between books",
    related: ["The Seven Last Words", "Anima Christi", "Litany of the Most Precious Blood", "The Stations of the Cross", "Litany of the Sacred Heart", "Rhythmica Oratio — the Members of the Crucified Christ"],
    relatedSaints: ["francis-of-assisi"],
    year: "Widespread from the 11th–12th century",
    origin: "Medieval devotional",
    liturgical: "Lent; Fridays",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "The five wounds are those of the two hands, the two feet, and the side pierced by the lance.\n\nOne traditional way of praying them — an Our Father, Hail Mary and Glory Be at each:\n\n1. The wound of the right hand — for my sins of action.\n2. The wound of the left hand — for what I have failed to do.\n3. The wound of the right foot — for the journeys I have made away from God.\n4. The wound of the left foot — for the return, and for perseverance to the end.\n5. The wound of the side — for the love that opened it, and for the Church born from it.\n\nHail, holy Wounds of my Redeemer; in you I place my trust. By your merits blot out my sins, strengthen me in weakness, and at the hour of my death be my refuge. Amen.\n\nWHERE TO READ MORE\n\n**The Rhythmica Oratio** — The seven-part medieval poem on the members of the crucified body — the fullest devotional development of this. See the entry in this library for what it is and who actually wrote it.",
    background:
      "One of the oldest structured devotions in the Western Church, widespread from the 11th–12th century, and the root of several later ones: devotion to the Sacred Heart grows out of meditation on the wound of the side, and the Precious Blood devotion out of what flows from all five.\n\nIt has a particular hold on the Franciscans, because St. Francis received the stigmata at La Verna in 1224 — the first documented case, and why the wounds appear so often in Franciscan art.\n\nIn England the Five Wounds were a political emblem as well as a devotional one. The banner of the Pilgrimage of Grace, the 1536 northern rising against Henry VIII's break with Rome, bore them; men were hanged under that banner. Worth knowing given John Fisher and Thomas More are in this library — the same conflict, the same decade.\n\nA note on the text: unlike the Stations, the Five Wounds has no single authorised set of prayers. The arrangement above is one common devotional form, not a fixed formula, and books vary widely.",
  },
  {
    title: "The Four Last Things",
    kind: "teaching",
    seedVersion: 3,
    tags: ["death", "judgment", "heaven", "hell", "examination"],
    source: "Traditional catechetical formula — the Novissima",
    author: "Traditional / Anonymous",
    related: ["I Will Spend My Heaven Doing Good on Earth", "Night Prayer", "The Seven Last Words"],
    relatedSaints: ["alphonsus-liguori"],
    year: "Standard by the late medieval period",
    origin: "Catechetical",
    liturgical: "November, the month of the Holy Souls; Advent",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "DEATH\nJUDGMENT\nHEAVEN\nHELL\n\n\"In all thy works remember thy last end, and thou shalt never sin.\"\n— Sirach 7:36\n\nWHERE TO READ MORE\n\n**Ecclesiasticus 7 and the Novissima** — The formula's root is Sirach 7:36 — 'in all thy works remember thy last end'.\nhttps://www.drbo.org/chapter/26007.htm",
    background:
      "The Novissima — literally 'the last things' — the four realities the Church has traditionally told people to keep in view. Not a prayer but a frame for examination, and the backbone of the memento mori tradition: retreats, Advent and November preaching, and a great deal of Catholic art are organised around these four.\n\nThe order is not decorative. Death is certain and its hour unknown; judgment follows immediately, particular before it is general; heaven and hell are the two outcomes, and the tradition insists both are real and freely chosen. St. Alphonsus Liguori and St. Robert Bellarmine both wrote at length on the sequence, and Ignatius's Spiritual Exercises use it as a structure for meditation.\n\nThe warrant is Sirach 7:36, quoted above — and note what it actually claims. It is offered not as a way of inducing fear but as a way of not sinning: keeping the end in view as a corrective to the foreshortened judgement of the present moment.",
  },
  {
    title: "The Divine Praises",
    kind: "prayer",
    tags: ["reparation", "Benediction", "eucharist"],
    source: "Written in Italian by Luigi Felici, S.J., 1797, as reparation for blasphemy",
    author: "Fr. Luigi Felici, S.J.",
    authorNote: "not a saint — an ordinary Jesuit priest; later invocations added by successive popes",
    related: ["Tantum Ergo", "Panis Angelicus", "Litany of the Most Precious Blood", "Te Deum"],
    year: "1797; last addition 1964",
    origin: "Jesuit; now part of Benediction",
    liturgical: "Said after Benediction of the Blessed Sacrament",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Blessed be God.\nBlessed be His holy Name.\nBlessed be Jesus Christ, true God and true man.\nBlessed be the Name of Jesus.\nBlessed be His most Sacred Heart.\nBlessed be His most Precious Blood.\nBlessed be Jesus in the most holy Sacrament of the altar.\nBlessed be the Holy Spirit, the Paraclete.\nBlessed be the great Mother of God, Mary most holy.\nBlessed be her holy and Immaculate Conception.\nBlessed be her glorious Assumption.\nBlessed be the name of Mary, Virgin and Mother.\nBlessed be Saint Joseph, her most chaste spouse.\nBlessed be God in His Angels and in His Saints.",
    background:
      "Said after Benediction, and the piece that completes the sequence this library now holds: O Salutaris, then Tantum Ergo with its versicle and collect, the blessing with the monstrance, then these.\n\nIts origin is specific and unusual. Written in Italian in 1797 by a Jesuit, Luigi Felici, as an act of REPARATION — something to say after hearing blasphemy or the Holy Name taken in vain. That is why the form is simply a list of blessings: each line is a deliberate counterweight to a curse.\n\nLike the Litany of Loreto it has grown by papal addition, and the layers date it:\n• 1851 — her holy and Immaculate Conception (Pius IX)\n• 1897 — His most Sacred Heart (Leo XIII)\n• 1920 — Saint Joseph, her most chaste spouse (Benedict XV)\n• 1952 — her glorious Assumption (Pius XII)\n• 1960 — His most Precious Blood (John XXIII)\n• 1964 — the Holy Spirit, the Paraclete (Paul VI)\n\nThe author is not a saint: an ordinary Jesuit priest whose fourteen lines outlived him and are now said in Catholic churches everywhere.",
  },
  {
    title: "The Golden Arrow",
    kind: "prayer",
    seedVersion: 1,
    tags: ["reparation", "Passion", "holy name", "blasphemy", "Carmelite", "Holy Face"],
    source: "Given at Tours in 1843; the central prayer of the devotion to the Holy Face",
    author: "Sister Marie de Saint-Pierre, O.C.D.",
    authorNote: "she received and recorded it; the words are given in her account as Our Lord's own",
    related: ["The Divine Praises", "Litany of the Holy Name of Jesus", "Anima Christi", "Litany of the Sacred Heart"],
    relatedSaints: [],
    year: "1843",
    origin: "Carmelite — Tours, France",
    liturgical: "The Holy Face, Shrove Tuesday; any act of reparation",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "May the most holy, most sacred, most adorable,\nmost incomprehensible and unutterable Name of God\nbe for ever praised, blessed, loved, adored and glorified\nin heaven, on earth, and under the earth,\nby all the creatures of God,\nand by the Sacred Heart of Our Lord Jesus Christ\nin the Most Holy Sacrament of the Altar. Amen.",
    background:
      "Given at Tours in 1843 to Sister Marie de Saint-Pierre (1816-1848), a Discalced Carmelite who entered the monastery there at twenty-three and died at thirty-one. She recorded a series of communications about a devotion to the Holy Face, and this prayer is the heart of it. Our Lord is said to have called it the Golden Arrow, and to have said that whoever prayed it would wound Him delightfully, and heal the wounds inflicted by the malice of sinners.\n\nThat image is the whole point of the prayer, and it is worth pausing on. Blasphemy is described in these accounts as a poisoned arrow; the answer given is not a shield but another arrow, made of gold. Reparation here is not defence or protest. It is the offering of the opposite thing.\n\nNotice that the prayer contains no petition. It asks for nothing at all. Every word of it is praise of the Name — which is precise, because the offence it answers is the abuse of the Name. It sets right the specific thing that was put wrong, and it does so by blessing rather than by complaining.\n\nTwo things it is for, in the contemporary accounts: blasphemy, and the profanation of Sunday. Some later English versions add 'the Communists' to that list, which is anachronistic — the revelations date from 1843, five years before the Communist Manifesto, and the target in the original setting is the anticlericalism of post-revolutionary France. The devotion does not need the update.\n\nThe devotion spread through Leo Dupont, a layman of Tours known afterwards as the Holy Man of Tours, who kept a lamp burning before an image of the Holy Face for thirty years. Leo XIII approved the Archconfraternity of the Holy Face in 1885. Pius XII established the feast in 1958, and put it on Shrove Tuesday — the day before Lent begins, and traditionally the loudest day of the year.\n\nOn the text: it is translated from French and the English wording varies between printings. Some have 'ineffable' where this has 'unutterable', and 'So be it' for 'Amen'. Nothing turns on the difference.\n\nThree further prayers of the same devotion are usually printed alongside this one, including an offering of the Holy Face to the Eternal Father. They are not reproduced here because the wording I could verify was not consistent enough to be worth fixing in this library.",
  },
  {
    title: "The Seven Sorrows of Mary",
    kind: "teaching",
    seedVersion: 4,
    tags: ["Marian", "Passion", "sorrow"],
    source: "Servite devotion; feast of Our Lady of Sorrows, 15 September",
    author: "Traditional / Anonymous",
    authorNote: "propagated by the Servite Order, founded at Florence in 1233",
    related: ["The Stations of the Cross", "Salve Regina", "The Miracle Prayer", "Litany of Loreto", "Stabat Mater"],
    relatedSaints: ["mary", "peregrine-laziosi"],
    year: "Devotion from the 13th–14th century",
    origin: "Servite (Order of the Servants of Mary)",
    liturgical: "15 September, Our Lady of Sorrows; Lent",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "1. The prophecy of Simeon — \"and thy own soul a sword shall pierce.\" (Luke 2:35)\n2. The flight into Egypt. (Matthew 2:13–14)\n3. The loss of the Child Jesus in the Temple for three days. (Luke 2:43–45)\n4. Mary meets Jesus carrying the Cross.\n5. Mary stands at the foot of the Cross. (John 19:25)\n6. Mary receives the body of Jesus taken down from the Cross.\n7. Jesus is laid in the tomb.\n\nA traditional way of praying them: an Our Father and seven Hail Marys at each sorrow — the Servite Rosary, prayed on a chaplet of seven sets of seven.\n\nWHERE TO READ MORE\n\n**Luke 2 and John 19, Douay-Rheims** — Five of the seven are in these two chapters — Simeon's prophecy and the loss in the Temple in Luke, the Cross and the burial in John.\nhttps://www.drbo.org/chapter/49002.htm",
    background:
      "The Marian counterpart to the Stations, and the devotion of the Servite Order, founded at Florence in 1233 — which is why the Servites keep appearing around it, including St. Peregrine Laziosi in this library, and why the Servite priest who wrote the Miracle Prayer closes it by naming Our Lady under a Servite title.\n\nThe seven are not a random selection. The first three come from the infancy and the last four from the Passion, so the sequence spans her whole life and makes a specific point: Simeon's sword is drawn at the Presentation and not finally driven home until Calvary. The sorrow is one continuous thing, not seven separate episodes.\n\nThe feast is 15 September, placed deliberately the day after the Exaltation of the Holy Cross. The Stabat Mater is its sequence.",
  },
  {
    title: "Litany of the Sacred Heart",
    kind: "litany",
    tags: ["Sacred Heart", "approved", "reparation"],
    source: "Approved for public use by Leo XIII, 1899",
    author: "Traditional / Anonymous",
    authorNote: "assembled from earlier litanies, drawing on Jean Croiset, S.J. (1691) and Ven. Anne Madeleine Remuzat",
    related: ["Litany of the Saints", "Litany of Loreto", "Litany of the Holy Name of Jesus", "Litany of St. Joseph", "Litany of the Most Precious Blood", "The Five Wounds"],
    year: "Approved 1899",
    origin: "Approved devotional litany",
    liturgical: "June, the month of the Sacred Heart; First Fridays",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "Lord, have mercy.\nChrist, have mercy.\nLord, have mercy.\n\nGod the Father of heaven, have mercy on us.\nGod the Son, Redeemer of the world, have mercy on us.\nGod the Holy Spirit, have mercy on us.\nHoly Trinity, one God, have mercy on us.\n\nHeart of Jesus, Son of the Eternal Father, have mercy on us.\nHeart of Jesus, formed in the womb of the Virgin Mother by the Holy Spirit, have mercy on us.\nHeart of Jesus, united substantially with the Word of God, have mercy on us.\nHeart of Jesus, of infinite majesty, have mercy on us.\nHeart of Jesus, holy temple of God, have mercy on us.\nHeart of Jesus, tabernacle of the Most High, have mercy on us.\nHeart of Jesus, house of God and gate of heaven, have mercy on us.\nHeart of Jesus, glowing furnace of charity, have mercy on us.\nHeart of Jesus, vessel of justice and love, have mercy on us.\nHeart of Jesus, full of goodness and love, have mercy on us.\nHeart of Jesus, abyss of all virtues, have mercy on us.\nHeart of Jesus, most worthy of all praise, have mercy on us.\nHeart of Jesus, King and centre of all hearts, have mercy on us.\nHeart of Jesus, in whom are all the treasures of wisdom and knowledge, have mercy on us.\nHeart of Jesus, in whom dwelleth all the fullness of the Divinity, have mercy on us.\nHeart of Jesus, in whom the Father is well pleased, have mercy on us.\nHeart of Jesus, of whose fullness we have all received, have mercy on us.\nHeart of Jesus, desire of the everlasting hills, have mercy on us.\nHeart of Jesus, patient and rich in mercy, have mercy on us.\nHeart of Jesus, rich unto all who call upon Thee, have mercy on us.\nHeart of Jesus, fount of life and holiness, have mercy on us.\nHeart of Jesus, propitiation for our sins, have mercy on us.\nHeart of Jesus, saturated with revilings, have mercy on us.\nHeart of Jesus, crushed for our iniquities, have mercy on us.\nHeart of Jesus, made obedient unto death, have mercy on us.\nHeart of Jesus, pierced with a lance, have mercy on us.\nHeart of Jesus, source of all consolation, have mercy on us.\nHeart of Jesus, our life and resurrection, have mercy on us.\nHeart of Jesus, our peace and reconciliation, have mercy on us.\nHeart of Jesus, victim for our sins, have mercy on us.\nHeart of Jesus, salvation of those who hope in Thee, have mercy on us.\nHeart of Jesus, hope of those who die in Thee, have mercy on us.\nHeart of Jesus, delight of all the saints, have mercy on us.\n\nLamb of God, who takest away the sins of the world, spare us, O Lord.\nLamb of God, who takest away the sins of the world, graciously hear us, O Lord.\nLamb of God, who takest away the sins of the world, have mercy on us.\n\nV. Jesus, meek and humble of Heart.\nR. Make our hearts like unto Thine.\n\nLet us pray:\nAlmighty and everlasting God, look upon the Heart of Thy well-beloved Son and upon the praise and satisfaction He offers Thee on behalf of sinners; and do Thou, in Thy great goodness, grant pardon to them who seek Thy mercy, in the name of the same Jesus Christ Thy Son, who liveth and reigneth with Thee for ever and ever. Amen.",
    background:
      "The sixth and last of the litanies approved for public use — so this library now holds the complete set: the Saints, Loreto, the Holy Name, St. Joseph, the Precious Blood, and this.\n\nApproved by Leo XIII in 1899, the same year he consecrated the whole human race to the Sacred Heart. The text was not composed at once but assembled from earlier litanies, drawing on invocations by the Jesuit Jean Croiset (1691) and by Ven. Anne Madeleine Remuzat at Marseilles.\n\nThirty-three invocations, one for each year of Christ's earthly life — the number is deliberate. They move in three movements: what the Heart IS in itself (Son of the Eternal Father, holy temple, glowing furnace of charity), what was DONE to it (saturated with revilings, crushed for our iniquities, pierced with a lance), and what it is FOR US (our life and resurrection, our peace and reconciliation, hope of those who die in Thee). The devotion rests on the wound of the side — the same wound the Five Wounds devotion here meditates on.",
  },
  {
    title: "The O Antiphons",
    kind: "antiphon",
    seedVersion: 2,
    tags: ["Advent", "Messianic titles", "liturgy"],
    source: "Antiphons of the Magnificat at Vespers, 17-23 December",
    author: "Traditional / Anonymous",
    authorNote: "in use by the 8th century, probably older",
    related: ["The Angelus", "Alma Redemptoris Mater", "Come, Holy Spirit"],
    year: "In use by the 8th century",
    origin: "Roman liturgy",
    liturgical: "17-23 December, the last week of Advent",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: true,
    latinBody:
      "17 Dec - O Sapientia\n18 Dec - O Adonai\n19 Dec - O Radix Jesse\n20 Dec - O Clavis David\n21 Dec - O Oriens\n22 Dec - O Rex Gentium\n23 Dec - O Emmanuel",
    body:
      "17 Dec - O Wisdom, who camest out of the mouth of the Most High, reaching from end to end and ordering all things mightily and sweetly: come and teach us the way of prudence.\n\n18 Dec - O Adonai, and Leader of the house of Israel, who appearedst to Moses in the flame of the burning bush and gavest him the law on Sinai: come and redeem us with an outstretched arm.\n\n19 Dec - O Root of Jesse, who standest as a sign to the peoples, before whom kings shall keep silence: come and deliver us, and tarry not.\n\n20 Dec - O Key of David, and Sceptre of the house of Israel, who openest and no man shutteth: come and lead the captive from the prison house, who sitteth in darkness and in the shadow of death.\n\n21 Dec - O Dayspring, Brightness of the everlasting light and Sun of justice: come and enlighten them that sit in darkness and in the shadow of death.\n\n22 Dec - O King of the nations and their Desired One, the cornerstone that makest both one: come and save man, whom Thou formedst out of the dust of the earth.\n\n23 Dec - O Emmanuel, our King and Lawgiver, the Expectation and Saviour of the nations: come and save us, O Lord our God.",
    background:
      "Seven antiphons sung at the Magnificat at Vespers on the last seven days of Advent, each addressing Christ by a title from the prophets. They are the source of 'O Come, O Come, Emmanuel' — that hymn is simply these seven versified.\n\nThe famous detail is an acrostic, and it only works backwards. Take the first letter of each Latin title in reverse order - Emmanuel, Rex, Oriens, Clavis, Radix, Adonai, Sapientia - and it spells ERO CRAS: 'Tomorrow, I will be.' Christ answering seven days of pleading, on the eve of Christmas. Whether the medieval compilers intended it is debated; the sequence is fixed and the acrostic is there.\n\nEach title is a scriptural quotation, mostly Isaiah, and each pairs its title with a matching request - Wisdom is asked to teach, the Key to release, the Dayspring to enlighten.",
  },
  {
    title: "Te Deum",
    kind: "hymn",
    tags: ["thanksgiving", "praise", "liturgy"],
    source: "Ancient Latin hymn; probably by Nicetas of Remesiana (d. c. 414)",
    author: "Attributed to Nicetas of Remesiana",
    authorNote: "the tradition that Ambrose and Augustine improvised it at Augustine's baptism is legend",
    related: ["The Divine Praises", "Litany of the Saints"],
    relatedSaints: ["ambrose", "augustine"],
    year: "4th-5th century",
    origin: "Latin hymnody",
    liturgical: "Sundays and feasts at the Office of Readings; after a papal election or canonisation; in thanksgiving",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: false,
    latinBody:
      "Te Deum laudamus: te Dominum confitemur.\nTe aeternum Patrem omnis terra veneratur.\nTibi omnes Angeli; tibi Caeli et universae Potestates;\nTibi Cherubim et Seraphim incessabili voce proclamant:\nSanctus, Sanctus, Sanctus, Dominus Deus Sabaoth.\nPleni sunt caeli et terra maiestatis gloriae tuae.\n\nTe gloriosus Apostolorum chorus,\nTe Prophetarum laudabilis numerus,\nTe Martyrum candidatus laudat exercitus.\nTe per orbem terrarum sancta confitetur Ecclesia.",
    body:
      "We praise Thee, O God: we acknowledge Thee to be the Lord.\nAll the earth doth worship Thee, the Father everlasting.\nTo Thee all Angels cry aloud: the Heavens and all the Powers therein;\nTo Thee Cherubim and Seraphim continually do cry:\nHoly, Holy, Holy, Lord God of Hosts.\nHeaven and earth are full of the majesty of Thy glory.\n\nThe glorious company of the Apostles praise Thee.\nThe goodly fellowship of the Prophets praise Thee.\nThe noble army of Martyrs praise Thee.\nThe holy Church throughout all the world doth acknowledge Thee.\n\n(The hymn continues; the opening is given here.)",
    background:
      "The Church's great hymn of thanksgiving - sung after a papal election, at a canonisation, at the close of a council, on the last night of the year, and whenever something has gone well enough to warrant it. In the Office it closes the Office of Readings on Sundays and feasts.\n\nThe legend is charming and false: that Ambrose and Augustine improvised it antiphonally at Augustine's baptism in 387, each supplying alternate lines. Scholars now credit Nicetas of Remesiana, a bishop in what is now Serbia, who died around 414. Both saints are in this library, which is why the story is worth flagging - it is repeated as fact constantly.\n\nOnly the opening is given here. The full hymn runs to about thirty lines and shifts partway from praise into petition ('Vouchsafe, O Lord, to keep us this day without sin'), which is why it works as both a hymn and, at its close, a plea.",
  },
  {
    title: "Stabat Mater",
    kind: "hymn",
    seedVersion: 3,
    tags: ["Marian", "Passion", "sorrow", "Lent"],
    source: "13th-century sequence, traditionally attributed to Jacopone da Todi",
    author: "Attributed to Jacopone da Todi, O.F.M.",
    authorNote: "attribution traditional, not certain; Innocent III has also been proposed",
    related: ["The Seven Sorrows of Mary", "The Stations of the Cross", "The Seven Last Words"],
    relatedSaints: ["mary"],
    year: "13th century",
    origin: "Franciscan",
    liturgical: "15 September, Our Lady of Sorrows; Fridays in Lent; sung between the Stations",
    feastDay: "",
    originalLanguage: "Latin",
    favorite: false,
    latinBody:
      "Stabat Mater dolorosa\niuxta crucem lacrimosa,\ndum pendebat Filius.\n\nCuius animam gementem,\ncontristatam et dolentem,\npertransivit gladius.\n\nO quam tristis et afflicta\nfuit illa benedicta\nMater Unigeniti!\n\nQuae maerebat et dolebat,\npia Mater, dum videbat\nnati poenas incliti.\n\nQuis est homo qui non fleret,\nMatrem Christi si videret\nin tanto supplicio?\n\nQuis non posset contristari,\nChristi Matrem contemplari\ndolentem cum Filio?\n\nPro peccatis suae gentis\nvidit Iesum in tormentis\net flagellis subditum.\n\nVidit suum dulcem natum\nmoriendo desolatum,\ndum emisit spiritum.\n\nEia Mater, fons amoris,\nme sentire vim doloris\nfac, ut tecum lugeam.\n\nFac ut ardeat cor meum\nin amando Christum Deum,\nut sibi complaceam.\n\nSancta Mater, istud agas,\nCrucifixi fige plagas\ncordi meo valide.\n\nTui nati vulnerati,\ntam dignati pro me pati,\npoenas mecum divide.\n\nFac me tecum pie flere,\nCrucifixo condolere,\ndonec ego vixero.\n\nIuxta crucem tecum stare,\net me tibi sociare\nin planctu desidero.\n\nVirgo virginum praeclara,\nmihi iam non sis amara:\nfac me tecum plangere.\n\nFac ut portem Christi mortem,\npassionis fac consortem,\net plagas recolere.\n\nFac me plagis vulnerari,\nfac me cruce inebriari\net cruore Filii.\n\nFlammis ne urar succensus,\nper te, Virgo, sim defensus\nin die iudicii.\n\nChriste, cum sit hinc exire,\nda per Matrem me venire\nad palmam victoriae.\n\nQuando corpus morietur,\nfac ut animae donetur\nparadisi gloria.",
    body:
      "At the Cross her station keeping,\nstood the mournful Mother weeping,\nclose to Jesus to the last:\n\nThrough her heart, His sorrow sharing,\nall His bitter anguish bearing,\nnow at length the sword had passed.\n\nOh, how sad and sore distressed\nwas that Mother highly blest\nof the sole-begotten One!\n\nChrist above in torment hangs;\nshe beneath beholds the pangs\nof her dying glorious Son.\n\nIs there one who would not weep,\nwhelmed in miseries so deep\nChrist's dear Mother to behold?\n\nCan the human heart refrain\nfrom partaking in her pain,\nin that Mother's pain untold?\n\nBruised, derided, cursed, defiled,\nshe beheld her tender Child\nall with bloody scourges rent;\n\nFor the sins of His own nation\nsaw Him hang in desolation,\ntill His Spirit forth He sent.\n\nO thou Mother! fount of love!\nTouch my spirit from above,\nmake my heart with thine accord:\n\nMake me feel as thou hast felt;\nmake my soul to glow and melt\nwith the love of Christ my Lord.\n\nHoly Mother! pierce me through;\nin my heart each wound renew\nof my Saviour crucified:\n\nLet me share with thee His pain,\nwho for all my sins was slain,\nwho for me in torments died.\n\nLet me mingle tears with thee,\nmourning Him who mourned for me,\nall the days that I may live:\n\nBy the Cross with thee to stay;\nthere with thee to weep and pray;\nis all I ask of thee to give.\n\nVirgin of all virgins best!\nListen to my fond request:\nlet me share thy grief divine;\n\nLet me, to my latest breath,\nin my body bear the death\nof that dying Son of thine.\n\nWounded with His every wound,\nsteep my soul till it hath swooned\nin His very blood away;\n\nBe to me, O Virgin, nigh,\nlest in flames I burn and die,\nin His awful Judgment day.\n\nChrist, when Thou shalt call me hence,\nbe Thy Mother my defence,\nbe Thy Cross my victory;\n\nWhile my body here decays,\nmay my soul Thy goodness praise,\nsafe in Paradise with Thee.",
    background:
      "The sequence for Our Lady of Sorrows, and the hymn traditionally sung at the Stations of the Cross - one stanza between stations, which is how most people meet it.\n\nIt does something unusual. It does not describe the Crucifixion; it describes the woman standing beside it, and then turns and asks for a share in what she felt - 'make me feel the force of your sorrow, that I may mourn with you.' The petition is not for consolation but for compassion in the strict sense: suffering-with.\n\nNotice where it turns. The first eight stanzas look at her: she stands, she weeps, she watches. From the ninth - Eia Mater, fons amoris - every stanza is a request, and the requests get steeper: let me weep with you, let me carry his death in my body, let me be wounded with his wounds. It ends somewhere else entirely, at the hour of one's own death, asking for paradise. A hymn that begins by watching a mother ends by asking to die well.\n\nTraditionally credited to Jacopone da Todi, a 13th-century Franciscan who came to religion late and violently, after his wife was killed when a floor collapsed at a banquet. The attribution is not certain; Innocent III has also been proposed.\n\nTexts. The Latin here is the Roman Breviary text, all twenty stanzas; printings vary in small readings, and this one follows the widespread 'contristatam et dolentem' in the second stanza. The English is Edward Caswall's, from his Lyra Catholica of 1849 - the version nearly every English-speaking Catholic has sung, taken here from the 1849 printing itself rather than from a later abridgement, since hymnals often cut it to thirteen or fifteen stanzas. Caswall's elided spellings (pass'd, whelm'd, swoon'd) are written out in full.",
  },
  {
    title: "The Seven Gifts of the Holy Spirit",
    kind: "teaching",
    seedVersion: 5,
    tags: ["Holy Spirit", "virtue", "catechetical"],
    source: "Isaiah 11:2-3, in the Septuagint and Vulgate enumeration",
    author: "Biblical — the prophet Isaiah",
    authorNote: "the sevenfold count follows the Greek and Latin; the Hebrew lists six",
    related: ["The Twelve Fruits of the Holy Spirit", "Come, Holy Spirit", "Veni Creator Spiritus", "Prayer to the Holy Spirit", "The Beatitudes"],
    relatedSaints: ["augustine", "ambrose", "thomas-aquinas"],
    year: "Isaiah, 8th century BC",
    origin: "Biblical",
    liturgical: "Pentecost; Confirmation",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE SEVEN — ISAIAH 11:2-3\n\nWISDOM - to judge and order all things by God's standard rather than one's own\nUNDERSTANDING - to grasp what is revealed, not merely assent to it\nCOUNSEL - to know the right thing to do in this particular case\nFORTITUDE - to do it when it costs\nKNOWLEDGE - to see created things rightly, in relation to God\nPIETY - to relate to God as a son rather than a servant\nFEAR OF THE LORD - reverence; the unwillingness to be separated from Him\n\nThose seven lines are summaries written for this library. What follows is not.\n\nWHAT THE CATECHISM SAYS\n\n\"The moral life of Christians is sustained by the gifts of the Holy Spirit. These are permanent dispositions which make man docile in following the promptings of the Holy Spirit.\" (CCC 1830)\n\n\"The seven gifts of the Holy Spirit are wisdom, understanding, counsel, fortitude, knowledge, piety, and fear of the Lord. They belong in their fullness to Christ, Son of David. They complete and perfect the virtues of those who receive them. They make the faithful docile in readily obeying divine inspirations.\" (CCC 1831)\n\nThe Catechism names the seven and says what a gift is. It does not define them one by one — for that the tradition goes to St. Thomas, who gives each its own question in the Summa.\n\nWHAT ST. THOMAS SAYS\n\n| Gift | Summa Theologiae II-II |\n| Wisdom // q. 45 a. 2 | \"It belongs to wisdom as a gift of the Holy Ghost to judge aright about [divine things] on account of connaturality with them.\" |\n| Understanding // q. 8 a. 1 | \"Understanding implies an intimate knowledge, for *intelligere* is the same as *intus legere*\" — to read inwardly. The gift is the light by which the mind reaches what its natural light cannot. |\n| Counsel // q. 52 a. 1 | Man \"is directed as though counselled by God, just as, in human affairs, those who are unable to take counsel for themselves, seek counsel from those who are wiser.\" |\n| Fortitude // q. 139 a. 1 | \"Fortitude, as a virtue, perfects the mind in the endurance of all perils whatever; but it does not go so far as to give confidence of overcoming all dangers: this belongs to the fortitude that is a gift of the Holy Ghost.\" |\n| Knowledge // q. 9 a. 2 | Distinguished from wisdom by its object: \"the gift of knowledge is only about human or created things.\" Wisdom judges by the highest cause; knowledge judges rightly among the things that are made. |\n| Piety // q. 121 a. 1 | \"Piety, whereby, at the Holy Ghost's instigation, we pay worship and duty to God as our Father, is a gift of the Holy Ghost.\" |\n| Fear of the Lord // q. 19 a. 2 | \"If a man turn to God and adhere to Him, through fear of punishment, it will be servile fear; but if it be on account of fear of committing a fault, it will be filial fear, for it becomes a child to fear offending its father.\" |\n\nServile fear drops away in heaven; filial fear does not (q. 19 a. 11). It is the one fear that survives having nothing left to be afraid of.\n\nWHAT THEY ARE NOT\n\nThey are not the twelve fruits. The gifts are dispositions the Spirit gives; the fruits are what shows in a life where those dispositions are actually being followed — see the separate entry.\n\nWHERE TO READ MORE\n\n**The Catechism, 1830-1832** — What a gift is, and the list. Two paragraphs; read them first.\nhttps://www.vatican.va/content/catechism/en/part_three/section_one/chapter_one/article_7/iii_the_gifts_and_fruits_of_the_holy_spirit.html\n\n**St. Thomas, Summa I-II q. 68** — Why the gifts are needed at all when the virtues already exist. The argument the entry rests on.\nhttps://www.newadvent.org/summa/2068.htm\n\n**The seven questions, Summa II-II** — One question each: understanding q. 8, knowledge q. 9, fear q. 19, wisdom q. 45, counsel q. 52, piety q. 121, fortitude q. 139. Start with fear (q. 19 a. 2) — the servile/filial distinction is the most immediately useful.\nhttps://www.newadvent.org/summa/3019.htm\n\n**St. Augustine, on the Sermon on the Mount** — Where the beatitudes are matched to the gifts, and then to the petitions of the Our Father.\nhttps://www.newadvent.org/fathers/16012.htm",
    background:
      "From Isaiah 11:2-3, describing the Spirit resting on the shoot from the root of Jesse. The Hebrew text actually lists six, with 'fear of the Lord' appearing twice; the Greek Septuagint and Latin Vulgate render the first instance as 'piety', which is how the list became seven - the number the tradition has kept ever since.\n\nAquinas argues the gifts are necessary precisely because the virtues alone, worked at humanly, cannot reach a supernatural end (I-II q. 68). When the Veni Creator calls the Spirit 'sevenfold in gift', this is the list it means.\n\nThe tradition did not leave this as a bare list of seven names. St. Augustine, preaching on the Sermon on the Mount, matched each beatitude to a gift — understanding to the clean of heart, whose eye being purified can see; piety to the meek — so that the two sevens read as one thing: the gift is what the Spirit gives, the beatitude is what it looks like in a life. St. Ambrose made a different pairing, reading the four beatitudes in Luke against the four cardinal virtues. St. Thomas took up both and set them side by side in the Summa — the gifts at I-II q. 68, the beatitudes at q. 69 — where he argues that a beatitude differs from a gift as an act differs from the habit behind it.",
  },
  {
    title: "The Twelve Fruits of the Holy Spirit",
    kind: "teaching",
    seedVersion: 4,
    tags: ["Holy Spirit", "virtue", "catechetical", "examination"],
    source: "Galatians 5:22-23 in the Vulgate enumeration; listed at CCC 1832",
    author: "Biblical — St. Paul",
    authorNote: "the count of twelve is the Vulgate's; the Greek text names nine",
    related: ["The Seven Gifts of the Holy Spirit", "The Beatitudes", "Come, Holy Spirit", "Veni Creator Spiritus"],
    relatedSaints: ["thomas-aquinas"],
    year: "c. AD 50s (the letter); the sevenfold and twelvefold enumerations settled by the Middle Ages",
    origin: "Biblical",
    liturgical: "Pentecost; Confirmation",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE TWELVE — GALATIANS 5:22-23\n\ncharity - joy - peace - patience - benignity - goodness - longanimity -\nmildness - faith - modesty - continency - chastity\n\nThat is the Douay wording, translating the Vulgate. The Catechism gives the same twelve in more modern English:\n\ncharity - joy - peace - patience - kindness - goodness - generosity -\ngentleness - faithfulness - modesty - self-control - chastity\n\nWHAT EACH ONE IS\n\nSt. Thomas shows the twelve are not a heap. They are ordered outward in three movements — the mind set right in itself, then towards other people, then towards what is beneath it — and the first movement is itself split, according to whether what the mind faces is good or evil (I-II q. 70 a. 3).\n\nWhere a fruit is given a second name below, that is the modern English for the same thing; the rest are called the same in both.\n\n| Fruit | St. Thomas, I-II q. 70 a. 3 |\n| The mind set right in itself — facing good | |\n| Charity | The root of the rest. \"The charity of God is poured forth in our hearts by the Holy Ghost, Who is given to us\" — love being the first of the emotions and the root of them all. |\n| Joy | Follows charity necessarily, \"since every lover rejoices at being united to the beloved.\" |\n| Peace | Joy made perfect: undisturbed from outside, and no longer pulled apart by competing desires, because they come to rest in one object. |\n| The mind set right in itself — facing evil | |\n| Patience | Not being disturbed when evil threatens. |\n| Longanimity // long-suffering | Not being disturbed \"whenever good things are delayed; since to lack good is a kind of evil.\" The fruit for waiting, as patience is the fruit for suffering. |\n| The mind set right towards one's neighbour | |\n| Goodness | The will actually turned towards doing good to others. |\n| Benignity // kindness | Goodness carried out — the doing of it, not only the willing. |\n| Mildness // meekness, gentleness | Evenness under the wrongs a neighbour does; it \"curbs anger.\" |\n| Faith // faithfulness | Taken here as fidelity: refraining from harming a neighbour \"not only through anger, but also through fraud or deceit.\" |\n| The mind set right towards what is beneath it | |\n| Modesty | Keeping \"the mode in all our words and deeds\" — proportion, in what one says and does. |\n| Continency // self-control | Holding back from unlawful desires. |\n| Chastity | Further than continency: the continent man is still \"subject to concupiscence\" and unconquered by it, while chastity has withdrawn from the desire itself. |\n\nWHAT A FRUIT IS\n\n\"The fruits of the Spirit are perfections that the Holy Spirit forms in us as the first fruits of eternal glory. The tradition of the Church lists twelve of them.\" (CCC 1832)\n\nSt. Thomas explains the word by the analogy it comes from: when a man's action \"proceeds from him in respect of a higher power, which is the power of the Holy Ghost, then man's operation is said to be the fruit of the Holy Ghost\" (I-II q. 70 a. 1).\n\nHe then separates three things that are easily run together:\n\nA virtue is a habit — a settled capacity. A fruit is an act that comes out of it. \"The names of the virtues are applied to their actions\" when the fruits are enumerated, which is why charity appears in both lists and means something slightly different in each: as a virtue it is the capacity to love God and neighbour, as a fruit it is \"the movement of the soul in loving God and our neighbour\" (I-II q. 70 a. 3).\n\nA beatitude is a fruit too, but not every fruit is a beatitude. \"More is required for a beatitude than for a fruit. Because it is sufficient for a fruit to be something ultimate and delightful; whereas for a beatitude, it must be something perfect and excellent.\" (I-II q. 70 a. 2)\n\nWHY TWELVE AND NOT NINE\n\nThe Greek text of Galatians names nine. The Latin Vulgate has twelve, the three extra being modesty, continency and chastity. The Church's tradition, and the Catechism with it, follows the Vulgate — which is why a Catholic list has twelve and most English Bibles translated from the Greek have nine. Neither is wrong; they are counting from different texts.\n\nThe Catechism lists the twelve (CCC 1832) but, as with the seven gifts, does not define them one by one. The definitions above are St. Thomas's.\n\nWHERE TO READ MORE\n\n**The Catechism, 1832** — The definition and the list of twelve.\nhttps://www.vatican.va/content/catechism/en/part_three/section_one/chapter_one/article_7/iii_the_gifts_and_fruits_of_the_holy_spirit.html\n\n**St. Thomas, Summa I-II q. 70** — Three articles: what a fruit is (a. 1), how a fruit differs from a beatitude (a. 2), and the enumeration with its threefold division (a. 3). Short, and the whole entry comes from here.\nhttps://www.newadvent.org/summa/2070.htm\n\n**Galatians 5, Douay-Rheims** — The passage itself — the works of the flesh at vv. 19-21 and the fruit of the Spirit at vv. 22-23, which is where the twelve and the seventeen sit side by side.\nhttps://www.drbo.org/chapter/55005.htm",
    background:
      "St. Paul's list in Galatians 5:22-23, set against the 'works of the flesh' immediately before it — the fruits are what the passage offers as the visible alternative to that.\n\nThe gifts and the fruits are constantly confused, and the distinction is worth holding onto: the seven gifts are dispositions the Holy Spirit gives, making a person able to be moved by Him promptly; the twelve fruits are what shows in a life where that is actually happening. One is the capacity, the other is the evidence. You cannot see a gift directly. You can see whether someone has become patient.\n\nNote that the twelve are not a scoring system. Aquinas's point in calling them fruits rather than rewards is that they are enjoyed now — 'ultimate and delightful', the first instalment of what is promised in full later, which is what CCC 1832 means by 'the first fruits of eternal glory'.",
  },
  {
    title: "The Three Powers of the Soul",
    kind: "teaching",
    seedVersion: 5,
    tags: ["the soul", "self-knowledge", "meditation", "catechetical", "Patristic"],
    source: "St. Augustine, De Trinitate, Book X",
    author: "St. Augustine",
    authorNote: "the triad is Augustine's; the later tradition and the meditation manuals build on it",
    related: ["Suscipe", "The Two Portions of the Soul", "The Three Stages of Temptation"],
    relatedSaints: ["augustine", "thomas-aquinas", "ignatius-of-loyola"],
    year: "De Trinitate finished c. AD 420",
    origin: "Patristic",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE THREE\n\n| Power | What it does |\n| Memory | Holds what has been known and loved — and so holds the self together across time. Not only recall: it is where you already are before you think. |\n| Understanding | Sees what is there. Not the having of opinions but the actual grasp of a thing. |\n| Will | Loves, chooses, and moves the whole towards what it loves. |\n\nWHAT EACH POWER IS FOR\n\nA power is defined by what it reaches for. The classical answer is that the will reaches for the good and the understanding for the true — and that beauty belongs, which surprises people, to the understanding rather than to the will.\n\nBecause the good and the beautiful are the same thing approached by different powers. St. Thomas: \"Beauty and goodness in a thing are identical fundamentally; for they are based upon the same thing, namely, the form. But they differ logically, for goodness properly relates to the appetite... On the other hand, beauty relates to the cognitive faculty; for beautiful things are those which please when seen.\" (I q. 5 a. 4)\n\nSo the will goes out to the good as to an end — something to be reached and had. The understanding meets the same reality as beauty — something that pleases simply by being seen, with nothing further wanted. Which is a description of heaven: the good, finally, as beauty; possession collapsing into sight.\n\nSt Francis de Sales says the same thing in one line, in the very sermon where he defines faith: comme la bonte est l'objet de la volonte, la beaute l'est aussi de l'entendement — as goodness is the object of the will, so beauty is the object of the understanding. He then puts the two powers to work together: God, wishing to draw a soul to the knowledge of truth, \"always discovers to it the beauty thereof,\" so that the understanding, taken by it, hands the truth to the will, which loves it for the goodness and beauty it recognises there.\n\nMemory is the odd one out, and it is worth saying so rather than inventing a match. The intellect and the will have objects the tradition calls transcendental — the true and the good, which belong to everything that exists — and memory has nothing of the kind. That asymmetry is one reason the scholastics generally worked with two rational powers where Augustine worked with three. St. John of the Cross gives memory an object of a different sort altogether: not something that is, but something promised — which is why he assigns hope to it.\n\nIt is tempting to hand truth to the memory instead, since God is truth as well as goodness and beauty. It does not work as a division of objects: truth simply is being as it stands to the intellect, so giving it away leaves the understanding with nothing of its own. But the instinct behind it is sound, and Augustine had it first. In the tenth book of the Confessions he goes looking for God through his own memory and finds Him already there: \"where I found truth, there found I my God, who is the Truth itself, which from the time I learned it have I not forgotten.\"\n\nSo the distinction to keep is between what a power reaches for and where what it has reached is kept. Truth is the understanding's object; memory is the room truth lives in once it has been understood, which is why a thing known and then forgotten was never really possessed. Augustine sets the limit himself in the same book: memory cannot be the last word about God, since beasts have memory too, and he must \"pass beyond\" it to reach the One he is looking for.\n\nONE MIND, NOT THREE\n\n\"Since, then, these three, memory, understanding, will, are not three lives, but one life; nor three minds, but one mind; it follows certainly that neither are they three substances, but one substance.\" (De Trinitate X, 11.18)\n\nAugustine's point is that they are wholly distinct and wholly inseparable, each containing the other two:\n\n\"For I remember that I have memory and understanding, and will; and I understand that I understand, and will, and remember; and I will that I will, and remember, and understand.\" (X, 11.18)\n\nThat is why he treats them as an image — \"an inadequate image, yet an image\" (X, 12.19) — of the Trinity: three that are really distinct and yet one thing, found in the only place a man can examine from the inside.\n\nWHAT IT IS FOR\n\nTwo practical uses have come out of this.\n\nThe first is meditation. The classical method works all three in turn: memory brings the scene or the truth to mind, understanding considers it, will responds — and a meditation that stops at understanding has not finished.\n\nThe second is self-examination. When something is wrong, it helps to ask which power is failing. A truth known and not loved is a failure of will, not of understanding, and no amount of further reading will fix it. A love running ahead of what is actually known is the opposite fault.\n\nIt is also what St. Ignatius offers back in the Suscipe: \"Take, Lord, and receive all my liberty, my memory, my understanding, and my entire will.\" He is not listing faculties for the sake of it — he is handing over the whole of the interior man, by its parts.\n\nWHERE TO READ MORE\n\n**St. Augustine, On the Trinity, Book X** — Chapters 11-12 are the passage itself: three that are one life, one mind, one essence. Short, and startling.\nhttps://www.newadvent.org/fathers/130110.htm\n\n**St. Augustine, Confessions, Book X** — The long meditation on memory — where he searches it for God and finds truth already there, then says he must pass beyond it.\nhttps://www.newadvent.org/fathers/110110.htm\n\n**St. Thomas, Summa I q. 5 a. 4** — Where beauty is assigned to the knowing power and goodness to the appetite. The reply to the first objection is the sentence that matters.\nhttps://www.newadvent.org/summa/1005.htm",
    background:
      "From Book X of the De Trinitate, where Augustine goes looking for a trace of the Trinity in the creature made in its image, and finds it not in the body or in the world but in the mind's knowledge of itself.\n\nThe move is worth noticing: he does not argue from the outside in. He asks what a mind is doing when it knows and loves itself, and finds three acts that cannot be collapsed into each other and cannot be separated either. That structure — really distinct, really one — is what he offers as the image.\n\nHe is careful about how far it goes. The image is \"inadequate\", and he spends much of the following books saying so. What it can do is give a person somewhere to stand: the Trinity is not an arbitrary arithmetic puzzle imposed from outside, since something answering to it is going on in you whenever you remember, understand and choose.\n\nThe later tradition kept the triad and used it more practically than Augustine did — for the structure of meditation, and for examining where in oneself something has gone wrong." +
      "\n\nWhat status does this have? It is an analogy, and Augustine says so himself — \"an inadequate image, yet an image\". The doctrine of the Trinity does not rest on it, and it is not a proof; it is a way in from the inside, from the one thing a person can examine directly. The Catechism is worth checking here, because the triad is often quoted as though it were catechism doctrine. It is not. The Catechism teaches that man is made in God's image, that the soul is \"that by which he is most especially in God's image\" (CCC 363), and that man alone \"is able to know and love his creator\" (CCC 356) — but it nowhere names memory, understanding and will as three powers, and nowhere presents them as an image of the Trinity. That belongs to Augustine and to the tradition that followed him.",
  },
  {
    title: "The Theological Virtues",
    kind: "teaching",
    seedVersion: 5,
    tags: ["virtue", "the soul", "faith", "hope", "charity", "catechetical", "examination"],
    source: "CCC 1812-1829; St. Thomas, Summa II-II; St. John of the Cross, Ascent of Mount Carmel II",
    author: "The Catechism, with St. Thomas Aquinas and St. John of the Cross",
    authorNote: "the definitions are the Catechism's; the mapping onto the powers of the soul is not",
    related: ["The Three Powers of the Soul", "The Cardinal Virtues", "The Seven Gifts of the Holy Spirit", "The Twelve Fruits of the Holy Spirit", "The Beatitudes", "The Two Portions of the Soul", "Act of Faith", "Act of Hope", "Act of Charity"],
    relatedSaints: ["thomas-aquinas", "john-of-the-cross", "francis-de-sales", "augustine"],
    year: "1 Corinthians 13; the scholastic treatment 13th century; St. John of the Cross 16th",
    origin: "Biblical",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE THREE\n\n\"The theological virtues relate directly to God. They dispose Christians to live in a relationship with the Holy Trinity.\" (CCC 1812)\n\nThey are called theological because God is not only their end but their object and their origin: they are about Him, aimed at Him, and given by Him. The cardinal virtues can be built by practice. These cannot; they are infused.\n\n| Virtue | The Catechism |\n| Faith // CCC 1814 | \"The theological virtue by which we believe in God and believe all that he has said and revealed to us.\" |\n| Hope // CCC 1817 | \"The theological virtue by which we desire the kingdom of heaven and eternal life as our happiness, placing our trust in Christ's promises.\" |\n| Charity // CCC 1822 | \"The theological virtue by which we love God above all things for his own sake, and our neighbour as ourselves for the love of God.\" |\n\nWHERE EACH ONE LIVES\n\nEach virtue takes hold of a particular power of the soul. This is not decoration — it is why they cannot substitute for one another, and why a person can be strong in one and starving in another.\n\n| Power | Its object | The virtue that perfects it |\n| Understanding // the knowing power | The true — and beauty, which is the good as it pleases when seen | Faith |\n| Memory // what holds you together across time | What has been given, and what is promised | Hope |\n| Will // the appetite, the loving power | The good | Charity |\n\nSt. Thomas puts faith in the intellect: \"to believe is an act of the intellect inasmuch as the will moves it to assent\" (II-II q. 4 a. 2). Hope he puts in the will — \"hope resides in the higher appetite called the will\" (II-II q. 18 a. 1) — and charity in the will also, as its perfection.\n\nSt. John of the Cross arranges them across all three faculties, and this is the arrangement worth memorising: \"Faith, in the understanding; hope, in the memory; and charity, in the will.\" (Ascent of Mount Carmel II, 6)\n\nWHAT EACH ONE EMPTIES\n\nJohn of the Cross's point is not that the virtues decorate the faculties but that they hollow them out, so that something larger can be held.\n\n| Virtue | What it does to its faculty |\n| Faith | \"Causes an emptiness and darkness with respect to understanding.\" It gives certainty without clarity — you know more and see less, which is why growing faith can feel like losing it. |\n| Hope | \"Causes emptiness of all possessions\" in the memory. It detaches you from what you have held, including your own past — the reason nostalgia and hope pull in opposite directions. |\n| Charity | \"Causes emptiness in the will and detachment from all affection and from rejoicing in all that is not God.\" |\n\nST FRANCIS DE SALES ON EACH\n\nHis account, in the Treatise on the Love of God, keeps understanding and will together at every step — which is why it is the one people remember.\n\n| Virtue | De Sales |\n| Faith // Book II, ch. 14 | God \"proposes in so sweet a manner unto the understanding that which ought to be believed, that the will receives therefrom a great complacency, so great indeed that it moves the understanding to consent and yield to truth without any doubt or distrust.\" |\n| Hope // Book II, chs. 15-17 | \"An expecting and aspiring love\" — two movements at once: expecting from God what He has promised, and rousing oneself to do what is required. |\n| Charity // Book II, ch. 22 | \"A friendship, and a disinterested love, for by charity we love God for his own sake, by reason of his most sovereignly amiable goodness.\" |\n\n— faith, and what it means to half-see —\n\nFaith's certainty does not come with clarity. God proposes the mysteries \"amidst obscurities and darkness, in such sort that we do not see the truths but we only half-see them\" — like the sun behind mist, where \"we see it without seeing it; because on the one hand we see it not so well that we can truly say we see it, yet again we see it not so little that we can say we do not see it.\"\n\nAnd the act itself is an acquiescence: \"having received the grateful light of truth,\" the spirit \"accepts it by means of a sweet, yet powerful and solid assurance and certitude which it finds in the authority of the revelation.\" Once faith arrives, \"the understanding puts off all discourse and arguments, and laying them underneath faith, makes her sit upon them, acknowledging her as Queen.\"\n\nAnd since beauty is the understanding's proper object while goodness is the will's, faith turns out to be both powers closing on the same thing at once — which is exactly why he can define it as an adhesion of both.\n\n— hope, and the falcon in the leash —\n\nFaith shows the good; the will desires it; and the desire would be pure torment if there were no assurance of ever reaching it. His image: \"as the unhooded falcon having her prey in view suddenly launches herself upon the wing, and if held in her leash struggles upon the hand with extreme ardour.\"\n\nGod's promises are what make that ardour bearable — they increase the desire and undo its despair at the same time.\n\n— charity, and the friendship it is —\n\nA true friendship, he insists, because it meets every condition of one: it is reciprocal, it is mutually acknowledged, and it is in continual communication. Not a simple friendship either but \"a friendship of dilection, by which we make election of God\" — He is \"chosen out of thousands.\"\n\nAnd it cannot be worked up from below: \"charity which gives life to our hearts has not her origin from our hearts, but is poured into them as a heavenly liquor.\" It \"makes its abode in the point and summit of the spirit, and, as a queen of majesty, is seated in the will as on her throne.\"\n\nNote the symmetry he leaves standing. Faith is queen over the understanding, enthroned on the arguments it has set aside; charity is queen in the will. The two powers each have their sovereign, and hope moves between them.\n\nWHERE TO READ MORE\n\n**The Catechism, 1812-1829** — The definitions quoted in the entry, and more on each.\nhttps://www.vatican.va/content/catechism/en/part_three/section_one/chapter_one/article_7/ii_the_theological_virtues.html\n\n**St. Thomas on their seats** — Faith in the intellect at II-II q. 4 a. 2; hope in the will at II-II q. 18 a. 1.\nhttps://www.newadvent.org/summa/3004.htm\n\n**St. John of the Cross, Ascent of Mount Carmel II, 6** — Faith in the understanding, hope in the memory, charity in the will — and what each empties. Two pages.\nhttps://www.ccel.org/ccel/john_cross/ascent.v.vi.html\n\n**The Catechism on faith itself, 143 and 150** — Submission of intellect and will; faith as personal adherence plus assent to revealed truth.\nhttps://www.scborromeo.org/ccc/p1s1c3a1.htm",
    background:
      "The three that St. Paul leaves standing at the end of 1 Corinthians 13 — \"and the greatest of these is charity.\"\n\nThe Catechism's definitions are given above verbatim, because they are unusually good: each is one sentence, each says what the virtue does rather than how it feels, and each names its object. Notice that none of the three is defined as a feeling. Faith is believing, hope is desiring and trusting, charity is loving in the sense of willing the good — all acts, and so all commandable. That is the whole reason they can be commanded at all.\n\nThe mapping onto the three powers of the soul is not in the Catechism, and should not be quoted as though it were. It is St. Thomas for the seats of faith and hope, and St. John of the Cross for the threefold arrangement across understanding, memory and will. John's version is the one that has done the most work in the spiritual tradition, because it explains the experience of a soul in the dark: if faith empties the understanding, hope the memory, and charity the will, then the sense of losing one's grip on all three at once is not necessarily decline. It may be the thing working.\n\nWhere the two differ: St. Thomas puts hope in the will, as a movement of the higher appetite towards a difficult but possible good; St. John puts it in the memory. They are not contradicting each other so much as answering different questions — Thomas asks which power performs the act, John asks which power is purified by it." +
      "\n\nThe definition of faith most often quoted from de Sales is not in the Treatise at all but in the Lenten sermons he preached at Annecy in 1622, in the sermon on faith — taken from the Gospel of the Canaanite woman, and beginning from Our Lord's \"Woman, great is thy faith.\" He asks whether her faith was greater than ours, and answers by saying what faith is: la foy n'est autre chose qu'une adhesion de l'entendement et de la volonte aux verites des divins mysteres — faith is nothing else than an adhesion of the understanding and of the will to the truths of the divine mysteries.\n\nThe Catechism arrives at the same place by a different road: \"By faith, man completely submits his intellect and his will to God\" (CCC 143), and \"Faith is first of all a personal adherence of man to God. At the same time, and inseparably, it is a free assent to the whole truth that God has revealed\" (CCC 150). Adherence, intellect and will, revealed truth — the same three elements, two and a half centuries apart.\n\nThe French above is from the Annecy edition of his works; the extended passages quoted in this entry are from the Treatise, whose English translation is old enough to be freely reproduced, while the sermons exist in English only in a modern translation.",
  },
  {
    title: "The Cardinal Virtues",
    kind: "teaching",
    seedVersion: 2,
    tags: ["virtue", "the soul", "examination", "catechetical", "self-knowledge"],
    source: "CCC 1805-1809; St. Thomas, Summa I-II q. 61; Wisdom 8:7",
    author: "The Catechism, with St. Thomas Aquinas",
    authorNote: "the four are named together in Wisdom 8:7 and were common property of the philosophers before that",
    related: ["The Theological Virtues", "The Three Powers of the Soul", "The Eleven Passions", "The Seven Capital Sins", "The Beatitudes"],
    relatedSaints: ["thomas-aquinas", "ambrose", "augustine"],
    year: "Wisdom 8:7; the scholastic treatment 13th century",
    origin: "Biblical",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE FOUR\n\n\"Four virtues play a pivotal role and accordingly are called 'cardinal.'\" (CCC 1805) The word is from cardo, a hinge: not the four greatest virtues, but the four everything else turns on.\n\n| Virtue | The Catechism |\n| Prudence // CCC 1806 | \"The virtue that disposes practical reason to discern our true good in every circumstance and to choose the right means of achieving it.\" |\n| Justice // CCC 1807 | \"The moral virtue that consists in the constant and firm will to give their due to God and neighbour.\" |\n| Fortitude // CCC 1808 | \"The moral virtue that ensures firmness in difficulties and constancy in the pursuit of the good.\" |\n| Temperance // CCC 1809 | \"The moral virtue that moderates the attraction of pleasures and provides balance in the use of created goods.\" |\n\nScripture names all four in one breath: \"she teacheth temperance, and prudence, and justice, and fortitude, which are such things as men can have nothing more profitable in life.\" (Wisdom 8:7)\n\nWHERE EACH ONE LIVES\n\nFour virtues because there are four things in a man that can go right or wrong. St. Thomas assigns each to its own power (I-II q. 61 a. 2):\n\n| Power | Virtue | What it is for |\n| Reason itself // the power \"which is rational in its essence\" | Prudence | Seeing what is actually to be done here, in this case, now |\n| The will | Justice | Rendering what is owed |\n| The irascible appetite // what rises to meet difficulty | Fortitude | Standing when standing is hard |\n| The concupiscible appetite // what is drawn to pleasure | Temperance | Wanting rightly, in measure |\n\nThat is why they cannot be swapped or averaged. A brave man who wants wrongly is not partly temperate; the fault is in a different room of the house.\n\nHOW THEY DIFFER FROM FAITH, HOPE AND CHARITY\n\nThese four can be built. They are acquired by repetition, the way any skill is: you become just by doing just things, and each act makes the next easier. A pagan can have them, and many did.\n\nThe theological virtues cannot be built. They have God as their object and their origin, and they are infused or not there at all.\n\nBoth are needed and neither substitutes. Grace does not make prudence unnecessary; charity does not tell you what to do on Tuesday. And the seven gifts of the Holy Spirit sit above both, because even the infused virtues, worked at humanly, still move at the pace of the one working them.\n\nWHERE TO READ MORE\n\n**The Catechism, 1805-1809** — The four, each defined in a sentence.\nhttps://www.vatican.va/content/catechism/en/part_three/section_one/chapter_one/article_7/i_the_human_virtues.html\n\n**St. Thomas, Summa I-II q. 61** — Article 2 seats each virtue in its own power — which is the part that makes the four non-interchangeable.\nhttps://www.newadvent.org/summa/2061.htm\n\n**Wisdom 8, Douay-Rheims** — Verse 7, where Scripture names all four together.\nhttps://www.drbo.org/chapter/25008.htm",
    background:
      "These four are older than Christianity. Plato has them, the Stoics organise a whole ethics around them, and Ambrose - who gave them the name cardinal in Latin - took them over deliberately rather than inventing a rival set. The tradition has never been embarrassed by that. It reads Wisdom 8:7 as the point where they are already inside Scripture.\n\nWhat Christianity did was subordinate rather than replace. Left to themselves the four cardinal virtues make a good man and stop there; a good man is not the same as a saint, and no amount of temperance reaches God. So the tradition keeps them, ranks them below faith, hope and charity, and then says something more surprising: charity re-forms them from inside, so that justice done for love of God is not the same act as justice done for its own sake, even when it looks identical from outside.\n\nThe order among the four matters too. Prudence comes first, not because it is the noblest but because the other three cannot act without it: courage that does not know what is worth standing for is recklessness, and justice that misreads the case does harm. Prudence is not caution. It is the ability to see what is really the case and what should be done about it - which is why it is seated in reason and why it is the virtue most easily faked.",
  },
  {
    title: "The Seven Capital Sins",
    kind: "teaching",
    seedVersion: 2,
    tags: ["examination", "self-examination", "conscience", "self-knowledge", "temptation", "humility", "virtue", "the soul"],
    source: "St. Gregory the Great, Moralia in Job XXXI; St. Thomas, Summa I-II q. 84; Galatians 5:19-21",
    author: "St. Gregory the Great",
    authorNote: "the sevenfold list is Gregory's; the desert tradition before him counted eight",
    related: ["The Twelve Fruits of the Holy Spirit", "The Cardinal Virtues", "The Three Stages of Temptation", "The Eleven Passions", "Litany of Humility"],
    relatedSaints: ["gregory-the-great", "thomas-aquinas"],
    year: "Moralia in Job, late 6th century",
    origin: "Patristic",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "WHAT \"CAPITAL\" MEANS\n\nNot the worst sins. The word is from caput, a head: a capital sin is one others come out of. St. Thomas: \"a capital vice is one from which other vices arise, chiefly by being their final cause\" - it stands to the rest \"what the head is to an animal, what the root is to a plant\" (I-II q. 84 a. 3).\n\nSo this is not a league table of wickedness. Murder is worse than gluttony and is not on the list. The list answers a different question: if you want to know where your sins are coming from, look here.\n\nTHE SEVEN\n\nGregory's own enumeration, in Book XXXI of the Moralia, runs: inanis gloria, invidia, ira, tristitia, avaritia, ventris ingluvies, luxuria.\n\n| Gregory's name | Usually now |\n| Vainglory // inanis gloria | Pride, in the popular list |\n| Envy // invidia | Envy |\n| Anger // ira | Wrath |\n| Melancholy // tristitia | Sloth, or acedia |\n| Avarice // avaritia | Greed |\n| Gluttony // ventris ingluvies | Gluttony |\n| Lust // luxuria | Lust |\n\nSt. Thomas gives the same seven and names Gregory as his authority (I-II q. 84 a. 4).\n\nWHERE PRIDE IS\n\nNot on the list - and this is the part most often lost. For Gregory pride is not one of the seven; it is the root they all grow from. He calls it the queen of the vices, who once she has taken a heart hands it over to the seven as to her generals, each leading its own army.\n\nThat arrangement says something the flat modern list cannot. Pride is not a sin among sins to be worked on alongside gluttony. It is the condition that makes the others possible, which is why humility is not one virtue among others either, and why a man can correct six of the seven and be further from God than when he started.\n\nTHE OTHER LIST\n\nSt. Paul had already put one alongside the fruits of the Spirit, in the same passage: \"Now the works of the flesh are manifest, which are fornication, uncleanness, immodesty, luxury, idolatry, witchcrafts, enmities, contentions, emulations, wraths, quarrels, dissensions, sects, envies, murders, drunkenness, revellings, and such like.\" (Galatians 5:19-21)\n\nSeventeen, and then \"and such like\" - Paul is not counting. Set against the twelve fruits three verses later, the contrast is not sin-by-sin but soil-by-soil: two lists of what grows, depending on what governs.\n\nWHERE TO READ MORE\n\n**St. Thomas, Summa I-II q. 84** — Article 3 on what 'capital' means, article 4 for the enumeration and the citation of Gregory.\nhttps://www.newadvent.org/summa/2084.htm\n\n**St. Gregory the Great, Moralia in Job, Book XXXI** — The source of the sevenfold list, and of pride standing outside it as their root.\nhttp://www.lectionarycentral.com/GregoryMoralia/Book31.html\n\n**Galatians 5:19-21, Douay-Rheims** — Paul's seventeen works of the flesh, three verses before the twelve fruits.\nhttps://www.drbo.org/chapter/55005.htm",
    background:
      "The list comes out of the desert. Evagrius of Pontus, in the fourth century, catalogued eight evil thoughts that assail a monk - the same material, differently cut, with vainglory and pride counted separately and acedia given its full weight as the noonday devil. Cassian brought the eight west. Gregory the Great, at the end of the sixth century, reorganised them into seven under pride, and that is the shape that lasted.\n\nIt is worth knowing that the list has moved. What Gregory calls tristitia - a heaviness, a sadness at spiritual good - became acedia and then sloth, and sloth in English drifted towards mere laziness, which is not what any of them meant. And vainglory quietly became pride in popular usage, which flattened Gregory's whole structure by demoting the root to one branch among seven.\n\nThe purpose of the list was practical, not taxonomic. It is a tool for the examination of conscience, and specifically for the question a bare list of sins cannot answer: not what did I do, but what in me keeps producing this. That is why the capital sins are traditionally paired with contrary virtues rather than merely forbidden - the remedy for a root is not vigilance but a different planting.",
  },
  {
    title: "The Eleven Passions",
    kind: "teaching",
    seedVersion: 2,
    tags: ["the soul", "self-knowledge", "temptation", "examination", "love", "virtue", "peace"],
    source: "St. Thomas, Summa I-II qq. 22-48, especially q. 23 and q. 25",
    author: "St. Thomas Aquinas",
    authorNote: "the division into concupiscible and irascible is older; the ordering is his",
    related: ["The Two Portions of the Soul", "The Three Stages of Temptation", "The Cardinal Virtues", "The Twelve Fruits of the Holy Spirit", "The Three Powers of the Soul"],
    relatedSaints: ["thomas-aquinas"],
    year: "Summa Theologiae, 1265-1274",
    origin: "Scholastic",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "TWO APPETITES\n\nBefore the eleven, a division. The passions are movements of the sensitive appetite - the part of us that is drawn and repelled before any choosing happens - and it works in two distinct ways.\n\n| Appetite | Its object |\n| The concupiscible | Good or evil \"simply apprehended as such, which causes pleasure or pain\" - the thing taken straight |\n| The irascible | Good or evil \"inasmuch as it is of an arduous or difficult nature\" - the thing taken as hard to get or hard to escape |\n\nThe same object engages both differently. A good simply seen is desired; the same good seen as difficult raises hope, or despair.\n\nTHE ELEVEN\n\n| In the concupiscible | |\n| Love | The first of them all, and the root of the rest |\n| Hatred | Love's contrary |\n| Desire | Love in movement towards what it does not yet have |\n| Aversion | Desire's contrary |\n| Joy | Love at rest in what it has |\n| Sadness | Joy's contrary |\n| In the irascible | |\n| Hope | The difficult good, judged possible |\n| Despair | The same good, judged out of reach |\n| Fear | The difficult evil, judged unavoidable |\n| Daring | The same evil, faced |\n| Anger | Alone, with no contrary passion of its own |\n\nLOVE FIRST\n\nEverything here starts in one place. Love is \"the aptitude or proportion of the appetite to good\" - the fit between what you are and what you are made for - and it comes before desire, because nothing moves towards what it has no aptitude for.\n\nSt. Thomas quotes Augustine to compress the whole sequence: \"Love yearning for the beloved object, is desire; and, having and enjoying it, is joy.\" (I-II q. 25 a. 2)\n\nAnd then: \"in respect of good, movement begins in love, goes forward to desire, and ends in hope\" (a. 4). Every passion in the list is love in one of its positions - reaching, resting, thwarted, or turned about.\n\nWHY NONE OF THIS IS SIN\n\nThe passions are movements, not choices. In themselves they are morally neutral; they become good or bad by what reason and will do with them. This is the machinery underneath the middle stage of a temptation: delight is a passion of the concupiscible appetite, and it can be violent, and it is still not consent - because consent is an act of the will, and the will is a different power altogether.\n\nIt is also why the cardinal virtues are placed where they are. Temperance is seated in the concupiscible appetite and fortitude in the irascible: the virtues do not suppress the passions, they train them, so that what is felt and what is willed stop pulling in opposite directions.\n\nWHERE TO READ MORE\n\n**St. Thomas, Summa I-II q. 23** — The concupiscible/irascible distinction (a. 1) and the enumeration of the eleven (a. 4).\nhttps://www.newadvent.org/summa/2023.htm\n\n**St. Thomas, Summa I-II q. 25** — Why love comes first and how the rest unfold from it. Article 2 is the one to read.\nhttps://www.newadvent.org/summa/2025.htm",
    background:
      "Twenty-seven questions of the Summa go on the passions - more than St. Thomas gives to the Incarnation. That proportion is worth registering, because the caricature of scholastic anthropology is that it is all intellect and will and has nothing to say about feeling.\n\nThe opposite is true. He takes the passions seriously enough to name eleven of them, distinguish them by object rather than by intensity, and insist they are not sins. A tradition that thought feeling was the enemy would not have bothered.\n\nNote what the division by object does. It stops you asking \"is this a good feeling or a bad feeling\" and makes you ask what the feeling is about and whether the thing is really as it appears - which is a question reason can answer. Fear and daring are the same evil seen from two positions; hope and despair are the same good, differently judged. Correcting the judgment corrects the passion, which is why so much of the spiritual tradition works on what a person believes about their situation rather than on what they feel about it.\n\nAnger is the odd one, alone without a contrary. St. Thomas's reason is that anger already contains a contrariety within itself: it is a movement against an evil that has been suffered, mixed with hope of redress, so nothing stands opposite it in the way hatred stands opposite love.",
  },
  {
    title: "The Four Senses of Scripture",
    kind: "teaching",
    seedVersion: 2,
    tags: ["Scripture", "reading", "contemplation", "catechetical", "study"],
    source: "CCC 115-119; the medieval couplet of Augustine of Dacia",
    author: "The Catechism, from the medieval tradition",
    authorNote: "the couplet is 13th-century, usually credited to Augustine of Dacia, O.P.",
    related: ["The Theological Virtues", "The Ladder of Monks", "Scripture Grows With the Reader", "We Hear Him When We Read"],
    relatedSaints: ["thomas-aquinas", "augustine"],
    year: "Ancient; the fourfold scheme settled by the Middle Ages",
    origin: "Patristic and medieval",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "TWO SENSES, THEN FOUR\n\n\"According to an ancient tradition, one can distinguish between two senses of Scripture: the literal and the spiritual, the latter being subdivided into the allegorical, moral and anagogical senses.\" (CCC 115)\n\n| Sense | What it reads |\n| The literal // CCC 116 | \"The meaning conveyed by the words of Scripture and discovered by exegesis, following the rules of sound interpretation.\" Everything else rests on it: \"all other senses of Sacred Scripture are based on the literal.\" |\n| The allegorical // CCC 117 | The event as a sign of Christ. The crossing of the Red Sea is a sign of his victory, and of baptism. |\n| The moral // CCC 117 | What the events \"ought to lead us to act\" — the text turned towards conduct. |\n| The anagogical // CCC 117 | The same realities \"in terms of their eternal significance\": the Church on earth as a sign of the heavenly Jerusalem. |\n\nThe word anagogical is worth keeping: from anagoge, a leading-up. It is the sense that reads a thing for where it is going.\n\nTHE COUPLET\n\nThe Middle Ages compressed all four into two lines of verse, so that a student could carry them:\n\nLittera gesta docet, quid credas allegoria,\nmoralis quid agas, quo tendas anagogia.\n\nThe Catechism gives it as: \"The Letter speaks of deeds; Allegory to faith; the Moral how to act; Anagogy our destiny.\" (CCC 118)\n\nRead that again with the theological virtues in view. Allegory is what you believe; the moral sense is how you act; anagogy is where you are going — faith, charity, hope. The fourfold reading of Scripture is the three theological virtues brought to bear on a text, standing on the literal sense as their floor.\n\nTHE ORDER IS A SAFEGUARD\n\nThe literal comes first and holds the rest up. That ordering is doing real work: without it the spiritual senses float free, and a text can be made to mean anything the reader already wanted. St. Thomas is blunt that nothing necessary to faith is contained in the spiritual sense that Scripture does not somewhere teach plainly through the literal.\n\nSo the four are not four options. They are one reading at four depths, and the deeper three are only as sound as the first.\n\nWHERE TO READ MORE\n\n**The Catechism, 115-119** — The whole scheme in five short paragraphs, with the medieval couplet at 118.\nhttps://www.vatican.va/content/catechism/en/part_one/section_one/chapter_two/article_3/iii_the_holy_spirit,_interpreter_of_scripture.html",
    background:
      "The scheme is older than the couplet and older than the Catechism's use of it. Origen distinguishes senses in the third century; Cassian in the fifth gives the four with Jerusalem as his worked example — the city itself literally, the Church allegorically, the soul morally, the heavenly city anagogically. That single example is probably why the fourfold stuck: it shows all four working on one word without any of them cancelling the others.\n\nThere is a reason a modern reader meets this with suspicion. Allegorical reading has been abused spectacularly, and the nineteenth century largely threw it out in favour of the literal alone. The Catechism keeps all four, and keeps the ordering that makes the abuse detectable: everything must be grounded in what the text actually says.\n\nWorth noticing what the scheme assumes. The spiritual senses are possible not because the words are elastic but because, in the Catechism's phrase, \"not only the text of Scripture but also the realities and events about which it speaks can be signs\" — history itself is held to signify. That is a claim about God's authorship of events, not about the reader's ingenuity, and it is what separates this from simply making things up.",
  },
  {
    title: "The Ladder of Monks",
    kind: "teaching",
    seedVersion: 2,
    tags: ["reading", "prayer", "contemplation", "meditation", "study", "the soul"],
    source: "Guigo II, Scala Claustralium (The Ladder of Monks), c. 1150",
    author: "Guigo II, Carthusian",
    authorNote: "ninth prior of the Grande Chartreuse; not a canonised saint",
    related: ["The Four Senses of Scripture", "The Three Powers of the Soul", "Every Saint Became a Saint Through Mental Prayer", "The Three Ways"],
    relatedSaints: [],
    year: "c. 1150",
    origin: "Carthusian",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "FOUR RUNGS\n\nGuigo saw \"a ladder with just four rungs, the one end standing on the ground, the other reaching into the clouds.\"\n\n| Rung | Guigo's definition |\n| Reading // lectio | \"Busily looking on Holy Scripture with all one's will and wit.\" |\n| Meditation // meditatio | \"A studious insearching with the mind to know what was before concealed.\" |\n| Prayer // oratio | \"A devout desiring of the heart to get what is good and avoid what is evil.\" |\n| Contemplation // contemplatio | \"The lifting up of the heart to God tasting somewhat of the heavenly sweetness and savour.\" |\n\nTHE IMAGE THAT EXPLAINS IT\n\n\"Reading puts as it were whole food into your mouth; meditation chews it and breaks it down; prayer finds its savour; contemplation is the sweetness that so delights and strengthens.\"\n\nWhich is a complete account of why reading alone does not nourish. The food is in the mouth and goes no further. It also explains the particular futility of reading a great deal of spiritual writing quickly: swallowing whole.\n\nGuigo's other compression: \"Reading seeks, meditation finds, prayer asks, contemplation feels.\"\n\nWHAT DEPENDS ON WHAT\n\nThe rungs are not four separate practices to be chosen between. Each is useless without the next: reading without meditation is idle, meditation without prayer has no effect, prayer without devotion is fruitless — and contemplation is not climbed to at all, but given, when the first three have prepared for it.\n\nThat last point is the one Guigo is most careful about. Three rungs are your work. The fourth is not.\n\nIt maps exactly onto the three powers of the soul, which is why the method has outlasted its monastery: reading puts the thing into the memory, meditation sets the understanding to work on it, prayer is the will responding. Contemplation is what happens when all three are quiet and God is not.\n\nWHERE TO READ MORE\n\n**Guigo II, The Ladder of Four Rungs** — The whole letter, in English, free. It is about twenty pages and repays being read in one sitting.\nhttps://www.umilta.net/ladder.html",
    background:
      "Written about 1150 by Guigo II, ninth prior of the Grande Chartreuse, as a letter to a fellow monk — the Scala Claustralium, the ladder of the cloistered. It is short, perhaps twenty pages, and it is the reason the phrase lectio divina names a method rather than a mood.\n\nThe ladder is Jacob's, from Genesis 28, and the choice matters: a ladder set on the earth with its top in heaven, with angels going both up and down. Guigo is describing something with traffic in both directions, not a self-improvement staircase.\n\nThe practical value of the scheme is diagnostic. When prayer has gone dead it is usually possible to say which rung has been skipped — most often the second, because meditation is slow and produces nothing visible, and most often the fault of the well-read, who mistake having read something for having chewed it.\n\nOne caution about the fourth rung. Guigo is describing a monastic life with hours of silence built into it, and the tradition after him has sometimes turned contemplation into a target to be achieved by technique, which is the exact opposite of his point. He puts it plainly: the first three are what a man does, and the fourth is what is done to him.",
  },
  {
    title: "The Three Ways",
    kind: "teaching",
    seedVersion: 2,
    tags: ["the soul", "contemplation", "virtue", "self-knowledge", "examination"],
    source: "St. Thomas, Summa II-II q. 24 a. 9; the terms from Pseudo-Dionysius and the tradition after him",
    author: "The spiritual tradition, with St. Thomas Aquinas",
    authorNote: "the three names are Dionysian; the three degrees of charity below are St. Thomas's own",
    related: ["The Theological Virtues", "The Dark Night", "The Ladder of Monks", "Consolation and Desolation", "The Cardinal Virtues"],
    relatedSaints: ["thomas-aquinas", "john-of-the-cross", "teresa-of-avila"],
    year: "The scheme patristic; St. Thomas 13th century",
    origin: "Patristic and scholastic",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE THREE\n\n| Way | Whose road it is | What the work is |\n| The purgative | Beginners | Getting free of sin and of the appetite for it |\n| The illuminative | Proficients | Growing in virtue; seeing by the light of faith what was only assented to |\n| The unitive | The perfect | Union with God, and delight in Him |\n\nWHAT ST. THOMAS ACTUALLY SAYS\n\nHe does not use the three names. He gives three degrees of charity, and the tradition laid the names over them (II-II q. 24 a. 9):\n\nThe beginner's chief concern is \"to avoid sin and resist his concupiscences\" — charity here has to be \"fed or fostered lest it be destroyed.\"\n\nThe proficient's is \"to aim at progress in good,\" strengthening charity \"by adding to it.\"\n\nThe perfect \"aim chiefly at union with and enjoyment of God,\" desiring \"to be dissolved and to be with Christ.\"\n\nNote what the divisions are made of. Not achievements, not consolations, not years elapsed — but what a person is chiefly concerned with. The question the scheme asks is: what is your attention mostly on? Staying out of trouble, getting better, or God Himself?\n\nWHAT THE MAP IS AND IS NOT\n\nIt is not a ladder with landings. St. Thomas's own image is growth: a body passes through stages without anyone announcing the crossing, and all three states remain possible to a wayfarer.\n\nNor is it a ranking of persons. A man may be a beginner at fifty and in the illuminative way at twenty, and someone deep in the third way is not thereby finished with the first — purgation does not stop, it goes deeper, which is the whole burden of the dark night.\n\nIts real use is diagnostic, and it cuts both ways. It stops a beginner expecting the consolations of the second way and concluding that prayer does not work. And it stops someone in the second way from mistaking the loss of the first way's comforts for regression, when the light has simply moved to where the eye cannot follow it.\n\nWHERE TO READ MORE\n\n**St. Thomas, Summa II-II q. 24 a. 9** — The three degrees of charity — beginners, proficients, the perfect — divided by what each is chiefly concerned with.\nhttps://www.newadvent.org/summa/3024.htm",
    background:
      "The three names come from Pseudo-Dionysius, writing about 500, who used purification, illumination and perfection to describe the hierarchies of angels and of the Church. Later writers took the scheme and turned it on the individual soul; by the high Middle Ages it was standard, and it is the frame inside which St. John of the Cross and St. Teresa both work.\n\nSt. Thomas's contribution is the part that keeps it honest. By grounding the divisions in degrees of charity rather than in experiences, he makes the scheme immune to the obvious abuse — measuring progress by how prayer feels. Charity is a disposition of the will, and the will is precisely the part not directly available to feeling.\n\nThe scheme's danger is the one every map has: mistaking it for the country. Spiritual writers of the seventeenth century sometimes produced elaborate charts with prescribed durations and symptoms, and the effect on scrupulous readers was predictable. Teresa's seven mansions are a finer-grained version of the same three, and she is careful to say the soul moves between rooms rather than graduating out of them.\n\nThe one thing the scheme is genuinely good for: recognising that the disappearance of a kind of prayer is not always a loss. Something that stops working may have stopped because it has been outgrown, and the tradition's three names are mostly a way of saying that this happens twice.",
  },
  {
    title: "The Dark Night",
    kind: "teaching",
    seedVersion: 3,
    tags: ["suffering", "contemplation", "the soul", "trust", "self-knowledge", "prayer"],
    source: "St. John of the Cross, The Dark Night, Book I ch. 9; The Ascent of Mount Carmel",
    author: "St. John of the Cross",
    authorNote: "the phrase is now used for almost any distress; his meaning is narrower",
    related: ["The Theological Virtues", "Consolation and Desolation", "The Three Ways", "The Two Portions of the Soul", "The Three Powers of the Soul"],
    relatedSaints: ["john-of-the-cross", "teresa-of-avila", "mother-teresa"],
    year: "c. 1578-1585",
    origin: "Carmelite",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "TWO NIGHTS\n\n| Night | What is being purified |\n| The night of sense | The appetite for consolation in prayer and in created things. Common, and usually early. |\n| The night of spirit | The deeper self-reliance in the faculties themselves — the mind's grip on its own understanding of God. Rarer, later, and far darker. |\n\nBoth are called night for three reasons in John's scheme: the point of departure is dark (going out from appetite), the road is dark (faith), and the destination is dark to us (God). The night is not an interruption of the journey. It is the journey.\n\nTHE THREE SIGNS\n\nThe pastorally serious part. Dryness in prayer may be God's purgation, or it may be lukewarmness, or sin, or illness — and these call for opposite responses. John gives three signs, and requires all three together (Dark Night I, 9):\n\n| Sign | What it is |\n| The first | \"When a soul finds no pleasure or consolation in the things of God, it also fails to find it in any thing created.\" Not selective dryness — the taste for substitutes has gone too. |\n| The second | \"That the memory is ordinarily centred upon God, with painful care and solicitude, thinking that it is not serving God, but is backsliding.\" The anxiety is itself about God, which is what tepidity never produces. |\n| The third | \"That the soul can no longer meditate or reflect in the imaginative sphere of sense as it was wont, however much it may of itself endeavour to do so.\" The old method has stopped working, and effort does not restart it. |\n\nThe second sign is the one that turns the whole thing round. The fear of having lost God is evidence against having lost Him: lukewarmness does not grieve.\n\nWHY IT LOOKS LIKE LOSS\n\nBecause of what the theological virtues do to the faculties they take hold of. Faith gives the understanding certainty without clarity; hope empties the memory of what it possessed; charity empties the will of every affection that is not God.\n\nA soul in which all three are working at once has, by definition, less to hold on to than before — and no way of telling from inside whether it is being emptied or simply losing everything. That is why John wrote signs rather than reassurances.\n\nWHAT IT IS NOT\n\nIt is not depression, and treating one as the other does harm in both directions. It is not desolation in the Ignatian sense, which is a movement to be resisted and which lifts. And it is not a mark of advancement to be sought — John's readers were people already given to prayer, wondering whether to turn back.\n\nA CASE THAT STRETCHES THE CATEGORIES\n\nMother Teresa's interior darkness is the best-documented modern instance, and it does not sit neatly in either framework. It began around 1948, as she started the work in Calcutta, and lasted with one brief respite until her death in 1997 — roughly fifty years of the sense of God's absence held alongside a longing for Him, while she founded and governed an order and was, to everyone who met her, evidently joyful.\n\nTest it against what is above. It is not Ignatian desolation: that is a movement to be resisted, and it lifts. It is not tepidity: the first sign fails, since nothing created consoled her either, and the second is written all over the letters. It has the shape of the night of the spirit.\n\nBut her director, Fr. Joseph Neuner, told her something that does not fit the purgative account, and it was his reading that finally gave her peace: that this was not chiefly for her own purification. It was a share in Christ's own abandonment, and in the darkness of the very people she served — the unwanted, and those who feel themselves without God. Her darkness was, on that reading, the interior side of her work rather than an obstacle to it.\n\nHe gave her one sign to hold, and it is John's second sign in different words: the thirst for God is itself the evidence of God's presence, since no one can long for God unless God is already there.\n\nSo the categories are not wrong, but they were built to answer a different question. John is describing purification — darkness aimed at the one in it. What Neuner described is reparative, a darkness borne on behalf of others. That possibility is old in the tradition and rarely tabulated, and it is why a rigid diagnostic chart would have failed her exactly when she needed it.\n\nWHERE TO READ MORE\n\n**St. John of the Cross, The Dark Night, Book I ch. 9** — The three signs, in his own words. If you read one page of him, read this one.\nhttps://www.ccel.org/ccel/john_cross/dark_night.vii.ix.html\n\n**St. John of the Cross, Ascent of Mount Carmel II, 6** — Why the theological virtues empty the faculties they take hold of — the reason the night looks like loss.\nhttps://www.ccel.org/ccel/john_cross/ascent.v.vi.html",
    background:
      "Written after his imprisonment. In 1577 John was seized by friars of his own order who opposed the reform, held for nine months in a cell in Toledo barely larger than his body, beaten weekly, and given the psalms and darkness. He escaped through a window with a rope of knotted strips. The poems came out of that, and the treatises are commentaries on the poems.\n\nThat order — poem first, explanation afterwards — matters for reading him. The Dark Night and the Ascent of Mount Carmel are both expositions of the same eight stanzas, and he never finished either; they stop mid-argument. What survives is a man analysing his own verse with the tools of a schoolman, which is why the prose can be simultaneously dry and incandescent.\n\nThe phrase has escaped him completely. \"Dark night of the soul\" now covers grief, burnout, depression and ordinary unhappiness, none of which he was describing. His subject is specific: what happens to a person who is praying seriously when God withdraws the sensible supports of prayer in order to work at a depth the person cannot reach or feel.\n\nThe three signs exist because he knew the diagnosis could go wrong in both directions, and that the pastoral cost was high either way — a director who tells someone in genuine purgation to try harder is prescribing exactly the wrong medicine, and one who tells a lukewarm soul it is in the dark night has flattered it into staying there.",
  },
  {
    title: "Consolation and Desolation",
    kind: "teaching",
    seedVersion: 3,
    tags: ["discernment", "the soul", "trust", "temptation", "self-knowledge", "prayer"],
    source: "St. Ignatius of Loyola, Spiritual Exercises, Rules for the Discernment of Spirits (First Week)",
    author: "St. Ignatius of Loyola",
    authorNote: "the rules were written for a retreatant under direction, not for solitary self-diagnosis",
    related: ["The Dark Night", "The Two Portions of the Soul", "The Three Stages of Temptation", "Suscipe", "The Three Ways"],
    relatedSaints: ["ignatius-of-loyola", "teresa-of-avila", "john-of-the-cross"],
    year: "Spiritual Exercises, composed 1522-1524",
    origin: "Ignatian",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE TWO MOVEMENTS\n\n| Movement | Ignatius's description |\n| Consolation // Rule 3 | \"When some interior movement in the soul is caused, through which the soul comes to be inflamed with love of its Creator and Lord\" — with increase of faith, hope and charity, and interior joy. |\n| Desolation // Rule 4 | \"Darkness of soul, disturbance in it, movement to things low and earthly, the unquiet of different agitations and temptations, moving to want of confidence, without hope, without love, when one finds oneself all lazy, tepid, sad, and as if separated from his Creator and Lord.\" |\n\nRead the two definitions again for what they are not. Neither is defined by pleasantness. Consolation is named by the direction it moves you — towards God, with the theological virtues increasing. A grief that draws you towards God is consolation. A contentment that settles you away from Him is not.\n\nTHE RULE THAT DOES THE MOST WORK\n\n\"In time of desolation never to make a change; but to be firm and constant in the resolutions and determination in which one was the day preceding such desolation.\" (Rule 5)\n\nThe reasoning is simple and hard to remember when it applies. In desolation the counsel available to you is coming from the wrong source, and it will present itself as clarity. So the decision belongs to the person you were before it descended, and to the person you will be after — never to the one inside it.\n\nThe corollary is that consolation is the time to decide, and desolation the time to hold; and that whatever is resolved in the light should be written down, because it will not be believed later.\n\nTHE ENEMY'S THREE HABITS\n\nIgnatius describes them as behaviours, which makes them recognisable:\n\nHe is weak when faced, and strong when fled from.\n\nHe behaves \"as a false lover\" who \"wants his words and persuasions to be secret\" — and when they are told to a confessor or director, \"it is very grievous to him,\" because he sees the deceit cannot succeed once said out loud.\n\nHe attacks where the defences are weakest, having first surveyed them.\n\nThe second is the practically decisive one. Nearly everything in this analysis depends on saying the thing to another person, which is why these rules were written for someone under direction and are least reliable when used alone.\n\nNOT THE SAME AS THE DARK NIGHT\n\nThey look alike from inside and call for opposite responses. Ignatian desolation is a movement to be resisted, examined for its cause, and outlasted; it lifts. The night of sense is God's own work, is not resisted but consented to, and does not lift on the same timescale.\n\nJohn of the Cross's three signs are the usual test: in desolation the taste for created consolations remains, and in the night it has gone too.\n\nTHE CARMELITE VOCABULARY IS DIFFERENT\n\nThe same two words do not mean the same things in Teresa and John of the Cross, and the mismatch causes real confusion, because a person reading both at once will get opposite counsel about the identical interior state.\n\nFor Ignatius the pair is a diagnostic. Consolation and desolation name movements, identified by the direction they pull, attributed to a source, and acted on by rules. Neither is defined by pleasantness — a grief drawing you towards God is consolation.\n\nThe Carmelites are not asking that question, and they do not use the words as a matched pair at all.\n\n| Term | Whose | What it means there |\n| Consolation, desolation | Ignatius | Movements to be read for their direction and origin; desolation resisted and outlasted |\n| Contentos // consolations | Teresa | Sweetness that begins in our own effort and ends in God — reached by meditation, as water reaches a fountain through aqueducts |\n| Gustos // spiritual delights | Teresa | Sweetness that begins in God and is simply given, welling up like a spring at its own source; not obtainable by effort |\n| Sequedad // dryness, aridity | John of the Cross | The withdrawal of sensible sweetness — which may be tepidity, or may be God's own purgation, distinguished by the three signs |\n\nWHAT THE DIFFERENCE COMES TO\n\nTeresa asks a question Ignatius does not: where did this come from — my own working, or God's giving? That is the whole point of separating contentos from gustos, and it is why she warns against straining after sweetness: what can be manufactured is by definition not the thing that matters most.\n\nJohn goes further and treats attachment to consolation as a fault with a name. Beginners, he says, \"think that all the business of prayer consists in experiencing sensible pleasure and devotion and they strive to obtain this by great effort\" — and he files that under spiritual gluttony, among the imperfections that make the night necessary in the first place.\n\nSo consolation has almost opposite roles in the two accounts. For Ignatius it is a sign to be read, and the time in which to decide. For John it is scaffolding to be weaned off, and clinging to it is the problem.\n\nThey are not contradicting each other. Ignatius is describing spirits moving a soul; John is describing God purifying one; Teresa is distinguishing what we produce from what we are given. The words overlap and the subjects do not — which is why the practical rules cannot be swapped. Ignatian desolation is resisted. Carmelite night is consented to. Getting that backwards means either fighting God or indulging tepidity.\n\nWHERE TO READ MORE\n\n**St. Ignatius, the Rules for the First Week** — All fourteen rules. Rules 3 and 4 define the two movements, rule 5 is the one that does the most work, rule 13 is the false lover.\nhttps://mycatholic.life/books/the-spiritual-exercises-of-saint-ignatius-of-loyola/rules/\n\n**St. John of the Cross, The Dark Night I, 9** — Read alongside, for the distinction the entry turns on: this is not what Ignatius is describing.\nhttps://www.ccel.org/ccel/john_cross/dark_night.vii.ix.html",
    background:
      "Ignatius worked these out on himself, convalescing at Loyola in 1521 with a shattered leg and nothing to read but a life of Christ and a book of saints. He noticed that daydreams of knightly glory left him dry afterwards, while thoughts of imitating Francis and Dominic left him content — and that the difference showed up not during but after. That single observation, that the movements can be told apart by their aftertaste rather than their intensity, is the seed of the whole method.\n\nThe rules are deliberately unmystical. They are a set of behaviours to notice and instructions on what to do, written in the imperative, closer to a field manual than to a treatise. Nothing in them requires unusual experiences.\n\nTwo cautions worth carrying. First, they were written for a person making the Exercises under a director, and the thirteenth rule says why: the analysis depends on the movements being spoken aloud to someone else. Used privately by an anxious person, the rules become one more thing to be anxious about.\n\nSecond, Ignatius is describing spiritual movements, not moods, and not illness. He had no framework for clinical depression and did not claim one. A desolation that does not lift, that has no discernible spiritual cause, and that touches sleep, appetite and the body, is a different question and needs a different kind of help.",
  },
  {
    title: "The Examen",
    kind: "teaching",
    seedVersion: 1,
    tags: ["examination", "self-examination", "conscience", "self-knowledge", "Ignatian", "the soul"],
    source: "St. Ignatius of Loyola, Spiritual Exercises, 43 — the General Examen",
    author: "St. Ignatius of Loyola",
    authorNote: "the five points are his; the daily form is how the tradition has kept it",
    related: ["Consolation and Desolation", "Suscipe", "The Three Powers of the Soul", "The Seven Capital Sins", "Act of Contrition"],
    relatedSaints: ["ignatius-of-loyola"],
    year: "Spiritual Exercises, composed 1522-1524",
    origin: "Ignatian",
    liturgical: "Nightly; twice daily in the full Exercises",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE FIVE POINTS\n\nSt. Ignatius sets them out in order, and the order is the argument (Spiritual Exercises, 43):\n\n| Point | What you do |\n| First | \"Give thanks to God our Lord for the benefits received.\" |\n| Second | \"Ask grace to know our sins and cast them out.\" |\n| Third | \"Ask account of our soul from the hour that we rose up to the present Examen, hour by hour, or period by period.\" |\n| Fourth | \"Ask pardon of God our Lord for the faults.\" |\n| Fifth | \"Purpose amendment with His grace.\" |\n\nIt closes with an Our Father.\n\nWHY THANKSGIVING COMES FIRST\n\nBecause an examination that opens with your faults produces a different person than one that opens with gifts received. Ignatius puts gratitude first deliberately: you look at the day as something given before you look at what you did with it. Reverse the order and the exercise curdles into a nightly audit, which is not what it is for.\n\nNotice too that the second point is a request for *grace* to see. He does not assume you can spot your own sins by trying harder — self-knowledge is asked for, not achieved.\n\nWHAT THE THIRD POINT ACTUALLY ASKS\n\nHour by hour, or period by period. Not \"how was today\" in general — the general question gets a general answer, and a general answer is useless. The instruction is to walk back through the day in sections, which is slower and much harder to fool.\n\nThoughts first, then words, then deeds — the order the tradition uses everywhere, because the deed is the last thing to go wrong and the easiest to notice.\n\nHOW LONG\n\nIgnatius intends something that fits inside a day, twice a day in the full Exercises. Fifteen minutes is generous; five done nightly is worth more than thirty done occasionally. The examen is the one Ignatian practice he expected everyone to keep even when everything else was dropped.\n\nWHERE TO READ MORE\n\n**The Spiritual Exercises, the General Examen** — the five points in Ignatius's own words, in the public-domain Mullan translation. The passage is short; the surrounding material on the particular examen is worth reading too.\nhttps://mycatholic.life/books/the-spiritual-exercises-of-saint-ignatius-of-loyola/first-week/",
    background:
      "The examen is the smallest piece of the Spiritual Exercises and the one Ignatius refused to let go of. In a well-known letter he told a correspondent that if the pressure of work meant dropping everything else, this was the practice to keep — the reasoning being that a person who never reviews the day never notices the pattern in it, and it is the pattern rather than the individual fault that shapes a life.\n\nTwo things distinguish it from an examination of conscience before confession. It is daily rather than occasional, and it is not primarily about sin: three of the five points are thanksgiving, petition and resolution. The Ignatian tradition sometimes calls it a review of consciousness rather than of conscience — looking for where God was at work in the day, not only where you failed.\n\nThe third point is the one people quietly skip, because walking back through the hours is slower than summarising them. It is also the only point that produces information you did not already have.",
  },
  {
    title: "How the Gifts, Fruits, Beatitudes, Virtues and Powers of the Soul Fit Together",
    kind: "teaching",
    seedVersion: 2,
    tags: ["catechetical", "the soul", "virtue", "study", "self-knowledge"],
    source: "St. Augustine, De sermone Domini in monte I-II; St. Thomas, Summa I-II qq. 69-70; St. John of the Cross, Ascent II",
    author: "Augustine, Aquinas and John of the Cross",
    authorNote: "assembled here; the correspondences are theirs, and the ones that are not are named as such",
    related: ["The Seven Gifts of the Holy Spirit", "The Beatitudes", "The Twelve Fruits of the Holy Spirit", "The Theological Virtues", "The Cardinal Virtues", "The Three Powers of the Soul"],
    relatedSaints: ["augustine", "thomas-aquinas", "john-of-the-cross", "ambrose"],
    year: "Augustine c. 394; Aquinas 13th century; John of the Cross 16th",
    origin: "Patristic and scholastic",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "WHY THIS EXISTS\n\nBecause the lists are not independent, and nobody says so in one place. The gifts, the beatitudes, the fruits, the virtues and the powers of the soul were joined to each other by particular writers for particular reasons — and other joinings, which look identical in a table, were invented later by nobody in particular.\n\nThis entry keeps the two apart.\n\nWHAT AUGUSTINE JOINED\n\nThe beatitudes to the gifts, in his commentary on the Sermon on the Mount, taking Matthew's list because it was spoken to disciples rather than to the crowd. His pairing runs downward: fear of the Lord to the poor in spirit, piety to the meek, knowledge to those who mourn, and so on up to wisdom and the peacemakers.\n\nThen, in the second book, he does something bolder and adds a third column: the seven petitions of the Our Father. \"If it is the fear of God through which the poor in spirit are blessed... let us ask that the name of God may be hallowed. If it is piety through which the meek are blessed... let us ask that His kingdom may come. If it is knowledge through which those who mourn are blessed, let us pray that His will may be done.\" (II, 38)\n\nSo gift, beatitude and petition are read as one thing seen three ways: what the Spirit gives, what it looks like in a life, and what we ask for.\n\nWHAT AMBROSE JOINED\n\nThe four beatitudes in Luke to the four cardinal virtues — a different list, a different pairing, for a different audience. Aquinas keeps both readings without forcing them together, noting that Ambrose is commenting on beatitudes \"propounded to the multitude\" and Augustine on those given to the more perfect.\n\nWHAT AQUINAS JOINED\n\nThe fruits to the beatitudes, by rank rather than one-to-one: every beatitude is a fruit, but not every fruit is a beatitude, because \"it is sufficient for a fruit to be something ultimate and delightful; whereas for a beatitude, it must be something perfect and excellent\" (I-II q. 70 a. 2).\n\nAnd the beatitudes to the gifts as act to habit (q. 69): a beatitude is not a different thing from a gift but the gift in operation, which is why beatitudes can be promised as rewards and gifts cannot.\n\nWHAT JOHN OF THE CROSS JOINED\n\nThe theological virtues to the powers of the soul: faith in the understanding, hope in the memory, charity in the will — each emptying the faculty it takes hold of.\n\nWHAT NOBODY JOINED\n\nCharts circulate pairing each of the seven gifts with one capital sin, one beatitude, one fruit and one petition, in tidy rows. The gift-beatitude-petition columns are Augustine's and can be defended. The rest are not his and not anyone else's in particular: the sins are Gregory's seven, drawn up three centuries later for a different purpose, and the twelve fruits will not divide into seven without being cut to fit.\n\nThe temptation is understandable — sevens attract each other. But a correspondence is only worth anything if someone actually argued for it, and the honest position is that these particular rows were assembled by later devotional writers for their symmetry.\n\nTHE ONE PATTERN THAT DOES RUN THROUGH\n\nNot a table but a shape, and all four writers assume it: God gives the disposition, the disposition issues in acts, and the acts are enjoyed.\n\nGifts and infused virtues are what is given. Beatitudes are those in operation. Fruits are the enjoyment of them — \"the first fruits of eternal glory\". The lists are not four parallel systems but one movement caught at three moments: what is planted, what it does, and what it tastes like.\n\nWHERE TO READ MORE\n\n**St. Augustine, On the Sermon on the Mount** — Book II is where he adds the petitions of the Our Father as a third column beside the gifts and the beatitudes. Section 38.\nhttps://www.newadvent.org/fathers/16012.htm\n\n**St. Thomas, Summa I-II q. 69** — How beatitudes relate to gifts, and why Augustine's and Ambrose's different pairings need not compete.\nhttps://www.newadvent.org/summa/2069.htm\n\n**St. Thomas, Summa I-II q. 70 a. 2** — Why every beatitude is a fruit but not every fruit a beatitude.\nhttps://www.newadvent.org/summa/2070.htm",
    background:
      "The medieval habit of correlating everything with everything is easy to mock and worth understanding first. It was a memory art before it was a theology: a student with no index and few books held material by hanging it on structures, and sevens hung well on sevens.\n\nThe trouble is that the aid became an assertion. Once the columns are drawn, a chart says by its shape that gift four causes beatitude four defeats sin four — a claim nobody makes in prose, and one that would be hard to defend if anyone did. That is how a mnemonic becomes a doctrine nobody taught.\n\nSo the test applied here is simple: did a named writer argue for this correspondence, giving reasons? Augustine did, twice. Ambrose did, for a different set. Aquinas argued about the relations between the lists rather than lining them up. John of the Cross assigned three virtues to three faculties and was explicit about why. Everything else in the circulating charts fails the test.\n\nKeeping the distinction is not pedantry. The genuine correspondences do work — Augustine's reading of the Our Father as a prayer for the seven gifts changes how the prayer is said. Invented ones do the opposite: they make the faith look like a filing system, and the moment a reader notices the rows do not really line up, the true joinings get discarded along with the false.",
  },
  {
    title: "The Three Stages of Temptation",
    kind: "teaching",
    seedVersion: 2,
    tags: ["temptation", "self-knowledge", "the soul", "chastity", "examination", "conscience"],
    source: "St. Francis de Sales, Introduction to the Devout Life, Part IV",
    author: "St. Francis de Sales",
    authorNote: "the threefold analysis is older than de Sales; his is the clearest statement of it",
    related: ["The Two Portions of the Soul", "The Three Powers of the Soul", "Litany of Chastity", "Litany of Humility"],
    relatedSaints: ["francis-de-sales"],
    year: "Introduction to the Devout Life, 1609",
    origin: "Devotional",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE THREE STAGES\n\nDe Sales sets them out in a line: \"Sin is proposed to it. 2. Which proposals are either pleasing or displeasing to the soul. 3. The soul either consents, or rejects them.\"\n\n| Stage | What happens | Is it sin? |\n| Suggestion | The thing is put before you. It arrives; you did not send for it. | No |\n| Delight // delectation | It is found pleasing. The lower part of the soul is drawn, and may be drawn strongly. | Not of itself |\n| Consent | The will says yes. | Yes — and only here |\n\nWHY THIS MATTERS\n\nBecause the whole weight falls on the third, and almost all the anxiety falls on the first two.\n\n\"The soul... cannot always refuse to experience temptation, although it be always in its power to refuse consent.\" A temptation felt is not a sin committed, and felt strongly is still not a sin committed. De Sales is blunt about how far this extends: \"If we should undergo the temptation to every sin whatsoever during our whole life, that would not damage us in the sight of God's majesty; provided we took no pleasure in it, and did not consent to it.\"\n\nThe middle stage is where scruples breed, because delight is felt and feels like guilt. But it can happen, he says, \"not only without consent from, but absolutely in contradiction to the superior will\" — which is the point of the two portions of the soul. What the lower part is drawn to and what the higher part wills can differ, and the man is where his will is.\n\n\"So long as we abide in our firm resolution to take no pleasure therein, we cannot offend God.\"\n\nTHE PRINCESS\n\nHis image for it: \"Picture to yourself a young princess beloved of her husband, to whom some evil wretch should send a messenger to tempt her to infidelity.\"\n\nThe messenger arrives — she did not invite him. He makes his proposal: that is the suggestion. She may be shaken by it: that is the delight, and it is not yet unfaithfulness. Only her yes would be. And here is the difference between her and us: \"the former has it in her power to drive away the messenger of evil and never hear him more, while the latter cannot always refuse to experience temptation, although it be always in its power to refuse consent.\"\n\nThe messenger cannot always be kept from the door. The answer can always be no.\n\nWHERE TO READ MORE\n\n**St. Francis de Sales, Introduction to the Devout Life, Part IV** — The chapter on temptation and consent, with the princess and the messenger. Free, and readable in ten minutes.\nhttps://www.ccel.org/ccel/desales/devout_life.vi.iii.html",
    background:
      "Part IV of the Introduction to the Devout Life is addressed to a reader who has begun to take the interior life seriously and has discovered that it did not make temptation stop — and who is now frightened by what goes on in his own head.\n\nDe Sales's whole strategy is to move the question off feeling and onto consent. He knows that the person who most needs this is the one least able to see it, because the felt experience of a strong temptation is almost indistinguishable from the felt experience of guilt.\n\nThe threefold analysis is not his invention — suggestion, delectation and consent were standard in moral theology long before him, and the substance is in the Fathers. What is his is the pastoral nerve: the willingness to say plainly that a lifetime of violent temptation, unconsented, does no damage at all in the sight of God.\n\nWorth reading alongside the two portions of the soul from his Treatise, which supplies the machinery this chapter leans on.",
  },
  {
    title: "The Two Portions of the Soul",
    kind: "teaching",
    seedVersion: 2,
    tags: ["the soul", "self-knowledge", "temptation", "suffering", "conscience"],
    source: "St. Francis de Sales, Treatise on the Love of God, Book I, ch. 11",
    author: "St. Francis de Sales",
    authorNote: "the superior/inferior distinction is scholastic; the treatment here is his",
    related: ["The Three Stages of Temptation", "The Three Powers of the Soul", "Stay with Me, Lord", "Anima Christi"],
    relatedSaints: ["francis-de-sales"],
    year: "Treatise on the Love of God, 1616",
    origin: "Devotional",
    liturgical: "",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE TWO PORTIONS\n\n| Portion | How it reasons |\n| The inferior // the lower part | It \"reasons and draws conclusions according to what it learns and experiences by the senses.\" What it knows, it knows from feeling and from what has happened to it. |\n| The superior // the higher part | It \"reasons and draws conclusions according to an intellectual knowledge not grounded upon the experience of sense, but on the discernment and judgment of the spirit.\" It can work by reason, or by the light of faith. |\n\nThey are not two souls. They are one soul working at two levels, and the levels can disagree — which is the whole reason the distinction is worth having.\n\nABRAHAM\n\n\"According to the inferior portion of his soul\" Abraham could not see how the promise of a son could be kept, and said so. \"According to his superior part he believed in God and it was reputed to him unto justice.\"\n\nBoth were true of the same man at the same moment. The doubt was real. The faith was also real, and it was the faith that counted, because that is where his will stood.\n\nGETHSEMANE\n\nDe Sales takes the distinction to the one place where it cannot be dismissed as a trick of psychology.\n\nOur Lord's soul was \"sorrowful even unto death\" — that is the inferior portion, and there is nothing feigned about it. And in the same breath: \"not my will, but thine be done\" — the superior portion, holding.\n\nThere was no sin anywhere in that. The dread was not a failure. It is the clearest possible statement that anguish and obedience can occupy the same soul at the same time.\n\nWHAT IT IS FOR\n\nChiefly this: you are not required to feel what you believe in order to be believing it.\n\nA man who is frightened, or dry in prayer, or violently drawn to something he has no intention of doing, is not thereby a hypocrite or a backslider. The lower part reports the storm; the higher part holds the course. The tradition puts the man where his will is, not where his feelings are — which is also why the middle stage of a temptation is not yet a sin.\n\nWHERE TO READ MORE\n\n**St. Francis de Sales, Treatise on the Love of God, Book I ch. 11** — The two portions, with Abraham and Gethsemane as the worked examples.\nhttps://www.ecatholic2000.com/desales/log15.shtml",
    background:
      "From the first book of the Treatise on the Love of God, where de Sales is laying groundwork before he says anything about love itself: what a soul is, and what parts of it are in play.\n\nThe distinction is old scholastic property — the superior and inferior reason go back through the schoolmen to Augustine — but de Sales does something particular with it. In the schools it settles questions about the gravity of sin. In his hands it becomes consolation: a way of telling a devout and anxious person that the war in them is not evidence against them.\n\nThe choice of examples is deliberate. Abraham is the father of believers, and he argued with the promise. Christ is sinless, and he sweated blood at the prospect. If those two can hold contradiction inside one soul without fault, so can the reader.\n\nThere is a further refinement in the next chapter, where he distinguishes four degrees of reason within the two portions, rising to what he calls the supreme point of the spirit — the summit where the soul touches God directly, above reasoning altogether. That is the part later writers borrowed most and understood least, and it is not reproduced here.",
  },
  {
    title: "The Works of Mercy",
    kind: "teaching",
    seedVersion: 3,
    tags: ["charity", "justice", "the poor", "examination"],
    source: "Corporal works from Matthew 25:35-36 and Tobit; spiritual works assembled by the tradition",
    author: "Traditional / Anonymous",
    related: ["Christ in the Beggar", "Love Proves Itself By Deeds", "The Four Last Things", "The Beatitudes"],
    relatedSaints: ["thomas-aquinas"],
    year: "Standard by the medieval period",
    origin: "Catechetical",
    liturgical: "Lent; the Jubilee of Mercy, 2016",
    feastDay: "",
    originalLanguage: "",
    favorite: false,
    body:
      "THE SEVEN CORPORAL WORKS\n1. Feed the hungry\n2. Give drink to the thirsty\n3. Clothe the naked\n4. Shelter the homeless\n5. Visit the sick\n6. Visit the imprisoned\n7. Bury the dead\n\nTHE SEVEN SPIRITUAL WORKS\n1. Instruct the ignorant\n2. Counsel the doubtful\n3. Admonish sinners\n4. Bear wrongs patiently\n5. Forgive offences willingly\n6. Comfort the afflicted\n7. Pray for the living and the dead\n\nWHERE TO READ MORE\n\n**St. Thomas, Summa II-II q. 32 a. 2** — Both sevens with the mnemonic verses, and the corporal list in its older form — ransoming the captive rather than visiting the imprisoned.\nhttps://www.newadvent.org/summa/3032.htm",
    background:
      "Six of the seven corporal works come straight out of Matthew 25 - the passage where Christ identifies Himself with the hungry, the thirsty, the stranger, the naked, the sick and the prisoner, and makes the judgement of the nations turn on them. The seventh, burying the dead, was added from the book of Tobit.\n\nThe spiritual works have no single scriptural list; the tradition assembled them as a deliberate parallel, on the reasoning that a person can be destitute in more than one way. Worth noticing that four of the seven are hard rather than pleasant - admonishing sinners, bearing wrongs, forgiving offences, counselling the doubtful - and that several cost nothing material at all, which removes the usual excuse.\n\nThis is the practical shape of what Chrysostom argues in 'Christ in the Beggar', also here: the Christ of Matthew 25 and the Christ of the altar are the same person, so honouring one while stepping over the other is a contradiction." +
      "\n\nThe pairing of seven with seven is St. Thomas Aquinas's, in the Summa (II-II q.32 a.2), where he sets out both lists with the mnemonic verses the schools used to memorise them — 'to visit, to quench, to feed, to ransom, clothe, harbour or bury' for the corporal works, and 'to counsel, reprove, console, to pardon, forbear, and to pray' for the spiritual. One word there has shifted: his fourth corporal work is ransoming the captive, which in a world of slavery and hostage-taking meant buying someone out of it. Modern lists say 'visit the imprisoned' — a narrowing worth noticing when you examine yourself on it.",
  },
  {
    title: "The Beatitudes",
    kind: "teaching",
    seedVersion: 5,
    tags: ["Sermon on the Mount", "biblical", "holiness"],
    source: "Matthew 5:3-12, the opening of the Sermon on the Mount",
    author: "Jesus Christ",
    related: ["The Works of Mercy", "Our Father", "Litany of Humility", "The Seven Gifts of the Holy Spirit"],
    relatedSaints: ["augustine", "ambrose", "thomas-aquinas"],
    year: "1st century",
    origin: "Biblical",
    liturgical: "All Saints' Day",
    feastDay: "",
    originalLanguage: "",
    favorite: true,
    body:
      "THE EIGHT — MATTHEW 5:3-12\n\nBlessed are the poor in spirit: for theirs is the kingdom of heaven.\nBlessed are the meek: for they shall possess the land.\nBlessed are they that mourn: for they shall be comforted.\nBlessed are they that hunger and thirst after justice: for they shall have their fill.\nBlessed are the merciful: for they shall obtain mercy.\nBlessed are the clean of heart: for they shall see God.\nBlessed are the peacemakers: for they shall be called children of God.\nBlessed are they that suffer persecution for justice' sake: for theirs is the kingdom of heaven.\n\nBlessed are ye when they shall revile you, and persecute you, and speak all that is evil against you, untruly, for my sake: be glad and rejoice, for your reward is very great in heaven.\n\nMATTHEW AND LUKE COMPARED\n\n| Matthew 5 — on the mountain | Luke 6 — on the plain |\n| Poor in spirit — v. 3 // for theirs is the kingdom of heaven | Blessed are ye poor — v. 20 // for yours is the kingdom of God |\n| The meek — v. 4 // for they shall possess the land | not in Luke |\n| They that mourn — v. 5 // for they shall be comforted | Ye that weep now — v. 21 // for you shall laugh |\n| Hunger and thirst after justice — v. 6 // for they shall have their fill | Ye that hunger now — v. 21 // for you shall be filled |\n| The merciful — v. 7 // for they shall obtain mercy | not in Luke |\n| The clean of heart — v. 8 // for they shall see God | not in Luke |\n| The peacemakers — v. 9 // for they shall be called children of God | not in Luke |\n| Persecuted for justice' sake — v. 10 // for theirs is the kingdom of heaven | not in Luke |\n| Reviled for my sake — vv. 11-12 // your reward is very great in heaven | When men shall hate you — vv. 22-23 // your reward is great in heaven |\n\nMark and John contain no beatitudes at all.\n\nLUKE'S FOUR WOES — LUKE 6:24-26\n\nWoe to you that are rich: for you have your consolation.\nWoe to you that are filled: for you shall hunger.\nWoe to you that now laugh: for you shall mourn and weep.\nWoe to you when men shall bless you: for according to these things did their fathers to the false prophets.\n\nWHERE TO READ MORE\n\n**Matthew 5, Douay-Rheims** — The eight, with the meek at v. 4 and the mourners at v. 5 — the Vulgate order.\nhttps://www.drbo.org/chapter/47005.htm\n\n**Luke 6, Douay-Rheims** — The four, and the four woes, at vv. 20-26.\nhttps://www.drbo.org/chapter/49006.htm\n\n**The Catechism, 1716** — The Catechism's own text of them, in the RSV, with the order reversed from the Douay.\nhttp://www.scborromeo.org/ccc/para/1716.htm\n\n**St. Thomas, Summa I-II q. 69** — How a beatitude relates to a gift and to a virtue — act against habit.\nhttps://www.newadvent.org/summa/2069.htm",
    background:
      "The opening of the Sermon on the Mount, and read on All Saints' Day because the Church takes them as the portrait of a saint - not eight kinds of person but eight facets of one.\n\nThe Greek makarios, rendered 'blessed', is stronger than 'happy' and quite different from 'lucky': it names the state of one whose situation is genuinely good regardless of how it looks from outside. Which is the whole difficulty, since every condition named - poverty, mourning, hunger, persecution - is one nobody would choose. The claim is not that these things are good in themselves but that the kingdom reverses the ledger.\n\nLuke has a shorter parallel (6:20-23) with four beatitudes and four matching woes, and Luke is blunter: 'blessed are the poor', not 'poor in spirit'. The difference has been argued over for centuries, and is worth knowing before leaning hard on either version." +
      "\n\nSt. Augustine's De sermone Domini in monte reads them against the seven gifts of the Spirit, one beatitude to each gift; St. Ambrose, commenting on the four beatitudes in Luke rather than the eight in Matthew, reads them against the four cardinal virtues instead. St. Thomas Aquinas keeps both readings in the Summa (I-II q.69) and explains why they need not compete: the virtues and the gifts are the settled dispositions, and the beatitudes are the acts that come out of them." +
      "\n\nThe Beatitudes are not a harmony of the four Gospels: only Matthew and Luke have any, and Mark and John have none. Matthew gives eight, spoken on a mountain, in the third person, and spiritualised — 'poor in spirit', 'hunger and thirst after justice'. Luke gives four, spoken on a level place, in the second person and blunt — 'blessed are ye poor', 'ye that hunger now' — and pairs each with a matching woe, which Matthew has not got. Whether one evangelist spiritualised the other's blunter version or Luke sharpened Matthew's is an old argument and not a settled one.\n\nThe Catechism (CCC 1716) prints Matthew's, so those are the ones catechesis works from. Two differences from the text above are worth knowing about, because they can make you think you have misremembered it. The Catechism quotes the RSV, which reads 'inherit the earth', 'righteousness', 'pure in heart', 'sons of God' where the Douay here reads 'possess the land', 'justice', 'clean of heart', 'children of God'. And the order of the second and third differs: the Vulgate and the Douay after it put the meek at v. 4 and the mourners at v. 5, while the Greek behind modern translations — and the Catechism with it — has them the other way round. Both orders are ancient; neither is a mistake." +
      "\n\nThe second half of each — the promise — is doing as much work as the first, and it is where the two Gospels diverge most. Matthew promises 'the kingdom of heaven' where Luke promises 'the kingdom of God'; the usual explanation is that Matthew, writing for readers who avoided saying the divine name, uses 'heaven' as a reverent substitute, and that the two phrases mean one thing. Matthew's mourners 'shall be comforted' where Luke's weepers 'shall laugh' — the same promise, one of them stated gently and the other not. And the promises are not eight different rewards: the first and the eighth are given the identical one, 'for theirs is the kingdom of heaven', which closes the list back onto its opening. What lies between — the land, comfort, filling, mercy, the sight of God, the name of children — reads less as a list of separate payments than as one thing described from eight sides. All but two of the promises are in the future tense; those two are in the present.",
  },
];

async function seedDefaultsIfEmpty() {
  const existing = await listLibrary();
  for (const seed of SEED_LIBRARY_ENTRIES) {
    // Match by title alone (not title+kind) — a later fix to a seed entry's
    // kind must still be recognized as the same entry, or it re-inserts a
    // duplicate under the new kind instead of updating the existing one.
    const already = existing.find((e) => e.title === seed.title);
    // Seeding is one-shot per entry — otherwise every reload would overwrite
    // whatever had been edited here. The cost is that a correction to a seed
    // entry (a wrong kind, a missing saint link) could never reach a device
    // that already had the old copy. seedVersion is the way through: bump it
    // on the seed definition and that one entry is re-seeded, once.
    const stale = already && (already.seedVersion || 1) < (seed.seedVersion || 1);
    if (already && already.author && !stale) continue;
    await saveLibraryEntry({ ...seed, id: already ? already.id : null });
  }
}

// One-time safety net: cleans up exact-title duplicates that the matching
// bug above could have already created (e.g. one "quote" copy and one
// "prayer" copy of the same entry, from a kind correction made before the
// fix). Keeps whichever copy matches the current seed definition's kind.
// Seed entries that were shipped once and have since been renamed, merged, or
// withdrawn. Removing one from SEED_LIBRARY_ENTRIES is not enough: seeding
// only ever adds or backfills, so a copy saved to a browser on an earlier
// visit stays there forever. Listing its old title here prunes it on next
// load.
//
// Only ever put a title here that this app itself seeded — the match is by
// exact title, so a hand-written entry sharing the name would also go.
const RETIRED_SEED_TITLES = [
  // Merged into the single "Preces for Mental Prayer" entry, Aug 2026.
  "Preces Before Mental Prayer",
  "Preces After Mental Prayer",
  // Renamed twice on 2 Sept 2026 — the first title named no lists at all, and
  // the second left out the virtues and the powers of the soul. Both are listed
  // because either may already have seeded into a browser between renames.
  "How These Lists Fit Together",
  "How the Gifts, Beatitudes and Fruits Fit Together",
];

async function pruneRetiredSeeds() {
  const entries = await listLibrary();
  for (const e of entries) {
    if (RETIRED_SEED_TITLES.includes(e.title)) await deleteLibraryEntry(e.id);
  }
}

async function dedupeLibraryByTitle() {
  const entries = await listLibrary();
  const byTitle = new Map();
  entries.forEach((e) => {
    if (!byTitle.has(e.title)) byTitle.set(e.title, []);
    byTitle.get(e.title).push(e);
  });
  const seedKindByTitle = new Map(SEED_LIBRARY_ENTRIES.map((s) => [s.title, s.kind]));
  for (const [title, group] of byTitle) {
    if (group.length < 2) continue;
    const canonicalKind = seedKindByTitle.get(title);
    const keep = group.find((e) => e.kind === canonicalKind) || group[0];
    for (const e of group) {
      if (e.id !== keep.id) await deleteLibraryEntry(e.id);
    }
  }
}

// --- View switching ---

function setView(view) {
  state.view = view;
  $("#view-library-editor").classList.remove("active");
  $("#view-library-reader").classList.remove("active");
  $("#view-library-filters").classList.remove("active");
  $("#view-writer").classList.remove("active");
  $("#view-saints-filters").classList.remove("active");
  $("#view-saint-reader").classList.remove("active");
  $("#view-flashcards").classList.remove("active");
  $("#view-saints-calendar").classList.remove("active");
  $("#view-saints-atlas").classList.remove("active");
  $("#view-finder").classList.remove("active");
  if (view === "day" || view === "library" || view === "journal" || view === "saints") {
    switchTab(view);
  } else if (view === "library-editor") {
    $("#view-library-editor").classList.add("active");
  } else if (view === "library-reader") {
    $("#view-library-reader").classList.add("active");
  } else if (view === "library-filters") {
    $("#view-library-filters").classList.add("active");
  } else if (view === "writer") {
    $("#view-writer").classList.add("active");
  } else if (view === "saints-filters") {
    $("#view-saints-filters").classList.add("active");
  } else if (view === "saint-reader") {
    $("#view-saint-reader").classList.add("active");
  } else if (view === "flashcards") {
    $("#view-flashcards").classList.add("active");
  } else if (view === "saints-calendar") {
    $("#view-saints-calendar").classList.add("active");
  } else if (view === "saints-atlas") {
    $("#view-saints-atlas").classList.add("active");
  } else if (view === "finder") {
    $("#view-finder").classList.add("active");
  }
}

// --- Routing ---------------------------------------------------------------
//
// Hash routing rather than path routing, and not as a stylistic choice: with a
// path (/e/the-rosary) the part after the domain goes to a server, which has to
// be told to serve index.html for a path that has no file behind it. GitHub
// Pages cannot rewrite, and under file:// there is no server at all — the
// browser just looks for a file that isn't there. Everything after "#" is never
// sent anywhere, so the same links work offline from a double-clicked file, on
// localhost, and on the deployed site, with no configuration.
//
// Entry ids can't appear in a URL: they are generated per device, so the same
// prayer has a different id in every browser. The stable identity is the title
// — which is what seeding and deduping already match on — so slugs come from
// titles, with retired titles kept as aliases so old links still resolve.

const TITLE_ALIASES = {
  "how-these-lists-fit-together":
    "How the Gifts, Fruits, Beatitudes, Virtues and Powers of the Soul Fit Together",
  "how-the-gifts-beatitudes-and-fruits-fit-together":
    "How the Gifts, Fruits, Beatitudes, Virtues and Powers of the Soul Fit Together",
  "preces-before-mental-prayer": "Preces for Mental Prayer",
  "preces-after-mental-prayer": "Preces for Mental Prayer",
};

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function entryBySlug(slug) {
  const direct = state.libraryEntries.find((e) => slugify(e.title) === slug);
  if (direct) return direct;
  const aliased = TITLE_ALIASES[slug];
  return aliased ? state.libraryEntries.find((e) => e.title === aliased) : null;
}

// Set while the app writes the hash itself, so its own writes don't bounce back
// through the router as if the user had navigated.
let writingHash = false;

function setHash(hash) {
  if (location.hash === hash) return; // no event would fire; don't arm the flag
  writingHash = true;
  location.hash = hash;
}

const TAB_ROUTES = ["day", "library", "journal", "saints"];

function routeFromHash() {
  const raw = decodeURIComponent((location.hash || "").replace(/^#\/?/, ""));
  const head = raw.split("/")[0];
  const rest = raw.split("/").slice(1).join("/");

  if (head === "e" && rest) {
    const entry = entryBySlug(rest);
    if (entry) return openLibraryReader(entry.id);
  }
  if (head === "s" && rest && typeof saintBySlug === "function" && saintBySlug(rest)) {
    switchTab("saints");
    return openSaintReader(rest);
  }
  if (TAB_ROUTES.includes(head)) return setView(head);
  return setView("library");
}

function switchTab(tab) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  $$(".tabpanel").forEach((p) => p.classList.toggle("active", p.dataset.tab === tab));
  // The "next" marker depends on the clock, so recompute on every visit.
  if (tab === "day") renderDay();
  setHash("#/" + tab);
}

// --- Day: the shape of an ordinary day -------------------------------------
//
// Mario's actual rule, given 2 Sept 2026. Two kinds of moment: those the clock
// decides, and those an occasion decides. The point of the tab is that most of
// the time you should not have to search for anything — the day already knows
// what comes next.

const RULE_CLOCK = [
  { when: "On waking", title: "Morning Offering", hour: 7 },
  { when: "Every hour", title: "Hourly Prayers of St. John Chrysostom", hourly: true,
    note: "One arrow for each hour, day and night" },
  { when: "Noon", title: "The Angelus", easterTitle: "Regina Caeli", hour: 12 },
  { when: "Six in the evening", title: "The Angelus", easterTitle: "Regina Caeli", hour: 18 },
  { when: "Before bed", title: "The Examen", hour: 22,
    note: "Thanks first, then the day hour by hour" },
  { when: "Closing your eyes", title: "Night Prayer", hour: 23 },
];

const RULE_OCCASION = [
  { when: "Before mental prayer", title: "Escape from Your Everyday Business",
    note: "The opening of St. Anselm's Proslogion" },
  { when: "After mental prayer", title: "Preces for Mental Prayer" },
  { when: "Entering the chapel", title: "Love Undefiled" },
  { when: "Before Mass", title: "Prayer Before Mass" },
  { when: "At Communion", title: null, note: "Private" },
  { when: "After Mass", title: "Stay with Me, Lord", alt: "Prayer Before the Crucifix",
    note: "Or left open" },
  { when: "At meals", title: "Guardian Angel Prayer",
    note: "And a thought for the angels of those at the table" },
  { when: "Seeing someone in the street", title: null,
    note: "The sign of the cross over people and things, as a blessing" },
];

function entryByTitle(title) {
  return title ? state.libraryEntries.find((e) => e.title === title) : null;
}

// The Angelus gives way to the Regina Caeli through Eastertide — the one
// substitution the rule makes on its own.
function ruleTitleFor(item) {
  if (item.easterTitle && liturgicalSeason(new Date()).key === "easter") return item.easterTitle;
  return item.title;
}

function renderDay() {
  const host = $("#day-content");
  if (!host) return;
  const now = new Date();
  const hour = now.getHours();

  // The next timed moment still ahead today, so the eye has somewhere to go.
  const timed = RULE_CLOCK.filter((r) => !r.hourly);
  const next = timed.find((r) => r.hour > hour) || timed[0];

  const row = (item, isNext) => {
    const title = ruleTitleFor(item);
    const entry = entryByTitle(title);
    const alt = entryByTitle(item.alt);
    const openable = entry || alt;
    return (
      `<div class="day-row${isNext ? " is-next" : ""}${openable ? "" : " day-row-plain"}"` +
      (entry ? ` data-id="${entry.id}"` : "") + `>` +
      `<div class="day-when">${escapeHtml(item.when)}${isNext ? '<span class="day-next-tag">next</span>' : ""}</div>` +
      `<div class="day-what">` +
      (title ? `<span class="day-title">${escapeHtml(title)}</span>` : "") +
      // Attribution comes from the entry itself rather than being written out
      // here, so it stays whatever the library says — including "Traditional"
      // where no author is established.
      (entry && entry.author ? `<span class="day-author">${escapeHtml(entry.author)}</span>` : "") +
      (alt
        ? `<span class="day-alt" data-id="${alt.id}">or ${escapeHtml(item.alt)}` +
          (alt.author ? ` <span class="day-alt-author">— ${escapeHtml(alt.author)}</span>` : "") +
          `</span>`
        : "") +
      (item.note ? `<span class="day-note">${escapeHtml(item.note)}</span>` : "") +
      (title && !entry ? `<span class="day-missing">not in the library yet</span>` : "") +
      `</div></div>`
    );
  };

  const hourly = RULE_CLOCK.find((r) => r.hourly);
  const hourlyEntry = entryByTitle(hourly.title);

  host.innerHTML =
    `<div class="day-group-label">Through the day</div>` +
    RULE_CLOCK.map((r) => row(r, r === next && !r.hourly)).join("") +
    `<div class="day-group-label">As it comes</div>` +
    RULE_OCCASION.map((r) => row(r, false)).join("") +
    (hourlyEntry ? "" : "");

  $$(".day-row[data-id]", host).forEach((el) =>
    el.addEventListener("click", () => openLibraryReader(el.dataset.id))
  );
  $$(".day-alt[data-id]", host).forEach((el) =>
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openLibraryReader(el.dataset.id);
    })
  );
}

// --- Library ---

async function refreshLibrary() {
  state.libraryEntries = await listLibrary();
  renderLibraryList();
  renderDay();
  renderLinkOptions();
  buildLibraryBodyIndex(); // fire-and-forget — search picks up matches as entries come in
}

// Fetches the full text (body/background/original-language text) of every
// library entry not yet indexed, so search can match words inside a prayer
// itself, not just its title/tags/source. Runs in the background — doesn't
// block the list from rendering — and re-renders once done so an in-progress
// search picks up newly indexed entries.
async function buildLibraryBodyIndex() {
  const missing = state.libraryEntries.filter((e) => !(e.id in state.libraryBodyIndex));
  if (missing.length === 0) return;
  await Promise.all(
    missing.map(async (e) => {
      try {
        const { body, background, latinBody } = await getLibraryEntryText(e.id);
        state.libraryBodyIndex[e.id] = [body, background, latinBody].filter(Boolean).join(" \n ").toLowerCase();
      } catch {
        state.libraryBodyIndex[e.id] = "";
      }
    })
  );
  if (state.view === "library" || state.view === "library-filters") renderLibraryList();
}

function allTags(entries) {
  const set = new Set();
  entries.forEach((e) => e.tags.forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

function allOrigins(entries) {
  const set = new Set();
  entries.forEach((e) => e.origin && set.add(e.origin));
  return Array.from(set).sort();
}

function allLiturgical(entries) {
  const set = new Set();
  entries.forEach((e) => e.liturgical && set.add(e.liturgical));
  return Array.from(set).sort();
}

function allAuthors(entries) {
  const counts = new Map();
  entries.forEach((e) => e.author && counts.set(e.author, (counts.get(e.author) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function sortLibraryEntries(entries) {
  const sorted = entries.slice();
  if (state.sortBy === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (state.sortBy === "kind") {
    sorted.sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind.localeCompare(b.kind)));
  } else {
    sorted.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  }
  return sorted;
}

function toggleTagFilter(tag) {
  if (state.filterTags.has(tag)) state.filterTags.delete(tag);
  else state.filterTags.add(tag);
  renderLibraryList();
}

function toggleAuthorFilter(author) {
  state.filterAuthor = state.filterAuthor === author ? null : author;
  renderLibraryList();
}

function toggleOriginFilter(origin) {
  state.filterOrigin = state.filterOrigin === origin ? null : origin;
  renderLibraryList();
}

function toggleLiturgicalFilter(season) {
  state.filterLiturgical = state.filterLiturgical === season ? null : season;
  renderLibraryList();
}

// The pool the filter panel offers choices from. When the finder has narrowed
// things, offering authors and tags from the whole library is misleading: most
// of them would return nothing inside the current set.
function filterOptionPool() {
  return state.finderRestrict
    ? state.libraryEntries.filter((e) => state.finderRestrict.ids.has(e.id))
    : state.libraryEntries;
}

function renderTagChipRow() {
  const row = $("#tag-chip-row");
  row.innerHTML = allTags(filterOptionPool())
    .map(
      (t) =>
        `<span class="chip tag-select-chip${state.filterTags.has(t) ? " active" : ""}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`
    )
    .join("");
  $$(".tag-select-chip", row).forEach((chip) => chip.addEventListener("click", () => toggleTagFilter(chip.dataset.tag)));
}

function renderOriginChipRow() {
  const row = $("#filter-origin-row");
  const origins = allOrigins(filterOptionPool());
  row.innerHTML = origins.length
    ? origins
        .map(
          (o) =>
            `<span class="chip origin-select-chip${state.filterOrigin === o ? " active" : ""}" data-origin="${escapeHtml(o)}">${escapeHtml(o)}</span>`
        )
        .join("")
    : `<span class="filter-empty-note">No origin/tradition data yet</span>`;
  $$(".origin-select-chip", row).forEach((chip) => chip.addEventListener("click", () => toggleOriginFilter(chip.dataset.origin)));
}

function renderLiturgicalChipRow() {
  const row = $("#filter-liturgical-row");
  const seasons = allLiturgical(filterOptionPool());
  row.innerHTML = seasons.length
    ? seasons
        .map(
          (s) =>
            `<span class="chip liturgical-select-chip${state.filterLiturgical === s ? " active" : ""}" data-season="${escapeHtml(s)}">${escapeHtml(s)}</span>`
        )
        .join("")
    : `<span class="filter-empty-note">No liturgical-use data yet</span>`;
  $$(".liturgical-select-chip", row).forEach((chip) => chip.addEventListener("click", () => toggleLiturgicalFilter(chip.dataset.season)));
}

function renderAuthorSelect() {
  const select = $("#filter-author-select");
  const authors = allAuthors(filterOptionPool());
  select.innerHTML =
    `<option value="">All authors</option>` +
    authors.map(([name, count]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${count})</option>`).join("");
  select.value = state.filterAuthor || "";
}

function syncKindChipActiveState() {
  $$(".kind-chip").forEach((c) => c.classList.toggle("active", c.dataset.kind === state.filterKind));
}

function activeFilterList() {
  const list = [];
  if (state.filterKind !== "all") list.push({ type: "kind", value: "", label: `Kind: ${KIND_LABELS[state.filterKind] || state.filterKind}` });
  state.filterTags.forEach((t) => list.push({ type: "tag", value: t, label: "#" + t }));
  if (state.finderRestrict)
    list.push({ type: "finder", value: "", label: "From: " + state.finderRestrict.label });
  if (state.filterAuthor) list.push({ type: "author", value: "", label: "Author: " + state.filterAuthor });
  if (state.filterOrigin) list.push({ type: "origin", value: "", label: "Origin: " + state.filterOrigin });
  if (state.filterLiturgical) list.push({ type: "liturgical", value: "", label: "Season: " + state.filterLiturgical });
  if (state.filterFavoritesOnly) list.push({ type: "favorites", value: "", label: "★ Favourites" });
  if (state.filterBilingualOnly) list.push({ type: "bilingual", value: "", label: "Bilingual" });
  return list;
}

function removeActiveFilter(type, value) {
  if (type === "kind") state.filterKind = "all";
  else if (type === "tag") state.filterTags.delete(value);
  else if (type === "finder") state.finderRestrict = null;
  else if (type === "author") state.filterAuthor = null;
  else if (type === "origin") state.filterOrigin = null;
  else if (type === "liturgical") state.filterLiturgical = null;
  else if (type === "favorites") state.filterFavoritesOnly = false;
  else if (type === "bilingual") state.filterBilingualOnly = false;
  renderLibraryList();
}

function renderActiveFilterChips() {
  const row = $("#active-filter-chips");
  const filters = activeFilterList();
  row.innerHTML = filters
    .map(
      (f) =>
        `<span class="chip active-filter-chip" data-type="${f.type}" data-value="${escapeHtml(f.value)}">${escapeHtml(f.label)}<span class="x">✕</span></span>`
    )
    .join("");
  $$(".active-filter-chip", row).forEach((chip) =>
    chip.addEventListener("click", () => removeActiveFilter(chip.dataset.type, chip.dataset.value))
  );
}

function updateFilterBadge() {
  const count = activeFilterList().length;
  const badge = $("#filter-count-badge");
  badge.textContent = String(count);
  badge.classList.toggle("hidden", count === 0);
}


// One byline, two controls — the name goes to the person, the chip filters the
// list. Same rule as the reader, so "the author's name" never means two
// different things depending on where you clicked it. The dossier half is
// omitted entirely for authors who have no dossier, and the filter chip
// doubles as the way to clear a filter it set.
function renderByline(e) {
  const slug = saintSlugForAuthor(e.author);
  const active = state.filterAuthor === e.author;
  const name = slug
    ? `<span class="byline-name has-dossier" data-slug="${escapeHtml(slug)}" title="Read the dossier for ${escapeHtml(e.author)}">${escapeHtml(e.author)}<span class="author-go" aria-hidden="true">✝</span></span>`
    : `<span class="byline-name">${escapeHtml(e.author)}</span>`;
  const chip = `<button class="byline-filter${active ? " active" : ""}" data-author="${escapeHtml(e.author)}" title="${
    active ? "Clear this filter" : "Show only entries by " + escapeHtml(e.author)
  }">${active ? "clear" : "filter"}</button>`;
  return `<div class="byline${active ? " active" : ""}">— ${name}${chip}</div>`;
}

// --- "For today" shelf ----------------------------------------------------
//
// The library used to open on whatever was added most recently, which is the
// authoring order, not the praying order. This answers the likely need before
// anything is clicked: the season, the day, and a favourite to fall back on.
// It shows only when nothing is being filtered or searched — the moment the
// user states a need of their own, it gets out of the way.

// Anonymous Gregorian computus. Everything movable hangs off this date.
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const DAY = 86400000;

// Approximate but honest: Christmastide is cut at 13 January rather than the
// true Baptism of the Lord, and Ordinary Time is simply "none of the above".
function liturgicalSeason(now) {
  const y = now.getFullYear();
  const easter = easterSunday(y);
  const ash = new Date(easter.getTime() - 46 * DAY);
  const pentecost = new Date(easter.getTime() + 49 * DAY);
  const christmas = new Date(y, 11, 25);
  // Advent opens on the fourth Sunday before Christmas.
  const advent = new Date(christmas.getTime() - ((christmas.getDay() || 7) + 21) * DAY);
  if (now >= advent && now < christmas) return { key: "advent", label: "Advent" };
  if (now >= christmas || now < new Date(y, 0, 14)) return { key: "christmas", label: "Christmastide" };
  if (now >= ash && now < easter) return { key: "lent", label: "Lent" };
  if (now >= easter && now <= pentecost) return { key: "easter", label: "Eastertide" };
  return { key: "ordinary", label: "" };
}

// Matches a season or theme against both tags and the free-text liturgical
// note, because the liturgical field is prose and almost every value in it is
// unique — tags alone would find far too little.
function entriesTouching(words) {
  const w = words.map((x) => x.toLowerCase());
  return state.libraryEntries.filter((e) => {
    const hay = `${e.liturgical || ""} ${e.origin || ""} ${e.source || ""}`.toLowerCase();
    return e.tags.some((t) => w.includes(t.toLowerCase())) || w.some((x) => hay.includes(x));
  });
}

function todaySuggestions() {
  const now = new Date();
  const season = liturgicalSeason(now);
  const day = now.getDay(); // 0 Sun … 6 Sat
  // Rotate by the day of the year, so the shelf is not the same four entries
  // every morning while still being stable within a day.
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / DAY);

  const out = [];
  const taken = new Set();
  const add = (list, why, count = 1) => {
    if (!list.length) return;
    // Deterministic per day, but different from one day to the next.
    const rotated = list.slice(dayOfYear % list.length).concat(list.slice(0, dayOfYear % list.length));
    let added = 0;
    for (const e of rotated) {
      if (added >= count || out.length >= 4) break;
      if (taken.has(e.id)) continue;
      taken.add(e.id);
      out.push({ entry: e, why });
      added++;
    }
  };

  if (season.key !== "ordinary") add(entriesTouching([season.key, season.label]), season.label);
  if (day === 5) add(entriesTouching(["passion", "the cross", "good friday"]), "Friday — the Passion");
  if (day === 6) add(entriesTouching(["marian", "our lady"]), "Saturday — Our Lady");
  if (day === 0) add(entriesTouching(["sunday", "creed", "doxology"]), "Sunday");

  // Always available, so an ordinary weekday still gets a useful shelf.
  add(entriesTouching(["before prayer", "preparation", "mental prayer"]), "To begin");
  add(state.libraryEntries.filter((e) => e.favorite), "A favourite", 2);
  add(state.libraryEntries.filter((e) => e.kind === "teaching"), "Something to learn");
  return out.slice(0, 4);
}

function renderTodayShelf(anyFilterOrSearch) {
  const wrap = $("#library-today");
  if (!wrap) return;
  if (anyFilterOrSearch) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  const picks = todaySuggestions();
  if (!picks.length) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  wrap.innerHTML =
    `<div class="today-label">For today</div>` +
    `<div class="today-row">` +
    picks
      .map(
        ({ entry, why }) => `
      <button class="today-card" data-id="${entry.id}">
        <span class="today-why">${escapeHtml(why)}</span>
        <span class="today-title">${escapeHtml(entry.title)}</span>
        <span class="today-kind">${escapeHtml(KIND_LABELS[entry.kind] || entry.kind)}</span>
      </button>`
      )
      .join("") +
    `</div>`;
  $$(".today-card", wrap).forEach((b) =>
    b.addEventListener("click", () => openLibraryReader(b.dataset.id))
  );
}

function renderLibraryList() {
  const q = state.searchQuery.trim().toLowerCase();

  syncKindChipActiveState();
  renderTagChipRow();
  renderOriginChipRow();
  renderLiturgicalChipRow();
  renderAuthorSelect();
  $("#filter-favorites-only").checked = state.filterFavoritesOnly;
  $("#filter-bilingual-only").checked = state.filterBilingualOnly;

  const hasAnyFilter =
    !!state.finderRestrict ||
    state.filterKind !== "all" ||
    state.filterTags.size > 0 ||
    state.filterAuthor ||
    state.filterOrigin ||
    state.filterLiturgical ||
    state.filterFavoritesOnly ||
    state.filterBilingualOnly;
  $("#btn-clear-tag-filter").classList.toggle("hidden", !hasAnyFilter);
  renderTodayShelf(hasAnyFilter || !!q);

  let entries = state.libraryEntries.filter((e) => {
    if (state.finderRestrict && !state.finderRestrict.ids.has(e.id)) return false;
    if (state.filterKind !== "all" && e.kind !== state.filterKind) return false;
    if (state.filterTags.size > 0 && ![...state.filterTags].every((t) => e.tags.includes(t))) return false;
    if (state.filterAuthor && e.author !== state.filterAuthor) return false;
    if (state.filterOrigin && e.origin !== state.filterOrigin) return false;
    if (state.filterLiturgical && e.liturgical !== state.filterLiturgical) return false;
    if (state.filterFavoritesOnly && !e.favorite) return false;
    if (state.filterBilingualOnly && !e.originalLanguage) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      e.source.toLowerCase().includes(q) ||
      (state.libraryBodyIndex[e.id] || "").includes(q)
    );
  });
  entries = sortLibraryEntries(entries);

  const countText = `${entries.length} of ${state.libraryEntries.length} entries`;
  $("#library-result-count").textContent = countText;
  $("#filter-result-row").textContent = countText;
  $("#btn-filters-show").textContent =
    entries.length === 1 ? "Show 1 entry" : `Show ${entries.length} entries`;
  renderActiveFilterChips();
  updateFilterBadge();

  renderHourBanner(); // async, fire-and-forget — it manages its own visibility

  const list = $("#library-list");
  if (entries.length === 0) {
    list.innerHTML =
      state.libraryEntries.length === 0
        ? `<div class="empty-state">Nothing here yet — tap "+ New" to add a prayer, saint, or quote.</div>`
        : `<div class="empty-state">Nothing matches those filters — try clearing a filter or the search box.</div>`;
    return;
  }
  list.innerHTML = entries
    .map(
      (e) => `
    <div class="entry-card" data-id="${e.id}">
      <div class="title">${escapeHtml(e.title)}${e.favorite ? " ★" : ""}</div>
      ${
        e.author ? renderByline(e) : ""
      }
      <div class="meta">
        <span class="badge-kind">${e.kind}</span>
        ${e.source ? `<span>${escapeHtml(e.source)}</span>` : ""}
        ${e.tags
          .map(
            (t) =>
              `<span class="tag-chip${state.filterTags.has(t) ? " active" : ""}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`
          )
          .join("")}
      </div>
    </div>`
    )
    .join("");
  $$(".entry-card", list).forEach((card) => {
    card.addEventListener("click", () => openLibraryReader(card.dataset.id));
  });
  $$(".tag-chip", list).forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTagFilter(chip.dataset.tag);
    });
  });
  $$(".byline-name.has-dossier", list).forEach((el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      switchTab("saints");
      openSaintReader(el.dataset.slug);
    })
  );
  $$(".byline-filter", list).forEach((el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleAuthorFilter(el.dataset.author);
    })
  );
}

// "Antiphon" is deliberately not folded into "hymn" (Mario asked, 30 Aug 2026).
// A hymn is metrical strophic verse; an antiphon is prose chant attached to
// psalmody. The four seasonal Marian antiphons that close Compline, and the O
// Antiphons of Advent, are antiphons — the Church distinguishes them, and so
// does the season they belong to, which is the useful part when choosing one.
//
// "Teaching" covers the structures the Church hands on to be learned and
// examined by — the gifts, the works of mercy, the last things. They were
// filed as quotes, which they are not: a quote is one saying kept for itself,
// and these are lists you measure yourself against. The dividing line used
// here is whether the entry contains words you actually say: the Rosary and
// the Stations do, so they stay prayers; the Beatitudes and the Seven Gifts
// don't.
const KIND_LABELS = { prayer: "Prayer", hymn: "Hymn", litany: "Litany", antiphon: "Antiphon", saint: "Saint", quote: "Quote", teaching: "Teaching" };

function updateFeastDayVisibility() {
  $("#lib-feast-day-field").classList.toggle("hidden", $("#lib-kind").value !== "saint");
}


// --- Author → saint dossier -----------------------------------------------
//
// Clicking an author used to do one thing (filter the library), which left no
// way to reach the person's dossier — and guessing which the reader wanted, or
// asking, would both be worse than the actual fix: show two controls, each
// labelled with what it does. The name opens the dossier; a separate chip
// filters. Nothing is ambiguous, and nothing has to be explained.
//
// The link only appears when the author actually has a dossier, so the 19
// authors who are Anonymous, biblical, or simply not in the saints data never
// show a dead control.

let _saintSlugIndex = null;

function normaliseName(t) {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(st|ss|bl|ven|servant of god|pope|fr|sr|cardinal)\.?\s+/, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function saintSlugForAuthor(author) {
  if (!author || !window.SAINTS) return null;
  if (!_saintSlugIndex) {
    _saintSlugIndex = new Map();
    for (const s of window.SAINTS) {
      _saintSlugIndex.set(normaliseName(s.name), s.slug);
      if (s.sortName) _saintSlugIndex.set(normaliseName(s.sortName), s.slug);
    }
  }
  const n = normaliseName(author.replace(/,.*$/, "").replace(/ \(.*\)/, ""));
  if (!n) return null;
  if (_saintSlugIndex.has(n)) return _saintSlugIndex.get(n);
  // Fall back to containment, guarded by a length floor so short names
  // ("Monica") cannot swallow unrelated ones.
  for (const [k, v] of _saintSlugIndex) {
    if (k && (k.includes(n) || n.includes(k)) && Math.min(k.length, n.length) > 6) return v;
  }
  return null;
}

async function openLibraryReader(id) {
  state.readingLibraryId = id;
  const entry = state.libraryEntries.find((e) => e.id === id);
  if (entry) setHash("#/e/" + slugify(entry.title));

  $("#reader-kind").textContent = (KIND_LABELS[entry.kind] || entry.kind) + (entry.favorite ? " · ★ Favourite" : "");
  $("#reader-title").textContent = entry.title;

  const attrParts = [];
  if (entry.author) {
    // Two separate, self-describing controls — see saintSlugForAuthor().
    const slug = saintSlugForAuthor(entry.author);
    const sameAuthor = state.libraryEntries.filter(
      (e) => e.author === entry.author && e.id !== entry.id
    ).length;

    let authorHtml = slug
      ? `<span class="reader-author-link has-dossier" data-slug="${escapeHtml(slug)}" title="Read the dossier for ${escapeHtml(entry.author)}">${escapeHtml(entry.author)}<span class="author-go" aria-hidden="true">✝</span></span>`
      : `<span class="reader-author-plain">${escapeHtml(entry.author)}</span>`;
    if (entry.authorNote) authorHtml += `<span class="reader-author-note"> (${escapeHtml(entry.authorNote)})</span>`;
    if (sameAuthor > 0) {
      authorHtml += `<button class="author-more" data-author="${escapeHtml(entry.author)}" title="Show everything in the library by this author">${sameAuthor} more here</button>`;
    }
    attrParts.push(authorHtml);
  }
  if (entry.year) attrParts.push(escapeHtml(entry.year));
  // Origin is dropped when it just restates the author — "Biblical · Biblical",
  // "Traditional — Opus Dei · Opus Dei". The two fields legitimately coincide
  // for anonymous and scriptural entries, so this is a display rule rather
  // than something to fix per entry.
  const originRedundant = (() => {
    if (!entry.origin || !entry.author) return false;
    const norm = (x) => x.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    const a = norm(entry.author), o = norm(entry.origin);
    return a === o || a.includes(o) || o.includes(a);
  })();
  if (entry.origin && !originRedundant) attrParts.push(escapeHtml(entry.origin));
  if (entry.feastDay) attrParts.push("Feast: " + escapeHtml(entry.feastDay));
  if (entry.liturgical) attrParts.push("Used: " + escapeHtml(entry.liturgical));
  $("#reader-attribution").innerHTML = attrParts.join('<span class="dot">·</span>');
  const dossierLink = $(".reader-author-link", $("#reader-attribution"));
  if (dossierLink) {
    dossierLink.addEventListener("click", () => {
      switchTab("saints");
      openSaintReader(dossierLink.dataset.slug);
    });
  }
  const moreBtn = $(".author-more", $("#reader-attribution"));
  if (moreBtn) {
    moreBtn.addEventListener("click", () => {
      state.filterAuthor = entry.author; // set, not toggle — the label promises a result
      renderLibraryList();
      setView("library");
    });
  }

  const metaParts = [];
  if (entry.source) metaParts.push(escapeHtml(entry.source));
  if (entry.tags.length) metaParts.push(entry.tags.map((t) => "#" + escapeHtml(t)).join(" "));
  $("#reader-meta").innerHTML = metaParts.join('<span class="dot">·</span>');

  $("#reader-text").textContent = "Loading…";
  $("#reader-occasion-wrap").classList.toggle("hidden", !entry.occasion);
  if (entry.occasion) $("#reader-occasion").innerHTML = renderInline(escapeHtml(entry.occasion));
  $("#reader-background-wrap").classList.add("hidden");
  setView("library-reader");

  const { body, background, latinBody, spanishBody } = await getLibraryEntryText(id);
  readerTexts.en = body;
  readerTexts.es = spanishBody || "";
  readerTexts.original = latinBody || "";
  readerTexts.originalLanguage = entry.originalLanguage || "Latin";
  if (!readerTexts.es) state.readerLang = "en"; // nothing to switch to

  // An entry whose body is a numbered sequence (the hourly prayers, a set of
  // meditations) can be read one at a time instead of as one long column.
  // Bilingual entries keep the side-by-side view — the two don't combine.
  const parts = latinBody ? [] : splitNumberedParts(body);
  readerParts.list = parts;
  readerParts.showAll = false;
  // First paint of a newly opened entry positions the strip instantly; only
  // later navigation animates, so opening doesn't start with a slide.
  readerParts.firstPaint = true;
  // 24 parts + the "hourly" tag means each part belongs to a clock hour, and
  // the reader labels them as times rather than bare numbers.
  readerParts.hourly =
    parts.length === 24 && entry.tags.some((t) => t.toLowerCase() === "hourly");
  // For an hourly set, open on the prayer for the hour it actually is.
  // An explicit request (tapping the hour banner) wins; otherwise an hourly
  // set opens on the prayer for the hour it actually is.
  if (state.pendingReaderPart != null && parts.length) {
    readerParts.index = Math.min(state.pendingReaderPart, parts.length - 1);
    state.pendingReaderPart = null;
  } else {
    readerParts.index =
      parts.length === 24 && entry.tags.some((t) => t.toLowerCase() === "hourly")
        ? new Date().getHours()
        : 0;
  }

  readerSection.list = latinBody ? [] : splitSections(body);
  readerSection.active = -1;
  renderSectionBar();
  renderReaderLangBar();
  $("#reader-parts-bar").classList.toggle("hidden", parts.length < 4);
  if (parts.length >= 4) renderReaderParts();
  else renderReaderBody();

  if (background) {
    $("#reader-background").innerHTML = renderTextBlock(background);
    $("#reader-background-wrap").classList.remove("hidden");
  }

  renderRelatedEntryChips(entry);
}

// Renders an entry's `related` titles as chips that open those entries.
// Related entries are keyed by TITLE, not id: ids are generated per-device
// at seed time (and differ between localStorage and Drive), whereas titles
// are unique across the library and stable in the source data. A title that
// no longer resolves is dropped silently rather than rendering a dead chip.
// Which texts the open entry has, so the language bar and the body render can
// be redrawn on toggle without refetching. Populated in openLibraryReader().
const readerTexts = { en: "", es: "", original: "", originalLanguage: "Latin" };

// Language bar: Latin (or whatever the original is) stays visible whenever the
// entry has one — the toggle only decides WHICH vernacular sits beside it.
// A second control hides the original entirely, for praying in one language.
function renderReaderLangBar() {
  const bar = $("#reader-lang-bar");
  const hasEs = !!readerTexts.es;
  const hasOrig = !!readerTexts.original;
  bar.classList.toggle("hidden", !hasEs && !hasOrig);
  if (!hasEs && !hasOrig) return;

  const langBtns = hasEs
    ? `<span class="lang-group">
         <button class="lang-btn${state.readerLang === "en" ? " active" : ""}" data-lang="en">English</button>
         <button class="lang-btn${state.readerLang === "es" ? " active" : ""}" data-lang="es">Español</button>
       </span>`
    : "";
  const origBtn = hasOrig
    ? `<button class="lang-btn orig-toggle${state.readerShowOriginal ? " active" : ""}" data-orig="1">${escapeHtml(readerTexts.originalLanguage)}</button>`
    : "";
  bar.innerHTML = langBtns + origBtn;

  $$(".lang-btn[data-lang]", bar).forEach((b) =>
    b.addEventListener("click", () => {
      state.readerLang = b.dataset.lang;
      renderReaderLangBar();
      renderReaderBody();
    })
  );
  const ob = $(".orig-toggle", bar);
  if (ob) {
    ob.addEventListener("click", () => {
      state.readerShowOriginal = !state.readerShowOriginal;
      renderReaderLangBar();
      renderReaderBody();
    });
  }
}

// Some entries are one text with named sections rather than a flat sequence:
// the Rosary's four mystery sets, the corporal and spiritual works of mercy,
// the gifts and the fruits. An ALL-CAPS line acts as a section heading, and
// the reader offers chips to read one at a time. Distinct from the numbered
// -parts reader, which handles strict 1,2,3... sequences.
function splitSections(text) {
  const lines = (text || "").split("\n");
  const sections = [];
  let cur = null;
  const isHeading = isSectionHeadingLine;
  for (const line of lines) {
    if (isHeading(line)) {
      // name is the raw line — it gets re-rendered when a single section is
      // shown, and the renderer needs to recognise it as a heading again.
      // label is what the chip says.
      cur = { name: line.trim(), label: sectionHeadingText(line), lines: [] };
      sections.push(cur);
    } else if (cur) {
      cur.lines.push(line);
    } else {
      if (!sections.length) sections.push({ name: "", lines: [] });
      sections[0].lines.push(line);
    }
  }
  const built = sections
    .map((x) => ({ name: x.name, label: x.label || x.name, text: x.lines.join("\n").trim() }))
    .filter((x) => x.text);
  // Two or more sections that actually have body text. Without this, a bare
  // list of capitalised words (DEATH / JUDGMENT / HEAVEN / HELL) would be
  // read as four empty sections.
  if (built.filter((x) => x.name).length < 2) return [];
  return built;
}

const readerSection = { list: [], active: -1 }; // -1 = show the whole thing

// Headings are stored in caps for the plain view; shown in normal case on the
// chips so the strip doesn't shout.
const TITLE_SMALL_WORDS = new Set(
  ["a", "an", "and", "as", "at", "by", "de", "for", "in", "of", "on", "or", "the", "to", "with"]
);

function titleCaseSection(name) {
  // A word-boundary regex capitalises the letter after an apostrophe too, which
  // turned Montfort's into Montfort'S. Split on whitespace instead.
  return (name || "")
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s*$/.test(w)) return w;
      if (i > 0 && TITLE_SMALL_WORDS.has(w)) return w;
      return w.replace(/^([a-z])/, (m) => m.toUpperCase());
    })
    .join("");
}

function renderSectionBar() {
  const bar = $("#reader-section-bar");
  const list = readerSection.list;
  bar.classList.toggle("hidden", list.length < 2);
  if (list.length < 2) return;
  const chip = (label, i) =>
    `<button class="chip section-chip${readerSection.active === i ? " active" : ""}" data-i="${i}">${escapeHtml(label)}</button>`;
  // A chip only needs to name the section — "The Joyful Mysteries" rather than
  // "The Joyful Mysteries — Monday and Saturday". The heading still says when.
  bar.innerHTML =
    chip("All", -1) +
    list.map((x, i) => chip(titleCaseSection(x.label.split(/\s+[—–]\s+/)[0]), i)).join("");
  $$(".section-chip", bar).forEach((b) =>
    b.addEventListener("click", () => {
      readerSection.active = Number(b.dataset.i);
      renderSectionBar();
      renderReaderBody();
    })
  );
}

// Draws the body for the current language selection.
function renderReaderBody() {
  let vernacular = state.readerLang === "es" && readerTexts.es ? readerTexts.es : readerTexts.en;
  const showOrig = readerTexts.original && state.readerShowOriginal;
  // Section filtering applies only when there is no side-by-side original:
  // the two columns must stay aligned paragraph for paragraph.
  if (!showOrig && readerSection.active >= 0 && readerSection.list[readerSection.active]) {
    const sec = readerSection.list[readerSection.active];
    vernacular = sec.name + "\n\n" + sec.text;
  }
  $("#reader-text").innerHTML = showOrig
    ? renderBilingualBlock(readerTexts.original, vernacular, readerTexts.originalLanguage)
    : renderTextBlock(vernacular);
}

function renderRelatedEntryChips(entry) {
  const wrap = $("#reader-related-wrap");
  const row = $("#reader-related");

  const titles = (entry.related || []).filter((t) => t !== entry.title);
  const found = titles
    .map((t) => state.libraryEntries.find((e) => e.title === t))
    .filter(Boolean);

  // Saints named *inside* an entry rather than being its author — e.g. the
  // Miracle Prayer invokes St. Peregrine but was written by Fr. Rookey, so
  // the author→dossier link in the attribution line can't reach him.
  // Unresolved slugs are dropped, so a saint not yet in saints-data.js
  // simply shows nothing instead of a dead chip.
  const saints = (entry.relatedSaints || [])
    .map((slug) => (window.SAINTS || []).find((s) => s.slug === slug))
    .filter(Boolean);

  wrap.classList.toggle("hidden", found.length === 0 && saints.length === 0);
  if (found.length === 0 && saints.length === 0) return;

  row.innerHTML =
    found
      .map(
        (e) =>
          `<span class="chip related-entry-chip" data-id="${e.id}">${escapeHtml(e.title)}<span class="related-kind">${escapeHtml(KIND_LABELS[e.kind] || e.kind)}</span></span>`
      )
      .join("") +
    saints
      .map(
        (s) =>
          `<span class="chip related-entry-chip related-saint-chip" data-slug="${escapeHtml(s.slug)}">${escapeHtml(s.name)}<span class="related-kind">Saint</span></span>`
      )
      .join("");

  $$(".related-entry-chip", row).forEach((chip) =>
    chip.addEventListener("click", () => {
      if (chip.dataset.slug) openSaintReader(chip.dataset.slug);
      else openLibraryReader(chip.dataset.id);
    })
  );
}

// --- Numbered-sequence reader ---------------------------------------------
//
// Deliberately derived from the body text rather than stored as its own field:
// the Drive backend packs an entry into one file plus size-limited metadata
// properties, so a 24-element array has nowhere to live there. Keeping the
// sequence in the body means it works identically in both backends, stays
// searchable and editable, and any entry written as a numbered list gets this
// navigation for free.

const readerParts = { list: [], index: 0, showAll: false };

function splitNumberedParts(text) {
  const paras = (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const parts = [];
  for (const para of paras) {
    const m = para.match(/^(\d+)[.)]\s+([\s\S]+)$/);
    // Must be strictly 1, 2, 3… — otherwise it isn't a sequence, it's prose
    // that happens to start with a digit.
    if (!m || Number(m[1]) !== parts.length + 1) return [];
    parts.push({ n: Number(m[1]), text: m[2] });
  }
  return parts;
}

// A part may be plain text (the hourly prayers — one line, nothing to label)
// or structured, where lines are tagged "Latin:" / "English:". Without the
// labels the three registers — original, translation, and editorial note —
// all rendered in the same serif and were impossible to tell apart.
function renderPartBody(text) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const labelled = /^(Latin|English|Greek):\s*/i;

  if (!lines.some((l) => labelled.test(l))) {
    // Plain part — unchanged.
    return `<p class="reader-para">${renderInline(escapeHtml(text)).replace(/\n/g, "<br>")}</p>`;
  }

  return lines
    .map((line, i) => {
      const m = line.match(labelled);
      if (m) {
        const lang = m[1].toLowerCase();
        const rest = line.slice(m[0].length);
        return (
          `<div class="part-line part-${lang}">` +
          `<span class="part-lang-label">${escapeHtml(m[1])}</span>` +
          `<span class="part-lang-text">${escapeHtml(rest)}</span></div>`
        );
      }
      // First unlabelled line is the part's heading; the rest is commentary.
      return i === 0
        ? `<div class="part-heading">${escapeHtml(line)}</div>`
        : `<p class="part-note">${escapeHtml(line)}</p>`;
    })
    .join("");
}

// A bare number is ambiguous — on an hourly set "24" could be read as the
// 24th prayer or as hour 24. So the big marker always says what it is: a
// clock time for an hourly set, "Part n" otherwise, with the position within
// the set spelled out underneath either way.
function partMarker(index) {
  if (readerParts.hourly) {
    const clock = `${String(index).padStart(2, "0")}:00`;
    return {
      big: clock,
      sub: `Prayer ${index + 1} of ${readerParts.list.length} · for the hour beginning ${clock}`,
      short: clock,
    };
  }
  return {
    big: String(readerParts.list[index].n),
    sub: `Part ${index + 1} of ${readerParts.list.length}`,
    short: String(readerParts.list[index].n),
  };
}

// The strip of every part in the set. Two distinct states, which is the whole
// point: `selected` is what you are reading, `now` is the hour it actually is.
// They are usually the same, and when they aren't you can see how far you've
// wandered and get back in one tap.
function renderPartStrip(nowIndex) {
  const strip = $("#part-strip");
  strip.innerHTML = readerParts.list
    .map((p, i) => {
      const cls = [
        "part-pip",
        i === readerParts.index ? "selected" : "",
        i === nowIndex ? "now" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const label = partMarker(i).short;
      const title = i === nowIndex ? `${label} — this hour` : label;
      return `<button class="${cls}" data-i="${i}" title="${escapeHtml(title)}" aria-current="${
        i === readerParts.index ? "true" : "false"
      }">${escapeHtml(label)}</button>`;
    })
    .join("");

  $$(".part-pip", strip).forEach((pip) =>
    pip.addEventListener("click", () => {
      readerParts.index = Number(pip.dataset.i);
      renderReaderParts();
    })
  );

  // Keep the selected pip visible, but move as little as possible.
  //
  // The previous version centred it on every render using `sel.offsetLeft`,
  // which is measured from the nearest *positioned* ancestor — not the strip,
  // which isn't positioned — so the scroll distance was wrong and it jumped
  // to the wrong place. Now: measure with rects, and only scroll when the pip
  // is actually out of view, just far enough to bring it in.
  const sel = $(".part-pip.selected", strip);
  if (!sel || strip.scrollWidth <= strip.clientWidth) return;

  const stripBox = strip.getBoundingClientRect();
  const pipBox = sel.getBoundingClientRect();
  const margin = 8; // let a sliver of the neighbouring pip show

  let delta = 0;
  if (pipBox.left < stripBox.left + margin) {
    delta = pipBox.left - stripBox.left - margin;
  } else if (pipBox.right > stripBox.right - margin) {
    delta = pipBox.right - stripBox.right + margin;
  }
  if (delta !== 0) {
    strip.scrollBy({ left: delta, behavior: readerParts.firstPaint ? "auto" : "smooth" });
  }
  readerParts.firstPaint = false;
}

function renderReaderParts() {
  const { list, index, showAll } = readerParts;
  if (!list.length) return;

  const nowIndex = readerParts.hourly ? new Date().getHours() : -1;
  const wrap = (i) => (i + list.length) % list.length;

  $("#btn-part-toggle").textContent = showAll
    ? "One at a time"
    : readerParts.hourly
    ? "Show all 24 hours"
    : `Show all ${list.length}`;

  // The whole selector collapses in "show all" mode — there is no single
  // current part to navigate.
  $(".parts-nav").classList.toggle("hidden", showAll);
  $("#part-strip").classList.toggle("hidden", showAll);
  $("#btn-part-now").classList.toggle(
    "hidden",
    showAll || nowIndex < 0 || nowIndex === index
  );

  if (!showAll) {
    $("#part-prev-label").textContent = partMarker(wrap(index - 1)).short;
    $("#part-next-label").textContent = partMarker(wrap(index + 1)).short;
    const marker = partMarker(index);
    $("#reader-part-count").textContent = marker.short;
    $("#reader-part-sub").textContent =
      nowIndex === index
        ? readerParts.hourly
          ? "this hour"
          : `${index + 1} of ${list.length}`
        : `${index + 1} of ${list.length}`;
    $("#reader-part-count").classList.toggle("is-now", nowIndex === index);

    renderPartStrip(nowIndex);
  }

  if (showAll) {
    const caption = readerParts.hourly
      ? `<p class="part-note reader-parts-caption">One prayer for each hour, from midnight through 11 pm.</p>`
      : "";
    $("#reader-text").innerHTML =
      caption +
      list
        .map(
          (p, i) =>
            `<div class="reader-part-row"><span class="reader-part-n">${escapeHtml(
              partMarker(i).short
            )}</span>` +
            `<div class="reader-part-content">${renderPartBody(p.text)}</div></div>`
        )
        .join("");
    return;
  }

  const marker = partMarker(index);
  $("#reader-text").innerHTML =
    `<div class="reader-part-single">` +
    `<div class="reader-part-badge">${escapeHtml(marker.big)}</div>` +
    `<div class="reader-part-sublabel">${escapeHtml(marker.sub)}</div>` +
    renderPartBody(list[index].text) +
    `</div>`;
}

function stepReaderPart(delta) {
  const n = readerParts.list.length;
  if (!n) return;
  readerParts.index = (readerParts.index + delta + n) % n; // wraps at both ends
  renderReaderParts();
}

async function openLibraryEditor(id) {
  state.editingLibraryId = id;
  const form = $("#library-editor-form");
  form.reset();
  $("#btn-library-delete").classList.toggle("hidden", !id);
  $("#library-editor-title-heading").textContent = id ? "Edit entry" : "New library entry";

  if (id) {
    const entry = state.libraryEntries.find((e) => e.id === id);
    $("#lib-title").value = entry.title;
    $("#lib-kind").value = entry.kind;
    $("#lib-tags").value = entry.tags.join(", ");
    $("#lib-source").value = entry.source;
    $("#lib-author").value = entry.author;
    $("#lib-author-note").value = entry.authorNote;
    $("#lib-year").value = entry.year;
    $("#lib-origin").value = entry.origin;
    $("#lib-liturgical").value = entry.liturgical;
    $("#lib-feast-day").value = entry.feastDay;
    $("#lib-original-language").value = entry.originalLanguage;
    $("#lib-favorite").checked = entry.favorite;
    $("#lib-body").value = "Loading…";
    $("#lib-background").value = "";
    $("#lib-body-latin").value = "";
    $("#lib-body").disabled = true;
    updateFeastDayVisibility();
    getLibraryEntryText(id).then(({ body, background, latinBody }) => {
      $("#lib-body").value = body;
      $("#lib-background").value = background;
      $("#lib-body-latin").value = latinBody;
      $("#lib-body").disabled = false;
    });
  } else {
    $("#lib-kind").value = "prayer";
    $("#lib-body").disabled = false;
    updateFeastDayVisibility();
  }
  setView("library-editor");
}

async function onSaveLibraryEntry(e) {
  e.preventDefault();
  const btn = $("#btn-library-save");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const tags = $("#lib-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    // `related` has no editor field — carry the existing value through, or
    // saving from the UI would silently wipe an entry's "See also" links.
    const existingEntry =
      state.libraryEntries.find((e) => e.id === state.editingLibraryId) || {};
    const existingRelated = existingEntry.related || [];
    const existingRelatedSaints = existingEntry.relatedSaints || [];
    const savedId = await saveLibraryEntry({
      id: state.editingLibraryId,
      related: existingRelated,
      relatedSaints: existingRelatedSaints,
      // The editor has no field for these three; without carrying them the
      // save wipes the cross-links and resets the seed marker, which would
      // then re-seed over this very edit on the next load.
      seedVersion: existingEntry.seedVersion || 1,
      title: $("#lib-title").value.trim() || "Untitled",
      kind: $("#lib-kind").value,
      tags,
      author: $("#lib-author").value.trim(),
      authorNote: $("#lib-author-note").value.trim(),
      year: $("#lib-year").value.trim(),
      origin: $("#lib-origin").value.trim(),
      liturgical: $("#lib-liturgical").value.trim(),
      feastDay: $("#lib-feast-day").value.trim(),
      originalLanguage: $("#lib-original-language").value.trim(),
      background: $("#lib-background").value,
      latinBody: $("#lib-body-latin").value,
      source: $("#lib-source").value.trim(),
      favorite: $("#lib-favorite").checked,
      body: $("#lib-body").value,
    });
    delete state.libraryBodyIndex[savedId]; // stale — refreshLibrary() will refetch it
    await refreshLibrary();
    openLibraryReader(savedId);
  } catch (err) {
    alert("Couldn't save: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
}

async function onDeleteLibraryEntry() {
  if (!state.editingLibraryId) return;
  if (!confirm("Delete this entry permanently?")) return;
  await deleteLibraryEntry(state.editingLibraryId);
  delete state.libraryBodyIndex[state.editingLibraryId];
  await refreshLibrary();
  setView("library");
}

function renderLinkOptions() {
  const sel = $("#writer-link");
  const current = sel.value;
  sel.innerHTML =
    `<option value="">Not linked</option>` +
    state.libraryEntries.map((e) => `<option value="${e.id}">${escapeHtml(e.title)} (${e.kind})</option>`).join("");
  sel.value = current;
}

// --- Journal ---

async function refreshJournal() {
  state.journalEntries = await listJournal();
  renderJournalList();
}

function renderJournalList() {
  const list = $("#journal-list");
  if (state.journalEntries.length === 0) {
    list.innerHTML = `<div class="empty-state">No reflections yet.</div>`;
    return;
  }
  list.innerHTML = state.journalEntries
    .map(
      (e) => `
    <div class="entry-card" data-id="${e.id}">
      <div class="title">${escapeHtml(e.name)}</div>
      <div class="meta">${e.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join("")}</div>
    </div>`
    )
    .join("");
  $$(".entry-card", list).forEach((card) => card.addEventListener("click", () => openWriter(card.dataset.id)));
}

async function openWriter(id) {
  state.editingJournalId = id;
  writerDirty = false;
  $("#btn-writer-delete").classList.toggle("hidden", !id);
  setWriterStatus(id ? "" : "");

  if (id) {
    const entry = state.journalEntries.find((e) => e.id === id);
    const parts = entry.name.split(" — ");
    $("#writer-title").value = parts.length > 1 ? parts.slice(1).join(" — ") : entry.name;
    $("#writer-date").value = parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) ? parts[0] : todayISO();
    $("#writer-tags").value = entry.tags.join(", ");
    $("#writer-body").value = "Loading…";
    $("#writer-body").disabled = true;
    renderLinkOptions();
    $("#writer-link").value = entry.linkedLibraryId || "";
    getJournalEntryBody(id).then((body) => {
      $("#writer-body").value = body;
      $("#writer-body").disabled = false;
      updateWordCount();
    });
  } else {
    $("#writer-title").value = "";
    $("#writer-date").value = todayISO();
    $("#writer-tags").value = "";
    $("#writer-body").value = "";
    $("#writer-body").disabled = false;
    renderLinkOptions();
    $("#writer-link").value = "";
    updateWordCount();
  }
  setView("writer");
  $("#writer-title").focus();
}

function updateWordCount() {
  const words = $("#writer-body").value.trim().split(/\s+/).filter(Boolean).length;
  $("#writer-wordcount").textContent = `${words} word${words === 1 ? "" : "s"}`;
}

function setWriterStatus(text) {
  $("#writer-status").textContent = text;
}

function scheduleAutosave() {
  writerDirty = true;
  updateWordCount();
  setWriterStatus("Unsaved changes…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autosaveJournalEntry, 2000);
}

async function autosaveJournalEntry() {
  if (!writerDirty) return;
  const title = $("#writer-title").value.trim();
  const body = $("#writer-body").value;
  if (!title && !body.trim()) return; // nothing to save yet

  setWriterStatus("Saving…");
  try {
    const tags = $("#writer-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const id = await saveJournalEntry({
      id: state.editingJournalId,
      date: $("#writer-date").value || todayISO(),
      title,
      tags,
      linkedLibraryId: $("#writer-link").value,
      body,
    });
    state.editingJournalId = id;
    $("#btn-writer-delete").classList.remove("hidden");
    writerDirty = false;
    setWriterStatus("Saved");
    refreshJournal();
  } catch (err) {
    setWriterStatus("Couldn't save — will retry");
    saveTimer = setTimeout(autosaveJournalEntry, 4000);
  }
}

async function onDeleteJournalEntry() {
  if (!state.editingJournalId) return;
  if (!confirm("Delete this reflection permanently?")) return;
  clearTimeout(saveTimer);
  await deleteJournalEntry(state.editingJournalId);
  await refreshJournal();
  setView("journal");
}

// --- Saints ---
//
// window.SAINTS (saints-data.js) holds the read-only dossiers — repo is the
// source of truth, same one-way flow as wardrobe.yaml. state.saintsPersonal
// holds Mario's own layer (status/familiarity/notes/study log/card
// progress), loaded from the store and keyed by slug. Nothing here ever
// writes back to SAINTS itself.

const SAINT_STATUS_LABELS = { friend: "Friend", acquaintance: "Acquaintance", tomeet: "To meet", "": "Unset" };
const SAINT_TIER_LABELS = { top: "Top favourite", favourite: "Favourite", toKnow: "To get to know" };
// Where someone stands in the canonization process. Only shown when it's
// NOT "saint" — everyone in this file defaults to "saint", so a badge on
// every single card would be noise; the interesting cases are the handful
// of open causes (e.g. Fulton Sheen, Clare Crockett).
const CAUSE_STAGE_LABELS = { servant: "Servant of God", venerable: "Venerable", blessed: "Blessed", saint: "Saint" };
const FAMILIARITY_SECTIONS = [
  { key: "life", label: "Life & history" },
  { key: "narrative", label: "Anecdotes & story" },
  { key: "spirituality", label: "Spirituality & teaching" },
  { key: "writings", label: "Writings" },
  { key: "cult", label: "Devotion & patronage" },
];

async function refreshSaints() {
  state.saintsPersonal = await getAllSaintsPersonal();
  renderSaintsList();
}

function saintPersonal(slug) {
  return Object.assign({ status: "", familiarity: {}, notes: "", studyLog: [], cards: {} }, state.saintsPersonal[slug]);
}

// Feast dates are stored as "MM-DD"; this finds how many days away the next
// occurrence is (0 = today, wraps to next year once it's passed) so the
// list can sort "upcoming first" like a birthday calendar.
function daysUntilFeast(mmdd) {
  if (!mmdd) return Infinity;
  const [mm, dd] = mmdd.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), mm - 1, dd);
  if (next < today) next = new Date(now.getFullYear() + 1, mm - 1, dd);
  return Math.round((next - today) / 86400000);
}

function familiarityAverage(saint, personal) {
  const vals = FAMILIARITY_SECTIONS.map((s) => (personal.familiarity ? personal.familiarity[s.key] : 0) || 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function sortSaintsList(saints) {
  const sorted = saints.slice();
  if (state.saintsSortBy === "feast") {
    sorted.sort((a, b) => daysUntilFeast(a.dates.feast) - daysUntilFeast(b.dates.feast));
  } else if (state.saintsSortBy === "familiarity") {
    sorted.sort((a, b) => familiarityAverage(a, saintPersonal(a.slug)) - familiarityAverage(b, saintPersonal(b.slug)));
  } else {
    sorted.sort((a, b) => a.sortName.localeCompare(b.sortName));
  }
  return sorted;
}

function syncSaintsFilterChipActiveState() {
  $$(".status-chip", $("#saints-filter-status-row")).forEach((c) => c.classList.toggle("active", c.dataset.status === state.saintsFilterStatus));
  $$(".depth-chip", $("#saints-filter-depth-row")).forEach((c) => c.classList.toggle("active", c.dataset.depth === state.saintsFilterDepth));
  $$(".tier-chip", $("#saints-filter-tier-row")).forEach((c) => c.classList.toggle("active", c.dataset.tier === state.saintsFilterTier));
  $$(".cause-chip", $("#saints-filter-cause-row")).forEach((c) => c.classList.toggle("active", c.dataset.cause === state.saintsFilterCause));
}

function updateSaintsFilterBadge() {
  const count =
    (state.saintsFilterStatus !== "all" ? 1 : 0) +
    (state.saintsFilterDepth !== "all" ? 1 : 0) +
    (state.saintsFilterTier !== "all" ? 1 : 0) +
    (state.saintsFilterCause !== "all" ? 1 : 0);
  const badge = $("#saints-filter-count-badge");
  badge.textContent = String(count);
  badge.classList.toggle("hidden", count === 0);
}

// A low-friction daily re-engagement hook: highlights any saint whose feast
// falls today, hidden entirely on days when none does.
function renderTodaysSaintBanner() {
  const banner = $("#saints-today-banner");
  const todays = window.SAINTS.filter((s) => daysUntilFeast(s.dates.feast) === 0);
  if (todays.length === 0) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }
  const names = todays
    .map((s) => `<span class="todays-saint-name" data-slug="${s.slug}">${escapeHtml(s.name)}</span>`)
    .join(" and ");
  banner.innerHTML = `<span class="todays-saint-label">Today is the feast of</span> ${names}`;
  banner.classList.remove("hidden");
  $$(".todays-saint-name", banner).forEach((el) => el.addEventListener("click", () => openSaintReader(el.dataset.slug)));
}

function renderSaintsList() {
  renderTodaysSaintBanner();
  syncSaintsFilterChipActiveState();
  updateSaintsFilterBadge();

  const q = state.saintsSearchQuery.trim().toLowerCase();
  let saints = window.SAINTS.filter((s) => {
    const personal = saintPersonal(s.slug);
    if (state.saintsFilterStatus !== "all" && personal.status !== state.saintsFilterStatus) return false;
    if (state.saintsFilterDepth !== "all" && s.depth !== state.saintsFilterDepth) return false;
    if (state.saintsFilterTier !== "all" && s.listTier !== state.saintsFilterTier) return false;
    if (state.saintsFilterCause !== "all" && (s.causeStage || "saint") !== state.saintsFilterCause) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.identity.birthName || "").toLowerCase().includes(q) ||
      (s.identity.epithets || []).some((e) => e.toLowerCase().includes(q)) ||
      (s.cult.patronages || []).some((p) => p.of.toLowerCase().includes(q) || (p.why || "").toLowerCase().includes(q))
    );
  });
  saints = sortSaintsList(saints);

  $("#saints-result-count").textContent = `${saints.length} of ${window.SAINTS.length} saints`;
  $("#btn-saints-filters-show").textContent =
    saints.length === 1 ? "Show 1 saint" : `Show ${saints.length} saints`;

  const dueCount = collectDueCards(null).length;
  const dueBadge = $("#cards-due-badge");
  dueBadge.textContent = String(dueCount);
  dueBadge.classList.toggle("hidden", dueCount === 0);

  const list = $("#saints-list");
  if (saints.length === 0) {
    list.innerHTML = `<div class="empty-state">No saints match that search or filter.</div>`;
    return;
  }
  list.innerHTML = saints
    .map((s) => {
      const personal = saintPersonal(s.slug);
      const days = daysUntilFeast(s.dates.feast);
      const feastNote = s.dates.feast ? (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days}d`) : "no fixed feast";
      return `
    <div class="entry-card saint-card" data-slug="${s.slug}">
      <div class="title">${escapeHtml(s.name)}</div>
      <div class="meta">
        <span class="badge-kind">${s.depth === "full" ? "Full dossier" : "Core"}</span>
        ${s.causeStage && s.causeStage !== "saint" ? `<span class="tag-chip cause-tag cause-${s.causeStage}">${CAUSE_STAGE_LABELS[s.causeStage]}</span>` : ""}
        ${s.listTier ? `<span class="tag-chip tier-tag tier-${s.listTier}">${SAINT_TIER_LABELS[s.listTier]}</span>` : ""}
        ${s.dates.feastLabel ? `<span>${escapeHtml(s.dates.feastLabel)} (${feastNote})</span>` : `<span>${feastNote}</span>`}
        ${personal.status ? `<span class="tag-chip status-tag status-${personal.status}">${SAINT_STATUS_LABELS[personal.status]}</span>` : ""}
      </div>
    </div>`;
    })
    .join("");
  $$(".saint-card", list).forEach((card) => card.addEventListener("click", () => openSaintReader(card.dataset.slug)));
}

// --- Saints calendar (month grid of feast days) ---

const CALENDAR_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CALENDAR_WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftCalendarMonth(delta) {
  let m = state.calendarMonth + delta;
  let y = state.calendarYear;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  state.calendarMonth = m;
  state.calendarYear = y;
  renderSaintsCalendar();
}

// Groups every saint with a fixed feast by "MM-DD" once per render, so each
// day cell is an O(1) lookup instead of scanning all 76 saints per day.
function buildFeastDayIndex() {
  const idx = {};
  window.SAINTS.forEach((s) => {
    if (!s.dates.feast) return;
    (idx[s.dates.feast] = idx[s.dates.feast] || []).push(s);
  });
  return idx;
}

function renderSaintsCalendar() {
  const idx = buildFeastDayIndex();
  const y = state.calendarYear, m = state.calendarMonth;
  $("#calendar-month-label").textContent = `${CALENDAR_MONTH_NAMES[m]} ${y}`;

  const firstOfMonth = new Date(y, m, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;
  const tier = state.saintsFilterTier;

  let cells = "";
  for (let i = 0; i < startWeekday; i++) cells += `<div class="calendar-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const mmdd = `${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    let saints = idx[mmdd] || [];
    if (tier !== "all") saints = saints.filter((s) => s.listTier === tier);
    const isToday = isCurrentMonth && today.getDate() === day;
    const chips = saints
      .map((s) => `<span class="calendar-saint-chip${s.listTier ? " tier-" + s.listTier : ""}" data-slug="${s.slug}">${escapeHtml(s.name.replace(/^St\.?\s+/, ""))}</span>`)
      .join("");
    cells += `<div class="calendar-cell${isToday ? " today" : ""}"><div class="calendar-day-num">${day}</div>${chips}</div>`;
  }

  const filterNote = tier !== "all" ? `<div class="calendar-filter-note">Showing: ${SAINT_TIER_LABELS[tier]}</div>` : "";

  $("#saints-calendar-grid").innerHTML = `
    ${filterNote}
    <div class="calendar-weekday-row">${CALENDAR_WEEKDAY_NAMES.map((d) => `<div class="calendar-weekday">${d}</div>`).join("")}</div>
    <div class="calendar-days">${cells}</div>
  `;
  $$(".calendar-saint-chip", $("#saints-calendar-grid")).forEach((chip) =>
    chip.addEventListener("click", () => openSaintReader(chip.dataset.slug))
  );
}

// --- World map (shared by the per-saint life-path tab and the atlas) ---
//
// Renders a lat/lon graticule plus a simplified world coastline outline
// (window.WORLD_COASTLINE_PATH, saints-geo.js — a public-domain-licensed
// source, embedded once, no runtime fetches) so continents are actually
// recognizable, not just a bare grid. Points are projected with plain
// equirectangular math, per TODO.md's original note:
// x=(lon+180)/360*W, y=(90-lat)/180*H.

// 3200×1600 rather than a plain 800×400 — the viewBox is abstract SVG user
// units, not raster pixels, so this costs nothing visually at the atlas's
// full-world zoom, but it's what lets a saint's tightly-clustered stops
// (e.g. six Spanish cities a few hundred km apart) still separate visibly
// once the per-saint map tab crops in on them (see `opts.fit` below).
const WORLD_MAP_W = 3200;
const WORLD_MAP_H = 1600;
const WORLD_MAP_SCALE = WORLD_MAP_W / 800;

// --- Optional online map tiles (OFF by default) ---
//
// The repo rule is that everything works offline by double-clicking a file,
// with no network calls (CLAUDE.md). This is the one deliberate, opt-in
// exception: a toggle that swaps the embedded coastline for real basemap
// tiles. It is off unless explicitly switched on, the preference is stored
// locally, and with it off the app makes no requests at all — so the
// offline guarantee still holds for the default state.
//
// While it is ON, every pan/zoom sends the viewport to the tile host, which
// reveals roughly which places are being looked at.
//
// Tiles are Web Mercator, but the offline map is equirectangular, so the
// two modes CANNOT share a projection — pins would sit in visibly wrong
// places. Tiles mode therefore switches the whole map to Mercator (a square
// world) and hides the embedded coastline/graticule, since the tiles carry
// their own coastlines.
const TILE_SIZE = 256;
const TILE_MAX_Z = 19; // CARTO serves past this, but street level is plenty here
const MERCATOR_MAX_LAT = 85.0511; // where Mercator y goes infinite
const TILE_URL = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = "© OpenStreetMap contributors © CARTO";

function tilesOn() {
  return !!state.mapTiles;
}

// Mercator is a square world; equirectangular is 2:1. The active mode
// therefore changes the map's coordinate space, so every consumer asks
// here rather than assuming WORLD_MAP_H.
function mapH() {
  return tilesOn() ? WORLD_MAP_W : WORLD_MAP_H;
}

function projectLonLat(lat, lon) {
  const x = ((lon + 180) / 360) * WORLD_MAP_W;
  if (!tilesOn()) return [x, ((90 - lat) / 180) * WORLD_MAP_H];
  const clamped = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  const phi = (clamped * Math.PI) / 180;
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)) * WORLD_MAP_W;
  return [x, y];
}

// Place labels in saints-geo.js carry qualifiers that are useful in a
// popover but far too long on a map pin — "Rome or Nicomedia — sources
// vary", "Ávila (family had property at Gotarrendura)". Keep the bare
// place name for the map; the full label still shows in the <title>
// tooltip and the popover.
function shortPlaceLabel(label) {
  return String(label || "")
    .split(/\s+—\s+|\s+\(|,/)[0]
    .trim();
}

// `points`: [{lat, lon, key, label, count?}]. mode "path" (per-saint life
// path) also draws thin connecting lines in array order; "scatter" (the
// atlas) draws independent, clickable pins only.
//
// `opts.fit`: crop the viewBox to the points' bounding box (+ padding)
// instead of always showing the whole world. Without this, a saint whose
// entire life happened in one country (most of them) collapses to a nearly
// indistinguishable dot-cluster on a full 800×400 world map — fitting makes
// the life-path tab actually legible. The atlas keeps the full-world view
// since it genuinely needs global context.
function renderWorldMapSVG(points, opts) {
  const mode = (opts && opts.mode) || "scatter";
  const projected = points.map((p) => Object.assign({}, p, { xy: projectLonLat(p.lat, p.lon) }));

  const H = mapH();
  let vbX = 0, vbY = 0, vbW = WORLD_MAP_W, vbH = H;
  if (opts && opts.fit && points.length) {
    // Work out the crop in degrees, not projected pixels — much easier to
    // reason about (a fixed pixel padding is a wildly different fraction
    // of the frame depending on how tight the cluster already is, which is
    // what made the first version of this barely zoom in at all for a
    // saint whose whole life fit inside Spain).
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const padLat = Math.max((maxLat - minLat) * 0.35, 3);
    const padLon = Math.max((maxLon - minLon) * 0.35, 3);
    // Floor the span at ~14° so a single-point/tiny-cluster saint still
    // shows a "regional" amount of surrounding geography rather than
    // zooming in on empty ocean around one dot.
    const FLOOR_DEG = 14;
    let loLat = minLat - padLat, hiLat = maxLat + padLat;
    let loLon = minLon - padLon, hiLon = maxLon + padLon;
    if (hiLat - loLat < FLOOR_DEG) { const mid = (hiLat + loLat) / 2; loLat = mid - FLOOR_DEG / 2; hiLat = mid + FLOOR_DEG / 2; }
    if (hiLon - loLon < FLOOR_DEG) { const mid = (hiLon + loLon) / 2; loLon = mid - FLOOR_DEG / 2; hiLon = mid + FLOOR_DEG / 2; }
    const latLimit = tilesOn() ? MERCATOR_MAX_LAT : 90;
    loLat = Math.max(-latLimit, loLat); hiLat = Math.min(latLimit, hiLat);
    loLon = Math.max(-180, loLon); hiLon = Math.min(180, hiLon);
    const [x0, y0] = projectLonLat(hiLat, loLon); // higher lat -> smaller y; lower lon -> smaller x
    const [x1, y1] = projectLonLat(loLat, hiLon);
    vbX = x0; vbY = y0; vbW = x1 - x0; vbH = y1 - y0;
  }
  // zoomScale is how much of the full world width this crop covers. Pin
  // radius is defined in viewBox user-units, so it must shrink in lockstep
  // with the crop (vbW = WORLD_MAP_W * zoomScale) to render at a *constant*
  // on-screen size whether this is the full-world atlas or a saint zoomed
  // in tight on one country — a fixed radius would look microscopic at the
  // full-world scale or enormous once `fit` has zoomed in.
  const zoomScale = vbW / WORLD_MAP_W;
  const pinR = 4 * WORLD_MAP_SCALE * zoomScale;
  const gridStep = zoomScale < 0.35 ? 10 : 30;

  let svg = `<svg viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" class="world-map-svg" preserveAspectRatio="xMidYMid meet">`;
  svg += `<rect x="0" y="0" width="${WORLD_MAP_W}" height="${H}" class="world-map-bg"></rect>`;

  if (tilesOn()) {
    // Filled in by refreshTiles() in initMapZoomPan — which tiles are needed
    // depends on the live viewBox, so it can't be decided at render time.
    svg += `<g class="world-map-tiles"></g>`;
  } else {
    if (window.WORLD_COASTLINE_PATH) {
      const [csx, csy] = window.WORLD_COASTLINE_SCALE;
      svg += `<g transform="scale(${csx},${csy})"><path d="${window.WORLD_COASTLINE_PATH}" class="world-map-land" vector-effect="non-scaling-stroke"></path></g>`;
    }
    // vector-effect="non-scaling-stroke" keeps line/outline thickness a
    // constant screen size regardless of how far `fit` has zoomed the
    // viewBox in — otherwise a stroke-width tuned for the full-world atlas
    // view would render hairline-thin on a tightly cropped saint map.
    for (let lon = -180; lon <= 180; lon += gridStep) {
      const [x] = projectLonLat(0, lon);
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="world-map-grid${lon === 0 ? " prime" : ""}" vector-effect="non-scaling-stroke"></line>`;
    }
    for (let lat = -90; lat <= 90; lat += gridStep) {
      const [, y] = projectLonLat(lat, 0);
      svg += `<line x1="0" y1="${y}" x2="${WORLD_MAP_W}" y2="${y}" class="world-map-grid${lat === 0 ? " equator" : ""}" vector-effect="non-scaling-stroke"></line>`;
    }
  }

  // A life path doubles back on itself constantly (Teresa criss-crosses
  // Castile eight times), so a single uniform polyline gives no way to tell
  // which leg came first. Each leg is drawn separately and brightens along
  // the journey, so the direction of travel reads at a glance — reinforced
  // by the numbers on the pins below.
  if (mode === "path" && projected.length > 1) {
    for (let i = 0; i < projected.length - 1; i++) {
      const [x1, y1] = projected[i].xy;
      const [x2, y2] = projected[i + 1].xy;
      const t = projected.length < 3 ? 1 : i / (projected.length - 2);
      const op = (0.22 + t * 0.63).toFixed(3);
      svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="world-map-path-leg" stroke-opacity="${op}" vector-effect="non-scaling-stroke"><title>${escapeHtml(`Leg ${i + 1}: ${shortPlaceLabel(projected[i].label)} → ${shortPlaceLabel(projected[i + 1].label)}`)}</title></line>`;
    }
  }

  // Birth → death displacement lines (atlas "journeys" toggle). Drawn under
  // the pins, faint, so 80 of them read as a flow pattern rather than
  // competing with the points themselves.
  if (opts && opts.journeys && opts.journeys.length) {
    opts.journeys.forEach((j) => {
      const [x1, y1] = projectLonLat(j.from.lat, j.from.lon);
      const [x2, y2] = projectLonLat(j.to.lat, j.to.lon);
      svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="world-map-journey" vector-effect="non-scaling-stroke"><title>${escapeHtml(j.name)}</title></line>`;
    });
  }

  // Each pin gets a paired, initially-hidden <text> label (matched up by
  // data-idx in initMapZoomPan) — shown only once zoomed in past a
  // threshold and only where it doesn't collide with another shown label,
  // so a dense cluster doesn't turn into unreadable overlapping text at
  // the full-world zoom level.
  const numbered = mode === "path";
  projected.forEach((p, i) => {
    const [x, y] = p.xy;
    const clustered = p.count > 1;
    // Numbered stops need room for a digit, so they're drawn larger.
    const r = numbered ? pinR * 2.6 : clustered ? pinR * 1.5 : pinR;
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" class="world-map-pin${clustered ? " clustered" : ""}${numbered ? " numbered" : ""}" data-key="${escapeHtml(p.key || "")}" data-idx="${i}" vector-effect="non-scaling-stroke"><title>${escapeHtml(p.label || "")}</title></circle>`;
    if (numbered) {
      svg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="world-map-stop-num" data-idx="${i}" text-anchor="middle" dominant-baseline="central" font-size="${(r * 1.25).toFixed(2)}">${i + 1}</text>`;
    }
    // Two lines where we have both: the place name (what you need to orient
    // on a map) on top, who was there underneath. Place name leads because
    // "I cannot tell which city this is" is the thing a bare pin fails at.
    const labelText = p.displayLabel || p.label || "";
    const subText = p.subLabel || "";
    if (labelText) {
      const lx = (x + r).toFixed(1);
      svg += `<text x="${lx}" y="${y.toFixed(1)}" data-idx="${i}" data-count="${p.count || 1}" class="world-map-pin-label" dominant-baseline="middle" style="display:none">`;
      svg += `<tspan class="pin-label-main" x="${lx}" dy="${subText ? "-0.35em" : "0"}">${escapeHtml(labelText)}</tspan>`;
      if (subText) svg += `<tspan class="pin-label-sub" x="${lx}" dy="1.15em">${escapeHtml(subText)}</tspan>`;
      svg += `</text>`;
    }
  });

  svg += `</svg>`;
  return svg;
}

function mapZoomControlsHtml() {
  return `<div class="world-map-controls">
    <button type="button" class="world-map-zoom-btn" data-zoom="in" title="Zoom in">+</button>
    <button type="button" class="world-map-zoom-btn" data-zoom="out" title="Zoom out">−</button>
    <button type="button" class="world-map-zoom-btn world-map-reset-btn" data-zoom="reset" title="Reset view">Reset</button>
    <button type="button" class="world-map-zoom-btn world-map-tiles-btn${tilesOn() ? " on" : ""}" data-map-tiles
      title="${tilesOn() ? "Detailed map is ON — this loads map tiles over the internet. Click to go back offline." : "Offline map. Click to load a detailed map over the internet."}">${tilesOn() ? "Online" : "Offline"}</button>
  </div>${tilesOn() ? `<div class="world-map-attribution">${escapeHtml(TILE_ATTRIBUTION)}</div>` : ""}`;
}

// The toggle is deliberately explicit about the trade-off rather than being
// a silent preference: turning it on is the one thing in this repo that
// makes the app talk to the network.
function wireMapTilesToggle(root, rerender) {
  const btn = root.querySelector("[data-map-tiles]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    state.mapTiles = !state.mapTiles;
    try {
      localStorage.setItem("recollection.mapTiles", state.mapTiles ? "1" : "0");
    } catch (e) {
      /* private mode / storage disabled — the toggle still works for this session */
    }
    rerender();
  });
}

// Wheel-zoom, drag-to-pan, and pinch-to-zoom for a rendered world map.
// Reads the SVG's own (already-computed) viewBox as the "home" extent, so
// this works unmodified whether that's the full-world atlas or a per-saint
// fitted crop — `root` is the .world-map-wrap's container; call this once,
// right after that container's innerHTML is set.
function initMapZoomPan(root) {
  const svg = root.querySelector(".world-map-svg");
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const home = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
  let cur = Object.assign({}, home);
  // How far in you can zoom. The offline basemap is a heavily simplified
  // coastline, so past ~60× it's just smooth blobs and more zoom is
  // meaningless. Real tiles keep resolving all the way down to streets, so
  // tiles mode gets a far deeper limit — the old shared 8× cap stopped the
  // online map at roughly continent level, well before the tiles ran out.
  const maxZoomFactor = tilesOn() ? 20000 : 60;
  const aspect = home.h / home.w; // locked: w and h must never be clamped
  const minW = home.w / maxZoomFactor; // independently, or the map distorts
  const maxW = Math.min(home.w * 3, WORLD_MAP_W); // furthest zoomed out

  // Single source of truth for "resize the viewBox": clamps width, derives
  // height from the fixed aspect, then clamps the pan. Width and height were
  // previously clamped separately, which could squash the map when only one
  // of them hit its bound.
  function setSize(w) {
    cur.w = Math.min(Math.max(w, minW), maxW);
    cur.h = cur.w * aspect;
  }

  // Pins are sized in renderWorldMapSVG to look right at the *initial*
  // viewBox only. Interactive zoom changes the viewBox without touching
  // their radius, so without this they balloon into overlapping blobs as
  // the crop narrows — rescale each pin in lockstep with the zoom level so
  // they stay a constant on-screen size, the same way non-scaling-stroke
  // already keeps line/outline widths constant.
  const pins = Array.from(svg.querySelectorAll(".world-map-pin")).map((el) => {
    const idx = el.dataset.idx;
    const labelEl = idx != null ? svg.querySelector(`.world-map-pin-label[data-idx="${idx}"]`) : null;
    // The stop number rides with its pin and has to shrink in step with it,
    // or it detaches from the circle as you zoom.
    const numEl = idx != null ? svg.querySelector(`.world-map-stop-num[data-idx="${idx}"]`) : null;
    return {
      el,
      labelEl,
      numEl,
      baseR: parseFloat(el.getAttribute("r")),
      cx: parseFloat(el.getAttribute("cx")),
      cy: parseFloat(el.getAttribute("cy")),
      count: labelEl ? parseInt(labelEl.dataset.count || "1", 10) : 1,
      liveR: parseFloat(el.getAttribute("r")),
    };
  });

  // Name labels only turn on once zoomed in enough to have room, and even
  // then only where they don't collide with an already-placed label —
  // otherwise a dense cluster (several saints per city) is just as
  // unreadable with 40 overlapping names as it was with 40 overlapping
  // dots. Bigger clusters get priority for the available label space.
  const LABEL_ZOOM_THRESHOLD = 0.45;
  const LABEL_FONT_PX = 12;
  const LABEL_GAP_PX = 5;

  function updateLabels(liveScale) {
    const rect = svg.getBoundingClientRect();
    const showLabels = liveScale <= LABEL_ZOOM_THRESHOLD && rect.width > 0;
    if (!showLabels) {
      pins.forEach((p) => { if (p.labelEl) p.labelEl.style.display = "none"; });
      return;
    }
    const pxPerUnit = rect.width / cur.w;
    const fontSizeUser = LABEL_FONT_PX / pxPerUnit;
    const gapUser = LABEL_GAP_PX / pxPerUnit;
    const placedBoxes = [];
    // Treat the zoom +/-/Reset overlay as a pre-occupied region so labels
    // route around it instead of rendering underneath/behind the buttons.
    const controlsEl = root.querySelector(".world-map-controls");
    if (controlsEl) {
      const cRect = controlsEl.getBoundingClientRect();
      placedBoxes.push({
        left: cRect.left - rect.left,
        top: cRect.top - rect.top,
        right: cRect.right - rect.left,
        bottom: cRect.bottom - rect.top,
      });
    }
    pins
      .slice()
      .sort((a, b) => b.count - a.count)
      .forEach((p) => {
        if (!p.labelEl) return;
        if (p.cx < cur.x || p.cx > cur.x + cur.w || p.cy < cur.y || p.cy > cur.y + cur.h) {
          p.labelEl.style.display = "none";
          return;
        }
        const sx = (p.cx - cur.x) * pxPerUnit;
        const sy = (p.cy - cur.y) * pxPerUnit;
        // Box the widest line and count the lines — a two-line label needs
        // roughly twice the vertical room, and claiming only one line's
        // worth would let the next label overlap its second line.
        const mainEl = p.labelEl.querySelector(".pin-label-main");
        const subEl = p.labelEl.querySelector(".pin-label-sub");
        const mainLen = (mainEl ? mainEl.textContent : p.labelEl.textContent || "").length;
        const subLen = subEl ? subEl.textContent.length * 0.85 : 0; // sub renders smaller
        const lines = subEl ? 2 : 1;
        const w = Math.max(20, Math.max(mainLen, subLen) * LABEL_FONT_PX * 0.56);
        const h = LABEL_FONT_PX * 1.3 * lines;
        const left = sx + p.liveR * pxPerUnit + LABEL_GAP_PX;
        const box = { left, top: sy - h / 2, right: left + w, bottom: sy + h / 2 };
        const collides = placedBoxes.some(
          (b) => !(box.right < b.left || box.left > b.right || box.bottom < b.top || box.top > b.bottom)
        );
        if (collides) {
          p.labelEl.style.display = "none";
          return;
        }
        placedBoxes.push(box);
        p.labelEl.style.display = "";
        p.labelEl.setAttribute("font-size", fontSizeUser.toFixed(2));
        // Halo width in user units, so it renders as a constant ~3 screen px
        // at every zoom level (see the note in styles.css).
        p.labelEl.setAttribute("stroke-width", (3 / pxPerUnit).toFixed(5));
        const lxUser = (p.cx + p.liveR + gapUser).toFixed(1);
        p.labelEl.setAttribute("x", lxUser);
        // tspans carry their own x, so they must move with the parent.
        if (mainEl) mainEl.setAttribute("x", lxUser);
        if (subEl) subEl.setAttribute("x", lxUser);
      });
  }

  // Slippy-map tiles for the current viewBox. Picks the zoom level whose
  // native resolution is closest to how big the map is actually drawn, then
  // lays the covering tiles out in map coordinates. Existing <image> nodes
  // are reused by key so panning doesn't re-request tiles already on screen.
  const tileLayer = svg.querySelector(".world-map-tiles");
  const tileNodes = new Map();
  function refreshTiles() {
    if (!tileLayer) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const worldPxNeeded = (rect.width * WORLD_MAP_W) / cur.w;
    const z = Math.max(0, Math.min(TILE_MAX_Z, Math.round(Math.log2(worldPxNeeded / TILE_SIZE))));
    const n = Math.pow(2, z);
    const tileSpan = WORLD_MAP_W / n; // one tile's width in map units
    const x0 = Math.max(0, Math.floor(cur.x / tileSpan));
    const x1 = Math.min(n - 1, Math.floor((cur.x + cur.w) / tileSpan));
    const y0 = Math.max(0, Math.floor(cur.y / tileSpan));
    const y1 = Math.min(n - 1, Math.floor((cur.y + cur.h) / tileSpan));

    // Belt and braces: picking z from the viewport keeps this to a couple of
    // dozen tiles, but a bad viewBox must never be able to queue thousands
    // of image requests at the tile host.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) return;

    const wanted = new Set();
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const key = `${z}/${tx}/${ty}`;
        wanted.add(key);
        if (tileNodes.has(key)) continue;
        const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttribute("href", TILE_URL.replace("{z}", z).replace("{x}", tx).replace("{y}", ty));
        img.setAttribute("x", (tx * tileSpan).toFixed(6));
        img.setAttribute("y", (ty * tileSpan).toFixed(6));
        // Overlap very slightly to close the hairline seams the browser
        // leaves when it rounds each tile's edges independently. This has to
        // be RELATIVE to the tile: an absolute pad is invisible at low zoom
        // but, once tileSpan shrinks to a fraction of a map unit deep in,
        // becomes many times the tile's own size and every tile covers its
        // neighbours — which rendered the deep-zoom map as a blank slab.
        const drawn = tileSpan * 1.003;
        img.setAttribute("width", drawn.toFixed(6));
        img.setAttribute("height", drawn.toFixed(6));
        img.setAttribute("class", "world-map-tile");
        tileLayer.appendChild(img);
        tileNodes.set(key, img);
      }
    }
    // Drop tiles from other zoom levels / off-screen so the DOM doesn't grow
    // without bound over a long panning session.
    tileNodes.forEach((node, key) => {
      if (!wanted.has(key)) {
        node.remove();
        tileNodes.delete(key);
      }
    });
  }

  function apply() {
    svg.setAttribute("viewBox", `${cur.x.toFixed(1)} ${cur.y.toFixed(1)} ${cur.w.toFixed(1)} ${cur.h.toFixed(1)}`);
    const liveScale = cur.w / home.w;
    pins.forEach((p) => {
      p.liveR = p.baseR * liveScale;
      p.el.setAttribute("r", p.liveR.toFixed(2));
      if (p.numEl) p.numEl.setAttribute("font-size", (p.liveR * 1.25).toFixed(3));
    });
    updateLabels(liveScale);
    refreshTiles();
  }
  apply(); // establishes the correct initial label visibility (hidden, at liveScale 1)
  function clamp() {
    cur.x = Math.min(Math.max(cur.x, -cur.w * 0.4), WORLD_MAP_W - cur.w * 0.6);
    cur.y = Math.min(Math.max(cur.y, -cur.h * 0.4), mapH() - cur.h * 0.6);
  }

  // Zoom about a screen point, keeping whatever is under the cursor pinned
  // there. Order matters: the new size must be clamped BEFORE the anchor
  // maths, because deriving x/y from a size that clamping then overrides
  // leaves the anchor wrong — which showed up as the map sliding sideways
  // when you kept scrolling after hitting the zoom limit.
  function zoomAt(clientX, clientY, factor) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const px = cur.x + fx * cur.w;
    const py = cur.y + fy * cur.h;
    setSize(cur.w * factor);
    cur.x = px - fx * cur.w;
    cur.y = py - fy * cur.h;
    clamp();
    apply();
  }

  // A fixed step per wheel event (the original approach) feels fine for a
  // mouse wheel's discrete notches, but a trackpad's pinch/scroll fires
  // many rapid events with wildly varying deltaY — treating every one of
  // them as an identical fixed jump is what made it feel erratic. Scaling
  // the zoom factor by the actual deltaY magnitude instead (clamped so one
  // large spike can't jump too far) makes a slow gesture zoom smoothly and
  // a fast one zoom faster, matching the gesture rather than fighting it.
  // Raised from 0.0015 (Mario, 5 Aug — "too slow"): a trackpad emits small
  // deltas, so the old value needed a long swipe just to double the zoom.
  // The per-event clamp is what keeps this safe to raise — a mouse notch
  // (deltaY ±100) now saturates it at 1.5×, so one notch is a decisive step
  // while no single event can ever jump further than that.
  const WHEEL_SENSITIVITY = 0.004;
  const WHEEL_MAX_STEP = 1.5;
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = Math.max(1 / WHEEL_MAX_STEP, Math.min(WHEEL_MAX_STEP, Math.exp(e.deltaY * WHEEL_SENSITIVITY)));
      zoomAt(e.clientX, e.clientY, factor);
    },
    { passive: false }
  );

  // Pointer Events unify mouse/touch/pen: one pointer down+move pans, two
  // pointers down+move pinch-zooms. A small movement threshold before
  // treating it as a drag means a plain tap/click on a pin still fires its
  // normal click event undisturbed — no pointer capture, no stopPropagation.
  const DRAG_THRESHOLD = 4;
  const pointers = new Map();
  let dragAnchor = null;
  let pinchAnchor = null;
  let dragging = false;

  svg.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragAnchor = { x: e.clientX, y: e.clientY, vb: Object.assign({}, cur) };
      dragging = false;
    } else if (pointers.size === 2) {
      dragAnchor = null;
      dragging = true;
      const pts = [...pointers.values()];
      pinchAnchor = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, vb: Object.assign({}, cur) };
    }
  });

  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = svg.getBoundingClientRect();

    if (pointers.size === 1 && dragAnchor) {
      const movedX = e.clientX - dragAnchor.x, movedY = e.clientY - dragAnchor.y;
      if (!dragging && Math.hypot(movedX, movedY) < DRAG_THRESHOLD) return;
      dragging = true;
      e.preventDefault();
      cur.x = dragAnchor.vb.x - (movedX / rect.width) * dragAnchor.vb.w;
      cur.y = dragAnchor.vb.y - (movedY / rect.height) * dragAnchor.vb.h;
      clamp();
      apply();
    } else if (pointers.size === 2 && pinchAnchor) {
      e.preventDefault();
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const factor = pinchAnchor.dist / dist;
      const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
      const base = pinchAnchor.vb;
      const fx = (midX - rect.left) / rect.width;
      const fy = (midY - rect.top) / rect.height;
      const px = base.x + fx * base.w;
      const py = base.y + fy * base.h;
      // Same ordering rule as zoomAt: clamp the size first, then anchor.
      setSize(base.w * factor);
      cur.x = px - fx * cur.w;
      cur.y = py - fy * cur.h;
      clamp();
      apply();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      dragAnchor = null;
      pinchAnchor = null;
      dragging = false;
    } else if (pointers.size === 1) {
      const [[, p]] = pointers;
      dragAnchor = { x: p.x, y: p.y, vb: Object.assign({}, cur) };
      pinchAnchor = null;
    }
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  $$(".world-map-zoom-btn", root).forEach((btn) =>
    btn.addEventListener("click", () => {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      if (btn.dataset.zoom === "in") zoomAt(cx, cy, 1 / 1.4);
      else if (btn.dataset.zoom === "out") zoomAt(cx, cy, 1.4);
      else {
        cur = Object.assign({}, home);
        apply();
      }
    })
  );
}

// --- Saints atlas (Map Phase B — every saint's birth/death place) ---

// (The old ATLAS_CENTURY_BUCKETS predicate map is gone — the era chips are
// now presets over the single year window in ERA_PRESETS, so there is one
// year filter rather than two that could disagree.)

// `life.order` is free prose (69 distinct strings across 81 saints — see
// TODO.md), so grouping is by keyword rather than by a clean field. Order
// matters: the first pattern that matches wins, which is why the more
// specific families sit above the generic "Diocesan"/"Lay" catch-alls.
// A saint matching nothing lands in "Other", which is honest rather than
// silently dropping them from the filter.
const ORDER_GROUPS = [
  { key: "carmelite", label: "Carmelite", re: /carmelit/i },
  { key: "franciscan", label: "Franciscan family", re: /franciscan|friars minor|poor clare|capuchin|o\.f\.m|order of saint clare/i },
  { key: "dominican", label: "Dominican", re: /dominican|order of preachers|o\.p\.|mantellate/i },
  { key: "benedictine", label: "Benedictine", re: /benedictine|order of saint benedict|monte cassino/i },
  { key: "jesuit", label: "Jesuit", re: /society of jesus|jesuit|societas iesu/i },
  { key: "cistercian", label: "Cistercian", re: /cistercian|clairvaux|c[ií]teaux/i },
  { key: "redemptorist", label: "Redemptorist", re: /redemptorist|most holy redeemer|c\.ss\.r/i },
  { key: "salesian", label: "Salesian", re: /salesian|s\.d\.b|francis de sales\)/i },
  { key: "oratorian", label: "Oratorian", re: /oratory|oratorian/i },
  { key: "passionist", label: "Passionist", re: /passionist|c\.p\./i },
  { key: "vincentian", label: "Vincentian family", re: /congregation of the mission|vincentian|lazarist|daughters of charity|sisters of charity/i },
  { key: "monastic", label: "Monastic / hermit", re: /monastic|hermit|monk|cenobitic|anchor/i },
  { key: "diocesan", label: "Diocesan clergy", re: /diocesan|secular\)?\s*priest|bishop|deacon|cardinal|archbishop/i },
  { key: "lay", label: "Lay", re: /lay\b|laywoman|layman|widow|empress|married/i },
];

function saintOrderGroup(s) {
  const text = `${s.life.order || ""} ${s.life.stateOfLife || ""}`;
  const hit = ORDER_GROUPS.find((g) => g.re.test(text));
  return hit ? hit.key : "other";
}

function saintBirthYear(s) {
  return extractYear(s.dates.born);
}

// The full birth-year span present in the data, used to seed the year
// inputs and scale the histogram. Computed from the data rather than
// hardcoded so it stays right as saints are added.
function atlasYearBounds() {
  const years = window.SAINTS.map(saintBirthYear).filter((y) => y != null);
  return { min: Math.min(...years), max: Math.max(...years) };
}

// SINGLE source of truth for which saints the atlas is showing. Every panel
// control, the stats line, the histogram and the map all read from this, so
// they can never disagree about what is on screen.
function atlasFilteredSaints(opts) {
  const ignoreYear = opts && opts.ignoreYear;
  const tier = state.saintsFilterTier;
  const bounds = atlasYearBounds();
  const from = state.atlasYearFrom == null ? bounds.min : state.atlasYearFrom;
  const to = state.atlasYearTo == null ? bounds.max : state.atlasYearTo;

  return window.SAINTS.filter((s) => {
    if (tier !== "all" && s.listTier !== tier) return false;
    if (state.atlasIncorruptOnly && !s.cult.incorrupt) return false;
    if (state.atlasOrder !== "all" && saintOrderGroup(s) !== state.atlasOrder) return false;
    if (state.atlasStatus !== "all" && saintPersonal(s.slug).status !== state.atlasStatus) return false;
    if (state.atlasExcluded && state.atlasExcluded.has(s.slug)) return false;
    if (!ignoreYear) {
      const y = saintBirthYear(s);
      // Undated saints stay visible on the full span but drop out as soon as
      // the window is narrowed — otherwise they'd silently claim a date.
      if (y == null) return state.atlasYearFrom == null && state.atlasYearTo == null;
      if (y < from || y > to) return false;
    }
    return true;
  });
}

function atlasActiveFilterCount() {
  return (
    (state.saintsFilterTier !== "all" ? 1 : 0) +
    (state.atlasYearFrom != null || state.atlasYearTo != null ? 1 : 0) +
    (state.atlasPlaceMode !== "both" ? 1 : 0) +
    (state.atlasIncorruptOnly ? 1 : 0) +
    (state.atlasOrder !== "all" ? 1 : 0) +
    (state.atlasStatus !== "all" ? 1 : 0) +
    (state.atlasExcluded && state.atlasExcluded.size ? 1 : 0)
  );
}

function clearAtlasFilters() {
  state.saintsFilterTier = "all";
  state.atlasFilterCentury = "all";
  state.atlasYearFrom = null;
  state.atlasYearTo = null;
  state.atlasPlaceMode = "both";
  state.atlasJourneys = false;
  state.atlasIncorruptOnly = false;
  state.atlasOrder = "all";
  state.atlasStatus = "all";
  state.atlasExcluded = null;
  state.atlasActiveKey = null;
  renderSaintsAtlas();
}

function renderSaintsAtlas() {
  $$(".tier-chip", $("#atlas-filter-tier-row")).forEach((c) => c.classList.toggle("active", c.dataset.tier === state.saintsFilterTier));
  $$(".century-chip", $("#atlas-filter-century-row")).forEach((c) => c.classList.toggle("active", c.dataset.century === state.atlasFilterCentury));

  const tier = state.saintsFilterTier;
  const century = state.atlasFilterCentury;

  const saints = atlasFilteredSaints();

  // Group pins by place key so saints who share a city (Rome, Assisi...)
  // collapse into one dot rather than stacking exact duplicates. Which of
  // birth/death counts depends on the "What to plot" mode.
  // `ungeocoded` catches saints added to saints-data.js without a matching
  // saints-geo.js entry — they'd otherwise vanish from the map silently
  // while still being counted, which is exactly how the first four
  // (Christina of Bolsena, Maximus, Roch, Helena) went unnoticed.
  const mode = state.atlasPlaceMode;
  const groups = {};
  const ungeocoded = [];
  const journeys = [];
  saints.forEach((s) => {
    const geo = window.SAINT_PLACES[s.slug];
    if (!geo) {
      ungeocoded.push(s);
      return;
    }
    const wanted = mode === "born" ? [geo.born] : mode === "died" ? [geo.died] : [geo.born, geo.died];
    wanted.forEach((pt) => {
      if (!pt) return;
      const coords = window.PLACE_COORDS[pt.key];
      if (!coords) return;
      if (!groups[pt.key]) groups[pt.key] = { lat: coords[0], lon: coords[1], key: pt.key, label: pt.label, saints: [] };
      if (!groups[pt.key].saints.some((x) => x.slug === s.slug)) {
        groups[pt.key].saints.push({ slug: s.slug, name: s.name, hasStops: !!(geo.stops && geo.stops.length) });
      }
    });
    // A journey is only meaningful when the two ends actually differ —
    // a saint who died in their birth town would otherwise contribute a
    // zero-length line that renders as a stray dot.
    if (state.atlasJourneys && geo.born && geo.died && geo.born.key !== geo.died.key) {
      const a = window.PLACE_COORDS[geo.born.key];
      const b = window.PLACE_COORDS[geo.died.key];
      if (a && b) journeys.push({ from: { lat: a[0], lon: a[1] }, to: { lat: b[0], lon: b[1] }, name: s.name });
    }
  });

  const points = Object.values(groups).map((g) => {
    const firstName = g.saints[0].name.replace(/^St\.?\s+/, "");
    return {
      ...g,
      count: g.saints.length,
      displayLabel: shortPlaceLabel(g.label),
      subLabel: g.saints.length > 1 ? `${firstName} +${g.saints.length - 1}` : firstName,
    };
  });
  const mapSvg = renderWorldMapSVG(points, { mode: "scatter", journeys });
  const plotted = saints.length - ungeocoded.length;
  const countLine = `${plotted} of ${window.SAINTS.length} saints`;
  const warnLine = ungeocoded.length
    ? `<div class="atlas-warn">⚠ ${ungeocoded.length} not on the map — no place data yet: ${ungeocoded.map((s) => escapeHtml(s.name)).join(", ")}</div>`
    : "";
  $("#saints-atlas-map").innerHTML = `<div class="world-map-wrap">${mapSvg}${mapZoomControlsHtml()}</div><div class="atlas-count">${countLine}</div>${warnLine}`;
  initMapZoomPan($("#saints-atlas-map"));
  wireMapTilesToggle($("#saints-atlas-map"), renderSaintsAtlas);
  renderAtlasPanel(saints);
  renderAtlasStats(saints, groups);

  $$(".world-map-pin", $("#saints-atlas-map")).forEach((pin) =>
    pin.addEventListener("click", () => {
      const key = pin.dataset.key;
      state.atlasActiveKey = state.atlasActiveKey === key ? null : key;
      renderAtlasPopover(groups);
    })
  );
  renderAtlasPopover(groups);
}

// --- Atlas analysis panel ---

// A century bar row: one series (how many saints born in each century), so
// no legend is needed and a single hue carries it. Bars are also the year
// filter — clicking one sets the year window to that century.
function renderCenturyHistogram() {
  const bounds = atlasYearBounds();
  const firstC = Math.floor(bounds.min / 100);
  const lastC = Math.floor(bounds.max / 100);
  // Count against everything EXCEPT the year filter, so the bars keep
  // showing the shape of the whole (otherwise-filtered) set and you can see
  // what you'd be selecting rather than just your current selection.
  const pool = atlasFilteredSaints({ ignoreYear: true });
  const counts = [];
  for (let c = firstC; c <= lastC; c++) {
    const from = c * 100, to = from + 99;
    counts.push({ c, from, to, n: pool.filter((s) => { const y = saintBirthYear(s); return y != null && y >= from && y <= to; }).length });
  }
  const max = Math.max(1, ...counts.map((d) => d.n));
  const selFrom = state.atlasYearFrom, selTo = state.atlasYearTo;

  const W = 100, H = 34, gap = 0.6;
  const bw = W / counts.length;
  const bars = counts
    .map((d, i) => {
      // A zero century still gets a sliver so the timeline reads as
      // continuous — an invisible bar leaves a gap that looks like missing
      // data rather than "no saints born then".
      const h = d.n === 0 ? 0.9 : Math.max(1.4, (d.n / max) * H);
      const selected = selFrom != null && selTo != null && d.from >= selFrom && d.to <= selTo;
      const dim = (selFrom != null || selTo != null) && !selected;
      return `<rect x="${(i * bw + gap / 2).toFixed(2)}" y="${(H - h).toFixed(2)}" width="${(bw - gap).toFixed(2)}" height="${h.toFixed(2)}" rx="0.5"
        class="hist-bar${dim ? " dim" : ""}${d.n === 0 ? " empty" : ""}" data-from="${d.from}" data-to="${d.to}" data-n="${d.n}" data-c="${d.c + 1}"></rect>`;
    })
    .join("");

  // Only the ends are labelled — a number over every bar is noise at this size.
  const axis = `<div class="hist-axis"><span>${counts[0].from}s</span><span>${counts[counts.length - 1].from}s</span></div>`;
  $("#atlas-histogram").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="hist-svg">${bars}</svg>` + axis;

  const readout = $("#atlas-histogram-readout");
  const setReadout = (txt) => (readout.textContent = txt);
  setReadout(`${pool.length} saints with a known birth year`);
  $$(".hist-bar", $("#atlas-histogram")).forEach((bar) => {
    bar.addEventListener("mouseenter", () =>
      setReadout(`${ordinalCentury(+bar.dataset.c)} century (${bar.dataset.from}–${+bar.dataset.from + 99}) — ${bar.dataset.n} saint${bar.dataset.n === "1" ? "" : "s"}`)
    );
    bar.addEventListener("mouseleave", () => setReadout(`${pool.length} saints with a known birth year`));
    bar.addEventListener("click", () => {
      const from = +bar.dataset.from, to = from + 99;
      // Clicking the century you already have selected clears it again.
      if (state.atlasYearFrom === from && state.atlasYearTo === to) {
        state.atlasYearFrom = null;
        state.atlasYearTo = null;
      } else {
        state.atlasYearFrom = from;
        state.atlasYearTo = to;
      }
      state.atlasFilterCentury = "all";
      renderSaintsAtlas();
    });
  });
}

function ordinalCentury(n) {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
  return n + suffix;
}

function renderAtlasPanel(saints) {
  $("#atlas-panel").classList.toggle("hidden", !state.atlasPanelOpen);
  const badge = $("#atlas-filter-badge");
  const n = atlasActiveFilterCount();
  badge.textContent = String(n);
  badge.classList.toggle("hidden", n === 0);
  $("#atlas-headline").textContent = `${saints.length} of ${window.SAINTS.length} saints shown`;

  // Chip active states
  $$(".tier-chip", $("#atlas-filter-tier-row")).forEach((c) => c.classList.toggle("active", c.dataset.tier === state.saintsFilterTier));
  $$(".century-chip", $("#atlas-filter-century-row")).forEach((c) => c.classList.toggle("active", c.dataset.century === state.atlasFilterCentury));
  $$(".place-chip", $("#atlas-placemode-row")).forEach((c) => c.classList.toggle("active", c.dataset.place === state.atlasPlaceMode));
  $$(".status-chip", $("#atlas-status-row")).forEach((c) => c.classList.toggle("active", c.dataset.status === state.atlasStatus));
  $("#atlas-journeys").checked = state.atlasJourneys;
  $("#atlas-incorrupt").checked = state.atlasIncorruptOnly;

  const bounds = atlasYearBounds();
  const yFrom = $("#atlas-year-from"), yTo = $("#atlas-year-to");
  yFrom.min = bounds.min; yFrom.max = bounds.max; yFrom.placeholder = bounds.min;
  yTo.min = bounds.min; yTo.max = bounds.max; yTo.placeholder = bounds.max;
  yFrom.value = state.atlasYearFrom == null ? "" : state.atlasYearFrom;
  yTo.value = state.atlasYearTo == null ? "" : state.atlasYearTo;

  // Order chips, built from what's actually present so empty families never
  // show as dead options. Counts are computed ignoring the order filter
  // itself, so switching between families doesn't make the others read zero.
  const orderPool = window.SAINTS.filter((s) => {
    if (state.saintsFilterTier !== "all" && s.listTier !== state.saintsFilterTier) return false;
    return true;
  });
  const orderCounts = {};
  orderPool.forEach((s) => {
    const k = saintOrderGroup(s);
    orderCounts[k] = (orderCounts[k] || 0) + 1;
  });
  const orderChips = [`<span class="chip order-chip${state.atlasOrder === "all" ? " active" : ""}" data-order="all">All</span>`]
    .concat(
      ORDER_GROUPS.concat([{ key: "other", label: "Other" }])
        .filter((g) => orderCounts[g.key])
        .map((g) => `<span class="chip order-chip${state.atlasOrder === g.key ? " active" : ""}" data-order="${g.key}">${escapeHtml(g.label)} <span class="chip-count">${orderCounts[g.key]}</span></span>`)
    )
    .join("");
  $("#atlas-order-row").innerHTML = orderChips;
  $$(".order-chip", $("#atlas-order-row")).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.atlasOrder = chip.dataset.order;
      renderSaintsAtlas();
    })
  );

  renderCenturyHistogram();
  renderAtlasSaintPicker();
}

// Ticked = shown. Stored as an EXCLUSION set so that adding a new saint to
// the data defaults to visible rather than silently hidden.
function renderAtlasSaintPicker() {
  const q = state.atlasSaintSearch.trim().toLowerCase();
  const excluded = state.atlasExcluded;
  const list = window.SAINTS.slice().sort((a, b) => a.sortName.localeCompare(b.sortName));
  const shown = q ? list.filter((s) => s.name.toLowerCase().includes(q)) : list;
  const includedCount = window.SAINTS.length - (excluded ? excluded.size : 0);
  $("#atlas-pick-count").textContent = `${includedCount} of ${window.SAINTS.length} ticked`;
  $("#atlas-saint-picker").innerHTML = shown
    .map(
      (s) =>
        `<label class="saint-pick-row"><input type="checkbox" data-slug="${s.slug}" ${excluded && excluded.has(s.slug) ? "" : "checked"}> ${escapeHtml(s.name)}</label>`
    )
    .join("") || `<div class="filter-empty-note">No saint matches that search.</div>`;
  $$("input[data-slug]", $("#atlas-saint-picker")).forEach((cb) =>
    cb.addEventListener("change", () => {
      if (!state.atlasExcluded) state.atlasExcluded = new Set();
      if (cb.checked) state.atlasExcluded.delete(cb.dataset.slug);
      else state.atlasExcluded.add(cb.dataset.slug);
      if (state.atlasExcluded.size === 0) state.atlasExcluded = null;
      renderSaintsAtlas();
    })
  );
}

// The analytical readout: what the current selection actually contains.
function renderAtlasStats(saints, groups) {
  if (!saints.length) {
    $("#atlas-stats").innerHTML = `<div class="filter-empty-note">No saints match these filters.</div>`;
    return;
  }
  const years = saints.map(saintBirthYear).filter((y) => y != null).sort((a, b) => a - b);
  const placeCounts = Object.values(groups)
    .map((g) => ({ label: shortPlaceLabel(g.label), n: g.saints.length }))
    .sort((a, b) => b.n - a.n);
  const movers = saints.filter((s) => {
    const g = window.SAINT_PLACES[s.slug];
    return g && g.born && g.died && g.born.key !== g.died.key;
  }).length;
  const incorrupt = saints.filter((s) => s.cult.incorrupt).length;
  const withCards = saints.reduce((a, s) => a + (s.cards || []).length, 0);

  const tile = (label, value, note) =>
    `<div class="stat-tile"><div class="stat-value">${escapeHtml(String(value))}</div><div class="stat-label">${escapeHtml(label)}</div>${note ? `<div class="stat-note">${escapeHtml(note)}</div>` : ""}</div>`;

  const span = years.length ? `${years[0]}–${years[years.length - 1]}` : "—";
  const top = placeCounts[0];
  $("#atlas-stats").innerHTML = `
    <div class="stat-row">
      ${tile("saints shown", saints.length, `${Object.keys(groups).length} distinct places`)}
      ${tile("birth years", span, years.length < saints.length ? `${saints.length - years.length} undated` : "all dated")}
      ${tile("busiest place", top ? top.label : "—", top ? `${top.n} saint${top.n === 1 ? "" : "s"}` : "")}
      ${tile("died elsewhere", movers, `of ${saints.length} — moved in life`)}
      ${tile("incorrupt", incorrupt, "bodies recorded")}
      ${tile("flashcards", withCards, "across this selection")}
    </div>`;
}

function renderAtlasPopover(groups) {
  const pop = $("#saints-atlas-popover");
  const group = state.atlasActiveKey && groups[state.atlasActiveKey];
  if (!group) {
    pop.classList.add("hidden");
    pop.innerHTML = "";
    return;
  }
  const names = group.saints
    .map(
      (s) =>
        `<div class="atlas-popover-name" data-slug="${s.slug}">${escapeHtml(s.name)}${s.hasStops ? ` <span class="atlas-popover-hint">— see full life-path</span>` : ""}</div>`
    )
    .join("");
  pop.innerHTML = `<div class="atlas-popover-title">${escapeHtml(group.label)}</div>${names}`;
  pop.classList.remove("hidden");
  $$(".atlas-popover-name", pop).forEach((row) => row.addEventListener("click", () => openSaintReader(row.dataset.slug)));
}

// --- Saint dossier reader ---

function saintBySlug(slug) {
  return window.SAINTS.find((s) => s.slug === slug);
}

function section(title, innerHtml) {
  if (!innerHtml) return "";
  return `<div class="saint-section"><div class="saint-section-title">${escapeHtml(title)}</div>${innerHtml}</div>`;
}

function fieldLine(label, value) {
  if (!value) return "";
  return `<div class="saint-field"><span class="saint-field-label">${escapeHtml(label)}</span> ${escapeHtml(value)}</div>`;
}

function bulletList(items, render) {
  if (!items || items.length === 0) return "";
  return `<ul class="saint-list">${items.map((it) => `<li>${render ? render(it) : escapeHtml(it)}</li>`).join("")}</ul>`;
}

function renderAnecdote(a) {
  return `<strong>${escapeHtml(a.title)}</strong>${a.legend ? ` <span class="legend-flag">legend/tradition</span>` : ` <span class="legend-flag documented">documented</span>`}<br>${escapeHtml(a.text)}${a.source ? `<div class="saint-source">— ${escapeHtml(a.source)}</div>` : ""}`;
}

// A handful of scaffold fields use "—" as a deliberate "nothing here"
// placeholder (kept visually consistent with the rest of the data) rather
// than an empty string — real() treats that the same as absent so it never
// prints as a lone dash in the rendered dossier.
function real(v) {
  return v && v !== "—" ? v : "";
}

function renderWriting(w) {
  const bits = [w.genre, w.year].filter(Boolean).join(" · ");
  return `<strong>${escapeHtml(w.title)}</strong>${real(w.original) ? ` <em>(${escapeHtml(w.original)})</em>` : ""}${bits ? ` — ${escapeHtml(bits)}` : ""}${w.note ? `<br>${escapeHtml(w.note)}` : ""}${real(w.translation) ? `<div class="saint-source">Translation: ${escapeHtml(w.translation)}${real(w.publisher) ? " — " + escapeHtml(w.publisher) : ""}</div>` : ""}${real(w.free) ? `<div class="saint-source">Free: ${escapeHtml(w.free)}</div>` : ""}`;
}

function renderPatronage(p) {
  return `<strong>${escapeHtml(p.of)}</strong>${p.why ? ` — ${escapeHtml(p.why)}` : ""}`;
}

function renderDailyPracticeItem(p) {
  return `<strong>${escapeHtml(p.name)}</strong>${p.legend ? ` <span class="legend-flag">legend/tradition</span>` : ""}<br>${escapeHtml(p.detail)}${p.source ? `<div class="saint-source">— ${escapeHtml(p.source)}</div>` : ""}`;
}

// birthYear lets each landmark show the saint's age at that point, same
// age math as the Story tab's visual timeline (buildSaintTimeline) — added
// because on its own a bare year (e.g. "1713") gives no felt sense of how
// old the saint actually was.
function renderLandmark(t, birthYear) {
  const year = extractYear(t.date);
  const age = birthYear != null && year != null ? year - birthYear : null;
  const ageLabel = age == null ? "" : age === 0 ? ` <span class="timeline-age">born</span>` : age > 0 ? ` <span class="timeline-age">age ${age}</span>` : "";
  return `<strong>${escapeHtml(t.date)}</strong>${ageLabel} — ${escapeHtml(t.event)}`;
}

// Pulls the first 3-4 digit run out of a free-text date ("28 March 1515",
// "c. 1225", "1559–63", "Lent 1554") — good enough for sorting and age math
// across data this approximate; day numbers are 1-2 digits so they never
// collide with a \d{3,4} match.
function extractYear(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : null;
}

// Merges narrative.timeline into a single chronological life-timeline,
// synthesising Born/Death bookends from dates.born/dates.died when they
// aren't already the first/last entries (the six full dossiers already
// write them in; core scaffolds have no narrative.timeline at all, so this
// is what gives every saint at least a birth→death timeline). Each entry
// gets an approximate age-at-event computed from the extracted years.
function buildSaintTimeline(s) {
  const d = s.dates;
  const birthYear = extractYear(d.born);
  const entries = (s.narrative.timeline || []).map((t) => ({ label: t.year, year: extractYear(t.year), event: t.event }));

  const hasBorn = entries.some((e) => /\bborn\b/i.test(e.event));
  const hasDied = entries.some((e) => /\b(died|dies|death|martyred)\b/i.test(e.event));
  if (!hasBorn && d.born) {
    entries.unshift({ label: d.born, year: birthYear, event: `Born${d.bornPlace ? " at " + d.bornPlace : ""}` });
  }
  if (!hasDied && d.died) {
    entries.push({ label: d.died, year: extractYear(d.died), event: `Dies${d.diedPlace ? " at " + d.diedPlace : ""}${d.deathManner ? " — " + d.deathManner : ""}` });
  }

  entries.sort((a, b) => {
    if (a.year == null && b.year == null) return 0;
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return a.year - b.year;
  });

  entries.forEach((e) => {
    if (birthYear != null && e.year != null) {
      const age = e.year - birthYear;
      e.age = age === 0 ? "born" : age > 0 ? `age ${age}` : null;
    } else {
      e.age = null;
    }
  });

  return entries;
}

function renderTimelineUI(entries) {
  if (!entries || entries.length === 0) return "";
  const items = entries
    .map(
      (e) => `
    <div class="timeline-item">
      <div class="timeline-marker"></div>
      <div class="timeline-content">
        <div class="timeline-year">${escapeHtml(e.label || (e.year != null ? String(e.year) : "?"))}${e.age ? `<span class="timeline-age">${escapeHtml(e.age)}</span>` : ""}</div>
        <div class="timeline-event">${escapeHtml(e.event)}</div>
      </div>
    </div>`
    )
    .join("");
  return `<div class="timeline">${items}</div>`;
}

// `render`, if given, is a per-item HTML renderer (renderWriting,
// renderPatronage, etc.) whose output must NOT be escaped again — only
// pass plain strings (no render fn) when items are themselves raw text.
function renderAboutGroup(label, items, render) {
  if (!items || items.length === 0) return "";
  return `<div class="saint-about-group"><span class="saint-field-label">${escapeHtml(label)}</span>${bulletList(items, render)}</div>`;
}

// Map Phase A — the per-saint life-path tab. Only the 19 full dossiers have
// a `stops` list in window.SAINT_PLACES (saints-geo.js); core scaffolds
// return "" here so renderSaintDossier's tab filter drops the tab entirely
// rather than showing an empty map. Ages are shown only where a stop's
// label happens to carry an extractable year (reusing extractYear, same as
// buildSaintTimeline) — no age is invented for stops that don't.
function renderSaintMapTab(s) {
  const geo = window.SAINT_PLACES && window.SAINT_PLACES[s.slug];
  if (!geo || !geo.stops || geo.stops.length === 0) return "";
  const birthYear = extractYear(s.dates.born);
  const points = geo.stops
    .map((stop) => {
      const coords = window.PLACE_COORDS[stop.key];
      if (!coords) return null;
      const year = extractYear(stop.label);
      const age = birthYear != null && year != null ? year - birthYear : null;
      // displayLabel keeps the map pin readable ("Ávila"); the full prose
      // stop label still appears in the numbered list under the map.
      return { lat: coords[0], lon: coords[1], key: stop.key, label: stop.label, displayLabel: shortPlaceLabel(stop.label), age };
    })
    .filter(Boolean);
  if (points.length === 0) return "";

  const mapSvg = renderWorldMapSVG(points, { mode: "path", fit: true });
  const list = points
    .map(
      (p, i) =>
        `<div class="map-stop-row" data-idx="${i}"><span class="map-stop-num">${i + 1}</span><span class="map-stop-label">${escapeHtml(p.label)}</span>${p.age != null ? `<span class="map-stop-age">age ${p.age}</span>` : ""}</div>`
    )
    .join("");
  return `<div class="world-map-wrap">${mapSvg}${mapZoomControlsHtml()}</div><div class="map-stop-list">${list}</div>`;
}

// Hovering a numbered row in the stop list lights up the matching pin, and
// vice versa. With a path that doubles back on itself, being able to point
// at "stop 5" and see where it actually is does more than any amount of
// line styling.
function wireSaintMapStopLinking(root) {
  const rows = $$(".map-stop-row", root);
  if (!rows.length) return;
  const setActive = (idx, on) => {
    const pin = root.querySelector(`.world-map-pin[data-idx="${idx}"]`);
    const num = root.querySelector(`.world-map-stop-num[data-idx="${idx}"]`);
    const row = root.querySelector(`.map-stop-row[data-idx="${idx}"]`);
    if (pin) pin.classList.toggle("highlight", on);
    if (num) num.classList.toggle("highlight", on);
    if (row) row.classList.toggle("highlight", on);
    // Nearby stops overlap (Salamanca and Alba de Tormes are ~40km apart, so
    // they collide at the default fit). SVG has no z-index — paint order is
    // document order — so bring the highlighted pair to the front, otherwise
    // pointing at a buried stop highlights something you cannot see.
    if (on && pin) {
      pin.parentNode.appendChild(pin);
      if (num) num.parentNode.appendChild(num);
    }
  };
  rows.forEach((row) => {
    const idx = row.dataset.idx;
    row.addEventListener("mouseenter", () => setActive(idx, true));
    row.addEventListener("mouseleave", () => setActive(idx, false));
  });
  $$(".world-map-pin[data-idx]", root).forEach((pin) => {
    const idx = pin.dataset.idx;
    pin.addEventListener("mouseenter", () => setActive(idx, true));
    pin.addEventListener("mouseleave", () => setActive(idx, false));
  });
}

function renderSaintDossier(s) {
  const d = s.dates,
    id = s.identity,
    life = s.life,
    n = s.narrative,
    sp = s.spirituality,
    cult = s.cult,
    conn = s.connections,
    about = s.about || {};

  const datesLine = [
    d.born && `b. ${d.born}${d.bornPlace ? ", " + d.bornPlace : ""}`,
    d.died && `d. ${d.died}${d.diedPlace ? ", " + d.diedPlace : ""}`,
  ]
    .filter(Boolean)
    .join(" — ");

  const canonLine = [
    d.beatified && d.beatified.date && d.beatified.date !== "—" && `Beatified ${d.beatified.date}${d.beatified.by && d.beatified.by !== "—" ? " by " + d.beatified.by : ""}`,
    d.canonized && d.canonized.date && d.canonized.date !== "—" && `Canonized ${d.canonized.date}${d.canonized.by && d.canonized.by !== "—" ? " by " + d.canonized.by : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const header = `
    <div class="reader-kind">${s.depth === "full" ? "Full dossier" : "Saint — core scaffold"}${s.causeStage && s.causeStage !== "saint" ? ` <span class="tag-chip cause-tag cause-${s.causeStage}">${CAUSE_STAGE_LABELS[s.causeStage]}</span>` : ""}${s.listTier ? ` <span class="tag-chip tier-tag tier-${s.listTier}">${SAINT_TIER_LABELS[s.listTier]}</span>` : ""}</div>
    <h1 class="reader-title">${escapeHtml(s.name)}</h1>
    <div class="reader-attribution">${escapeHtml([real(id.birthName), real(id.religiousName)].filter(Boolean).join(" · "))}</div>
    <div class="reader-meta">
      ${d.feastLabel ? `<strong>${escapeHtml(d.feastLabel)}</strong>` : "No fixed General Roman Calendar feast"}
      ${datesLine ? `<span class="dot">•</span>${escapeHtml(datesLine)}` : ""}
    </div>
    ${canonLine ? `<div class="reader-meta">${escapeHtml(canonLine)}</div>` : ""}
    ${(id.titles || []).length ? `<div class="chip-row saint-title-chips">${id.titles.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
  `;

  const noteBlock = s.note ? `<div class="saint-note-flag">⚠ ${escapeHtml(s.note)}</div>` : "";

  const yourLayer = renderYourLayerBlock(s);

  const identitySection = section(
    "Identity",
    [
      fieldLine("Epithets", (id.epithets || []).join(", ")),
      fieldLine("Doctor title", id.doctorTitle && `${id.doctorTitle}${id.doctorDeclared ? " — " + id.doctorDeclared : ""}`),
      fieldLine("Liturgical rank", id.rank),
    ]
      .filter(Boolean)
      .join("")
  );

  const altFeasts = (d.altFeasts || []).map((af) => `${af.label} — ${af.calendar}`);
  const landmarksBirthYear = extractYear(d.born);
  const datesSection = section(
    "Dates & calendar",
    [fieldLine("Alternate feasts", altFeasts.join("; ")), fieldLine("Manner of death", d.deathManner), fieldLine("Age at death", d.ageAtDeath)]
      .filter(Boolean)
      .join("") + bulletList(d.landmarks, (t) => renderLandmark(t, landmarksBirthYear))
  );

  const lifeSection = section(
    "Life",
    [
      fieldLine("Nationality", life.nationality),
      fieldLine("Era", life.era),
      fieldLine("Order / institute", life.order),
      fieldLine("State of life", life.stateOfLife),
      fieldLine("Family", life.family),
    ]
      .filter(Boolean)
      .join("") +
      renderAboutGroup("Places", life.places) +
      renderAboutGroup("Offices held", life.offices) +
      fieldLine("Historical context", life.context)
  );

  const timelineEntries = buildSaintTimeline(s);
  const timelineBlock = timelineEntries.length
    ? `<div class="saint-about-group"><span class="saint-field-label">Timeline</span>${renderTimelineUI(timelineEntries)}</div>`
    : "";

  const narrativeSection = section(
    "Narrative",
    [
      n.summary && `<p class="saint-summary">${escapeHtml(n.summary)}</p>`,
      n.story && `<div class="saint-story">${renderTextBlock(n.story)}</div>`,
    ]
      .filter(Boolean)
      .join("") +
      timelineBlock +
      (n.conversion ? section("Conversion / turning point", `<p>${escapeHtml(n.conversion)}</p>`) : "") +
      renderAboutGroup("Anecdotes", n.anecdotes, renderAnecdote) +
      renderAboutGroup("Mystical phenomena", n.phenomena) +
      fieldLine("Miracles", n.miracles) +
      fieldLine("Sufferings", n.sufferings) +
      fieldLine("Death", n.death) +
      fieldLine("Last words", n.lastWords)
  );

  const spiritualitySection = section(
    "Spirituality & doctrine",
    fieldLine("Charism", sp.charism) +
      renderAboutGroup("Key teachings", sp.teachings) +
      renderAboutGroup("Method", sp.method ? [sp.method] : null) +
      renderAboutGroup("Own devotions", sp.devotions) +
      fieldLine("School", sp.school) +
      renderAboutGroup("Influenced by", sp.influencedBy) +
      renderAboutGroup("Influenced", sp.influenced) +
      fieldLine("Controversies", sp.controversies)
  );

  const dp = s.dailyPractice;
  const dailyPracticeSection = dp
    ? section(
        "Daily practice — how they lived it out",
        fieldLine("Rhythm of the day", dp.rhythm) +
          renderAboutGroup("Concrete practices", dp.practices, renderDailyPracticeItem) +
          (dp.forYou ? `<div class="saint-field saint-for-you"><span class="saint-field-label">For you</span> ${escapeHtml(dp.forYou)}</div>` : "")
      )
    : "";

  const writingsSection = section(
    "Writings",
    renderAboutGroup("By this saint", (s.writings || []).slice().sort((a, b) => (a.order || 99) - (b.order || 99)), renderWriting) +
      fieldLine("Notes on editions", s.writingsNotes)
  );

  const aboutSection = section(
    "Writings & media about this saint",
    renderAboutGroup("Early hagiography", about.hagiography) +
      renderAboutGroup("Biography", about.biography) +
      renderAboutGroup("Scholarly", about.scholarly) +
      renderAboutGroup("Devotional", about.devotional) +
      renderAboutGroup("Papal documents", about.papal) +
      renderAboutGroup("Film / media", about.media) +
      fieldLine("Office of Readings", about.officeOfReadings)
  );

  const cultSection = section(
    "Devotion & cult",
    renderAboutGroup("Patronages", cult.patronages, renderPatronage) +
      renderAboutGroup("Invoked against", cult.invokedAgainst) +
      renderAboutGroup("Attributes / iconography", cult.attributes) +
      fieldLine("Iconography notes", cult.iconography) +
      renderAboutGroup("Artworks", cult.artworks) +
      fieldLine("Relics", cult.relics) +
      (cult.incorrupt ? `<div class="saint-field"><span class="saint-field-label">Incorrupt</span> Yes</div>` : "") +
      renderAboutGroup("Shrines", cult.shrines) +
      renderAboutGroup("Devotions", cult.devotions) +
      fieldLine("Customs", cult.customs) +
      renderAboutGroup("Foundations", cult.foundations)
  );

  const connectionsSection = section(
    "Connections",
    renderAboutGroup("Contemporaries", conn.contemporaries) +
      renderAboutGroup("Directors", conn.directors) +
      renderAboutGroup("Disciples", conn.disciples) +
      fieldLine("Family", conn.family) +
      renderRelatedSaintsChips(conn.related)
  );

  const sourcesSection = renderSourcesSection(s.slug);
  const mapSection = renderSaintMapTab(s);

  // Grouped into tabs so a full dossier isn't one long scroll — a tab is
  // only shown at all if it has real content (a core scaffold might only
  // ever show "Overview"). `state.readingSaintTab` remembers the active
  // tab across re-renders of the *same* saint (e.g. after a Your Layer
  // edit); openSaintReader() resets it when a *different* saint is opened.
  const tabs = [
    { id: "overview", label: "Overview", html: [identitySection, datesSection, lifeSection].filter(Boolean).join("") },
    { id: "story", label: "Story", html: narrativeSection },
    { id: "practice", label: "Daily practice", html: dailyPracticeSection },
    { id: "spirituality", label: "Spirituality", html: spiritualitySection },
    { id: "writings", label: "Writings", html: [writingsSection, aboutSection].filter(Boolean).join("") },
    { id: "cult", label: "Cult & devotion", html: cultSection },
    { id: "connections", label: "Connections", html: [connectionsSection, sourcesSection].filter(Boolean).join("") },
    { id: "map", label: "Map", html: mapSection },
  ].filter((t) => t.html);

  const activeTabId = tabs.some((t) => t.id === state.readingSaintTab) ? state.readingSaintTab : tabs[0] && tabs[0].id;

  const tabBar =
    tabs.length > 1
      ? `<div class="saint-tab-bar">${tabs.map((t) => `<button class="saint-tab-btn${t.id === activeTabId ? " active" : ""}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`).join("")}</div>`
      : "";
  const tabPanels = tabs
    .map((t) => `<div class="saint-tab-panel${t.id === activeTabId ? "" : " hidden"}" data-tab-panel="${t.id}">${t.html}</div>`)
    .join("");

  return [noteBlock, header, yourLayer, tabBar, tabPanels].filter(Boolean).join("");
}

function renderRelatedSaintsChips(slugs) {
  if (!slugs || slugs.length === 0) return "";
  const chips = slugs
    .filter((slug) => slug !== state.readingSaintSlug)
    .map((slug) => {
      const other = saintBySlug(slug);
      return other ? `<span class="chip related-saint-chip" data-slug="${slug}">${escapeHtml(other.name)}</span>` : "";
    })
    .filter(Boolean)
    .join("");
  return chips ? `<div class="saint-field"><span class="saint-field-label">See also</span></div><div class="chip-row">${chips}</div>` : "";
}

// window.SAINT_SOURCES (saints-data.js) holds the verification links
// actually consulted for each saint, keyed by slug — general reference
// pages, not a footnote per sentence. A saint with nothing here just
// hasn't been re-verified with a citable link yet; this renders nothing
// rather than a misleadingly empty "Sources" heading.
function renderSourcesSection(slug) {
  const sources = (window.SAINT_SOURCES && window.SAINT_SOURCES[slug]) || [];
  if (sources.length === 0) return "";
  const items = sources
    .map((src) => `<li><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.label)}</a></li>`)
    .join("");
  return section("Sources", `<ul class="saint-list saint-sources-list">${items}</ul>`);
}

function renderYourLayerBlock(s) {
  const personal = saintPersonal(s.slug);
  const statusChips = ["friend", "acquaintance", "tomeet", ""]
    .map(
      (st) =>
        `<span class="chip status-chip your-status-chip${personal.status === st ? " active" : ""}" data-status="${st}">${SAINT_STATUS_LABELS[st]}</span>`
    )
    .join("");

  const familiarityRows = FAMILIARITY_SECTIONS.map((sec) => {
    const val = (personal.familiarity && personal.familiarity[sec.key]) || 0;
    const dots = [0, 1, 2, 3, 4, 5]
      .map((n) => `<span class="familiarity-dot${n <= val ? " filled" : ""}${n === 0 ? " zero" : ""}" data-section="${sec.key}" data-value="${n}">${n === 0 ? "0" : "●"}</span>`)
      .join("");
    return `<div class="familiarity-row"><span class="familiarity-label">${escapeHtml(sec.label)}</span><span class="familiarity-dots">${dots}</span></div>`;
  }).join("");

  const studyLogHtml = (personal.studyLog || [])
    .slice(0, 8)
    .map((e) => `<div class="study-log-entry"><span class="study-log-date">${escapeHtml(e.date)}</span> ${escapeHtml(e.note)}</div>`)
    .join("");

  return `
  <div class="saint-your-layer">
    <div class="saint-section-title">Your layer</div>
    <div class="your-layer-block">
      <div class="saint-field-label">Relationship</div>
      <div class="chip-row">${statusChips}</div>
    </div>
    <div class="your-layer-block">
      <div class="saint-field-label">Familiarity</div>
      ${familiarityRows}
    </div>
    <div class="your-layer-block">
      <div class="saint-field-label">Your notes</div>
      <textarea id="saint-notes-field" class="text-input" placeholder="What you already know, what struck you, questions to follow up…">${escapeHtml(personal.notes)}</textarea>
    </div>
    <div class="your-layer-block">
      <div class="saint-field-label">Study log</div>
      <div class="study-log-add">
        <input id="saint-study-log-input" class="text-input" type="text" placeholder="What did you just read or learn?">
        <button id="btn-add-study-log" class="btn secondary">Add</button>
      </div>
      <div id="saint-study-log-list">${studyLogHtml}</div>
    </div>
  </div>`;
}

function wireSaintReaderInteractions(s) {
  const body = $("#saint-reader-body");
  $$(".your-status-chip", body).forEach((chip) =>
    chip.addEventListener("click", async () => {
      await saveSaintPersonal(s.slug, { status: chip.dataset.status });
      state.saintsPersonal = await getAllSaintsPersonal();
      openSaintReader(s.slug);
    })
  );
  $$(".familiarity-dot", body).forEach((dot) =>
    dot.addEventListener("click", async () => {
      const personal = saintPersonal(s.slug);
      const familiarity = Object.assign({}, personal.familiarity);
      familiarity[dot.dataset.section] = Number(dot.dataset.value);
      await saveSaintPersonal(s.slug, { familiarity });
      state.saintsPersonal = await getAllSaintsPersonal();
      openSaintReader(s.slug);
    })
  );
  const notesField = $("#saint-notes-field", body);
  if (notesField) {
    let notesTimer = null;
    notesField.addEventListener("input", () => {
      clearTimeout(notesTimer);
      notesTimer = setTimeout(async () => {
        await saveSaintPersonal(s.slug, { notes: notesField.value });
        state.saintsPersonal = await getAllSaintsPersonal();
      }, 600);
    });
  }
  const addLogBtn = $("#btn-add-study-log", body);
  if (addLogBtn) {
    addLogBtn.addEventListener("click", async () => {
      const input = $("#saint-study-log-input", body);
      const note = input.value.trim();
      if (!note) return;
      await addSaintStudyLogEntry(s.slug, note);
      state.saintsPersonal = await getAllSaintsPersonal();
      openSaintReader(s.slug);
    });
  }
  $$(".related-saint-chip", body).forEach((chip) => chip.addEventListener("click", () => openSaintReader(chip.dataset.slug)));
  $$(".saint-tab-btn", body).forEach((btn) =>
    btn.addEventListener("click", () => {
      state.readingSaintTab = btn.dataset.tab;
      $$(".saint-tab-btn", body).forEach((b) => b.classList.toggle("active", b === btn));
      $$(".saint-tab-panel", body).forEach((p) => p.classList.toggle("hidden", p.dataset.tabPanel !== btn.dataset.tab));
    })
  );
}

function openSaintReader(slug) {
  const s = saintBySlug(slug);
  if (!s) return;
  setHash("#/s/" + slug);
  if (state.readingSaintSlug !== slug) state.readingSaintTab = null; // switching to a different saint starts back at its first tab
  state.readingSaintSlug = slug;
  $("#saint-reader-body").innerHTML = renderSaintDossier(s);
  wireSaintReaderInteractions(s);
  initMapZoomPan($("#saint-reader-body")); // no-ops if this saint has no Map tab
  wireSaintMapStopLinking($("#saint-reader-body"));
  // Re-open the same saint to redraw the map in the other mode, keeping the
  // reader on the Map tab (state.readingSaintTab is preserved for the same slug).
  wireMapTilesToggle($("#saint-reader-body"), () => openSaintReader(slug));
  setView("saint-reader");
}

// --- Flashcards (SM-2-lite spaced repetition over each saint's `cards`) ---

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Collects every card that's due today or has never been studied. Pass a
// slug to scope to one saint (the reader's "Study cards" button), or null
// for the global "Study due cards" queue across every saint.
function collectDueCards(onlySlug) {
  const today = todayISO();
  const due = [];
  window.SAINTS.forEach((s) => {
    if (onlySlug && s.slug !== onlySlug) return;
    if (!s.cards || s.cards.length === 0) return;
    const personal = saintPersonal(s.slug);
    s.cards.forEach((card, i) => {
      const cardState = personal.cards && personal.cards[i];
      if (!cardState || !cardState.due || cardState.due <= today) {
        due.push({ slug: s.slug, name: s.name, cardIndex: i, card, cardState });
      }
    });
  });
  // Shuffle lightly so the same saint's cards don't always run in a block.
  for (let i = due.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [due[i], due[j]] = [due[j], due[i]];
  }
  return due;
}

function openFlashcards(onlySlug) {
  state.flashcardQueue = collectDueCards(onlySlug);
  state.flashcardPos = 0;
  state.flashcardShowingAnswer = false;
  setView("flashcards");
  renderFlashcard();
}

function renderFlashcard() {
  const queue = state.flashcardQueue;
  const empty = $("#flashcards-empty");
  const cardEl = $("#flashcard-card");
  if (queue.length === 0 || state.flashcardPos >= queue.length) {
    empty.classList.remove("hidden");
    cardEl.classList.add("hidden");
    $("#flashcards-progress").textContent = "";
    return;
  }
  empty.classList.add("hidden");
  cardEl.classList.remove("hidden");
  const item = queue[state.flashcardPos];
  $("#flashcards-progress").textContent = `${state.flashcardPos + 1} of ${queue.length}`;
  $("#flashcard-source").textContent = item.name;
  $("#flashcard-question").textContent = item.card.q;
  $("#flashcard-answer").textContent = item.card.a;
  $("#flashcard-answer").classList.add("hidden");
  $("#flashcard-rate").classList.add("hidden");
  $("#btn-flashcard-flip").classList.remove("hidden");
  state.flashcardShowingAnswer = false;
}

function flipFlashcard() {
  $("#flashcard-answer").classList.remove("hidden");
  $("#flashcard-rate").classList.remove("hidden");
  $("#btn-flashcard-flip").classList.add("hidden");
  state.flashcardShowingAnswer = true;
}

// A pared-down SM-2: quality buckets (again/hard/good/easy) map to the
// standard 0–5 grade scale, updating ease/interval/reps the usual way.
function scheduleSM2(prevState, quality) {
  let ease = (prevState && prevState.ease) || 2.5;
  let interval = (prevState && prevState.interval) || 0;
  let reps = (prevState && prevState.reps) || 0;
  const q = { again: 0, hard: 3, good: 4, easy: 5 }[quality];

  if (q < 3) {
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ease, interval, reps, due: addDaysISO(todayISO(), interval) };
}

async function rateFlashcard(quality) {
  const item = state.flashcardQueue[state.flashcardPos];
  if (!item) return;
  const nextState = scheduleSM2(item.cardState, quality);
  await saveSaintCardState(item.slug, item.cardIndex, nextState);
  state.saintsPersonal = await getAllSaintsPersonal();
  state.flashcardPos += 1;
  renderFlashcard();
  if (state.flashcardPos >= state.flashcardQueue.length) renderSaintsList();
}

// --- .ics calendar export (feast days as yearly recurring all-day events) ---

function icsEscape(text) {
  return String(text).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
}

function exportSaintsICS() {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Recollection//Saints//EN", "CALSCALE:GREGORIAN"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  window.SAINTS.forEach((s) => {
    if (!s.dates.feast) return; // e.g. Francisco de Osuna — no calendar entry, not canonized
    const [mm, dd] = s.dates.feast.split("-");
    const year = new Date().getFullYear();
    const dtstart = `${year}${mm}${dd}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:saint-${s.slug}@recollection.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `RRULE:FREQ=YEARLY`,
      `SUMMARY:${icsEscape(s.name + " — feast day")}`,
      `DESCRIPTION:${icsEscape(s.spirituality.charism || s.narrative.summary || "")}`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "saints-feast-days.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Flush a pending autosave if the user navigates away mid-debounce.
window.addEventListener("beforeunload", () => {
  if (writerDirty) autosaveJournalEntry();
});

// ---------------------------------------------------------------------------
//  Guided finder — "Find a prayer, hymn or quote"
//
//  A few narrowing questions instead of scrolling the whole library. The one
//  hard requirement is COVERAGE: every entry must stay reachable, no matter
//  how the collection grows.
//
//  That is guaranteed structurally rather than by hand-checking the buckets:
//
//    * At each step the visible options are computed from the entries actually
//      still in play, and any option that would match nothing is dropped.
//    * An entry goes into every option it matches, not just the first — the
//      Hail Mary is both a Marian prayer and one of the basics, and either
//      route should reach it. Option counts therefore sum to more than the
//      total, which is expected, not a bug.
//    * Whatever matches none of the named options is swept into an explicit
//      "Something else" option. So the union of the options always contains
//      the whole candidate set — nothing can fall between them.
//    * The last steps are generated from the entries' own tags, so newly added
//      prayers get their own routes without anyone editing this file.
//    * "Show these now" is available at every step, and the results list
//      appears automatically once the set is small.
//
//  Adding a prayer with unfamiliar tags therefore cannot orphan it: worst case
//  it arrives via "Something else".
// ---------------------------------------------------------------------------

const FINDER_RESULT_THRESHOLD = 8; // stop asking once the set is this small
const FINDER_MAX_TAG_STEPS = 3;

const finderState = {
  answers: [], // [{ stepLabel, optionLabel, ids }]
  showingAll: false,
};

const hasTag = (entry, names) =>
  entry.tags.some((t) => names.includes(t.toLowerCase()));

// Matches against the free-text fields too, so entries that carry their
// occasion in `liturgical`/`origin` rather than a tag are still routed.
const mentions = (entry, words) => {
  const hay = `${entry.liturgical || ""} ${entry.origin || ""} ${entry.source || ""}`.toLowerCase();
  return words.some((w) => hay.includes(w));
};

// Hand-drawn line icons for the finder, one visual family on a 24px grid.
// Emoji were the first attempt and read as borrowed — they come from different
// design languages and render differently on each platform. These inherit
// currentColor, so they follow whichever palette is set, and stay sharp at any
// size for a few hundred bytes each.
const ICON = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const FINDER_ICONS = {
  candle: ICON('<path d="M12 3.2c1.2 1.5 1.8 2.5 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-.9.6-1.9 1.8-3.4Z"/><path d="M9.6 10.6h4.8V20a1 1 0 0 1-1 1h-2.8a1 1 0 0 1-1-1Z"/>'),
  moon: ICON('<path d="M20 14.4A8 8 0 1 1 9.6 4a6.5 6.5 0 0 0 10.4 10.4Z"/>'),
  star: ICON('<path d="m12 3.2 2.6 5.5 6 .8-4.3 4.2 1 6-5.3-2.8L6.7 19.7l1-6L3.4 9.5l6-.8Z"/>'),
  heart: ICON('<path d="M12 20.3s-7-4.5-7-9.1A3.9 3.9 0 0 1 12 8.6a3.9 3.9 0 0 1 7 2.6c0 4.6-7 9.1-7 9.1Z"/>'),
  lily: ICON('<path d="M12 21V10.2"/><path d="M12 10.2C9.3 10.2 7 8.4 7 5.9c2.8 0 5 1.9 5 4.3Z"/><path d="M12 10.2c2.7 0 5-1.8 5-4.3-2.8 0-5 1.9-5 4.3Z"/><path d="M12 10.2c0-2.4.9-4.3 0-6-.9 1.7-.9 3.6 0 6Z"/>'),
  chalice: ICON('<path d="M7 4h10c0 4-2.2 6.6-5 6.6S7 8 7 4Z"/><path d="M12 10.6V19"/><path d="M8 20.2h8"/>'),
  cross: ICON('<path d="M12 3v18"/><path d="M6.2 8.4h11.6"/>'),
  clock: ICON('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.1 2"/>'),
  tear: ICON('<path d="M12 3.4c3.2 4.1 5.4 6.7 5.4 9.5a5.4 5.4 0 0 1-10.8 0c0-2.8 2.2-5.4 5.4-9.5Z"/>'),
  leaf: ICON('<path d="M19.8 4.2C10.4 4.2 4.6 9 4.6 14.7A5 5 0 0 0 9.4 19.7c5.9 0 10.4-6 10.4-15.5Z"/><path d="M5 19.6C8.6 14.2 12.4 11.2 17 9.4"/>'),
  anchor: ICON('<circle cx="12" cy="5.4" r="2"/><path d="M12 7.4V21"/><path d="M7.4 11h9.2"/><path d="M4.4 15.2c0 3.6 3.4 5.6 7.6 5.6s7.6-2 7.6-5.6"/>'),
  sprout: ICON('<path d="M12 21v-6.8"/><path d="M12 14.2c-3.7 0-5.8-2.4-5.8-5.8 3.4 0 5.8 2 5.8 5.8Z"/><path d="M12 14.2c2.9 0 4.8-2 4.8-4.8-2.9 0-4.8 2-4.8 4.8Z"/>'),
  compass: ICON('<circle cx="12" cy="12" r="8.4"/><path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5Z"/>'),
  book: ICON('<path d="M4 4.8h5.4A2.6 2.6 0 0 1 12 7.4V20a2.6 2.6 0 0 0-2.6-1.8H4Z"/><path d="M20 4.8h-5.4A2.6 2.6 0 0 0 12 7.4V20a2.6 2.6 0 0 1 2.6-1.8H20Z"/>'),
  hands: ICON('<path d="M12 21V8.4"/><path d="M12 8.4c0-3 1.4-5 3-5.6.8 2 .4 4.6-1.1 6.6"/><path d="M12 8.4c0-3-1.4-5-3-5.6-.8 2-.4 4.6 1.1 6.6"/><path d="M8.4 21h7.2"/>'),
  repeat: ICON('<path d="M4.4 8.6h12.2a3 3 0 0 1 3 3"/><path d="m13.8 5.4 3.2 3.2-3.2 3.2"/><path d="M19.6 15.4H7.4a3 3 0 0 1-3-3"/><path d="m10.2 18.6-3.2-3.2 3.2-3.2"/>'),
  note: ICON('<path d="M9.4 17.6V5.8l8.8-2v11.6"/><circle cx="7" cy="17.8" r="2.4"/><circle cx="15.8" cy="15.6" r="2.4"/>'),
  staff: ICON('<path d="M3.4 6.6h17.2"/><path d="M3.4 11h17.2"/><path d="M3.4 15.4h17.2"/><circle cx="8.6" cy="15.4" r="2.1"/><path d="M10.7 15.4V8"/>'),
  quote: ICON('<path d="M9.4 6.8C6.9 6.8 5.2 8.6 5.2 11s1.7 3.6 3.6 3.6c-.1 2-1.2 3.3-2.8 4.2"/><path d="M18.8 6.8c-2.5 0-4.2 1.8-4.2 4.2s1.7 3.6 3.6 3.6c-.1 2-1.2 3.3-2.8 4.2"/>'),
  question: ICON('<circle cx="12" cy="12" r="8.4"/><path d="M9.7 9.4A2.4 2.4 0 0 1 14.4 10c0 1.7-2.4 2-2.4 3.7"/><path d="M12 17.1h.01"/>'),
  dot: ICON('<circle cx="12" cy="12" r="3"/>'),
};

// Fixed opening steps. Each option is {label, hint, match}. Order matters:
// an entry lands in the first option it matches.
const FINDER_STEPS = [
  {
    label: "Occasion",
    question: "What is it for?",
    options: [
      {
        label: "To aid with prayer", icon: "candle",
        hint: "Beginning, settling, giving thanks at the end",
        keywords: ["before prayer", "after prayer", "preparation", "thanksgiving", "contemplation", "opus dei", "prayer", "mental prayer", "meditation"],
        match: (e) =>
          hasTag(e, [
            "before prayer", "after prayer", "preparation", "thanksgiving",
            "contemplation", "opus dei", "prayer", "mental prayer", "meditation",
          ]) || mentions(e, ["before mental prayer", "after mental prayer", "before prayer"]),
      },
      {
        label: "Contemplative", icon: "moon",
        hint: "Short, quiet, meant to be dwelt on",
        keywords: ["contemplation", "holy spirit", "adoration", "surrender", "self-offering", "silence", "trust"],
        match: (e) =>
          hasTag(e, [
            "contemplation", "holy spirit", "adoration", "surrender",
            "self-offering", "poem", "silence", "trust",
          ]),
      },
      {
        // "Everyone knows" has to be literally true or the label lies. The
        // Acts of Faith, Hope and Charity are tagged foundational and are
        // genuinely basic, but they're catechism prayers rather than ones
        // learned by heart in childhood — so they're excluded here and get
        // their own option below.
        label: "The prayers everyone knows", icon: "star",
        hint: "The basic ones, learned by heart",
        match: (e) =>
          hasTag(e, ["foundational", "creed", "doxology"]) && !hasTag(e, ["catechetical"]),
      },
      {
        label: "Acts of faith, hope and love", icon: "heart",
        hint: "The three theological virtues, said as acts",
        keywords: ["faith", "hope", "charity"],
        match: (e) => hasTag(e, ["catechetical"]) && /^Act of /i.test(e.title || ""),
      },
      {
        // Ahead of "the hours of the day" on purpose: the four seasonal
        // antiphons belong to Our Lady first, even though they are sung at
        // Compline. The hours option no longer claims them.
        label: "To Our Lady", icon: "lily",
        hint: "Marian prayers and the seasonal antiphons",
        keywords: ["marian", "our lady", "mary", "blessed virgin"],
        match: (e) => hasTag(e, ["marian", "antiphon"]) || mentions(e, ["marian"]),
      },
      {
        label: "Mass and Communion", icon: "chalice",
        hint: "Before, during, after — and Adoration",
        keywords: ["mass", "eucharist", "communion", "adoration", "benediction", "corpus christi"],
        match: (e) =>
          hasTag(e, ["mass", "eucharist", "communion", "adoration", "benediction", "corpus christi"]) ||
          mentions(e, ["mass", "communion", "adoration", "benediction", "blessed sacrament"]),
      },
      {
        // The collection had no way to ask for Passion devotions at all —
        // the Seven Last Words, Five Wounds and Litany of the Sacred Heart
        // were unreachable through this tree before this option existed.
        label: "The Passion and the Cross", icon: "cross",
        hint: "The Cross, the Wounds, the Sacred Heart, Our Lady of Sorrows",
        keywords: ["passion", "cross", "sacred heart", "precious blood", "sorrow", "reparation", "crucifix"],
        match: (e) =>
          hasTag(e, [
            "passion", "cross", "good friday", "sacred heart", "precious blood",
            "sorrow", "reparation", "way of the cross", "holy week",
          ]) || mentions(e, ["crucifix", "the cross", "calvary", "passion"]),
      },
      {
        label: "The hours of the day", icon: "clock",
        hint: "Morning, evening, night prayer",
        // Deliberately does NOT match "antiphon"/"Compline" — see above.
        match: (e) => hasTag(e, ["morning", "noon", "evening", "daily", "night"]),
      },
      {
        label: "Confession and repentance", icon: "tear",
        hint: "Examining conscience, sorrow, conversion",
        keywords: ["confession", "penance", "repentance", "conversion", "reconciliation"],
        match: (e) =>
          hasTag(e, ["confession", "penance", "repentance", "self-examination", "conversion", "fasting"]) ||
          mentions(e, ["confession", "conscience", "reconciliation", "penance"]),
      },
      {
        label: "A season of the year", icon: "leaf",
        hint: "Advent, Christmas, Lent, Easter",
        keywords: ["advent", "christmas", "lent", "easter"],
        match: (e) =>
          hasTag(e, ["advent", "christmas", "nativity", "lent", "easter", "incarnation"]) ||
          mentions(e, ["advent", "christmas", "lent", "easter", "pentecost", "candlemas", "holy week"]),
      },
      {
        label: "When things are hard", icon: "anchor",
        hint: "Anxiety, suffering, fear, protection",
        keywords: ["anxiety", "suffering", "death", "courage", "protection", "fear", "peace", "hope", "perseverance", "illness", "sickness"],
        match: (e) =>
          hasTag(e, [
            "anxiety", "suffering", "death", "courage", "protection", "exorcism",
            "peace", "hope", "trust", "perseverance", "guardian angel",
          ]),
      },
      {
        label: "To grow in virtue", icon: "sprout",
        hint: "Humility, charity, purity, surrender",
        keywords: ["humility", "charity", "love", "purity", "chastity", "joy", "faithfulness", "surrender"],
        match: (e) =>
          hasTag(e, [
            "humility", "charity", "love", "purity", "chastity", "zeal", "joy",
            "faithfulness", "surrender", "self-offering", "little way", "work",
          ]),
      },
      {
        // Nothing in the tree asked about state of life, so the spouse and
        // discernment entries had no route to them.
        label: "Vocation and state of life", icon: "compass",
        hint: "Discernment, marriage, singleness, work",
        keywords: ["vocation", "discernment", "marriage", "spouses", "singleness", "widows", "students", "work"],
        match: (e) =>
          hasTag(e, [
            "vocation", "discernment", "marriage", "spouse", "singleness",
            "waiting", "work", "identity",
          ]),
      },
      {
        label: "The faith itself", icon: "book",
        hint: "Creeds, doctrine, the Trinity",
        keywords: ["trinity", "faith", "holy spirit", "theologians", "converts"],
        match: (e) =>
          hasTag(e, [
            "creed", "catechetical", "trinity", "faith", "doxology", "biblical",
            "holy spirit", "intercession", "communion of saints", "approved",
            "holy name", "jesus", "messianic titles",
          ]),
      },
    ],
  },
  {
    label: "Kind",
    question: "What are you looking for?",
    options: [
      { label: "A prayer", icon: "hands", hint: "Something to pray", match: (e) => e.kind === "prayer" },
      { label: "A litany", icon: "repeat", hint: "Call and response", match: (e) => e.kind === "litany" },
      { label: "A hymn", icon: "note", hint: "Something sung", match: (e) => e.kind === "hymn" },
      {
        label: "An antiphon", icon: "staff",
        hint: "The seasonal chants — Compline, Advent",
        match: (e) => e.kind === "antiphon",
      },
      { label: "Words to sit with", icon: "quote", hint: "A quote to dwell on", match: (e) => e.kind === "quote" },
      {
        label: "Something to learn", icon: "book",
        hint: "A list to know by heart and examine yourself on",
        match: (e) => e.kind === "teaching",
      },
      // No "saint" option: saints live in their own tab, and the Library has
      // never held one. If a legacy entry does, the catch-all still routes it.
    ],
  },

];

// Later steps are generated from whatever tags the remaining entries carry, so
// the tree deepens on its own as the collection grows.
function dynamicTagStep(candidates, usedTags) {
  const counts = new Map();
  candidates.forEach((e) =>
    e.tags.forEach((t) => {
      const key = t.toLowerCase();
      if (usedTags.has(key)) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    })
  );

  // A tag only makes a useful question if it splits the set — it must not
  // cover everything, and must cover more than one entry.
  const useful = [...counts.entries()]
    .filter(([, n]) => n > 1 && n < candidates.length)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (useful.length < 2) return null;

  return {
    label: "Theme",
    question: "Anything more particular?",
    options: useful.map(([tag]) => ({
      label: tag.charAt(0).toUpperCase() + tag.slice(1),
      hint: "",
      keywords: [tag],
      match: (e) => e.tags.some((t) => t.toLowerCase() === tag),
      tag,
    })),
  };
}

// Builds the step to show for the current candidate set, with the coverage
// sweep applied. Returns null when there is nothing useful left to ask.
function buildFinderStep(candidates) {
  const depth = finderState.answers.length;
  const usedTags = new Set(
    finderState.answers.flatMap((a) => (a.tag ? [a.tag] : []))
  );

  let step =
    depth < FINDER_STEPS.length
      ? FINDER_STEPS[depth]
      : depth < FINDER_STEPS.length + FINDER_MAX_TAG_STEPS
      ? dynamicTagStep(candidates, usedTags)
      : null;

  if (!step) return null;

  // A candidate goes into EVERY option it matches, not just the first. The
  // Hail Mary is both a Marian prayer and one of the basics; someone looking
  // for either should find it. So several routes can lead to the same entry,
  // and the option counts deliberately sum to more than the total.
  const buckets = step.options.map((opt) => ({ ...opt, ids: [] }));
  const leftovers = [];

  candidates.forEach((e) => {
    let matched = false;
    buckets.forEach((b) => {
      if (b.match(e)) {
        b.ids.push(e.id);
        matched = true;
      }
    });
    if (!matched) leftovers.push(e.id);
  });

  const shown = buckets.filter((b) => b.ids.length > 0);

  // The sweep: anything matching no option at all still gets a door. This is
  // what makes coverage total — union(options) always contains every
  // candidate, even though the options now overlap.
  if (leftovers.length > 0) {
    shown.push({
      label: "Something else",
      icon: "question",
      hint: "Everything not covered above",
      ids: leftovers,
      isCatchAll: true,
    });
  }

  // A question with one answer isn't a question — skip to the next one.
  if (shown.length < 2) return null;

  return { ...step, options: shown };
}

const FINDER_SAINTS_LIMIT = 4;

// Reuses the finder's own occasion keywords (declared inline on each option
// above, plus whatever a dynamic Theme step contributes) to also surface a
// matching saint or two — the same need that points you to a prayer often
// has a patron who lived it. Deliberately a separate pass rather than
// folding saints into buildFinderStep()'s candidate-narrowing: a saint
// isn't a Library entry, and forcing the two shapes through one matcher
// would complicate the coverage guarantee that function exists to keep.
function matchingSaintsForKeywords(keywords) {
  if (!keywords || keywords.length === 0) return [];
  const words = keywords.map((k) => k.toLowerCase());
  return (window.SAINTS || [])
    .map((s) => {
      const patronText = (s.cult.patronages || [])
        .flatMap((p) => [p.of, p.why])
        .concat(s.cult.invokedAgainst || [])
        .join(" · ")
        .toLowerCase();
      const score = words.reduce((n, w) => n + (patronText.includes(w) ? 1 : 0), 0);
      return { saint: s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, FINDER_SAINTS_LIMIT)
    .map((x) => x.saint);
}

function finderCandidates() {
  const last = finderState.answers[finderState.answers.length - 1];
  if (!last) return state.libraryEntries.slice();
  const ids = new Set(last.ids);
  return state.libraryEntries.filter((e) => ids.has(e.id));
}

function openFinder() {
  state.finderRestrict = null;
  finderState.answers = [];
  finderState.showingAll = false;
  setView("finder");
  renderFinder();
}

function renderFinder() {
  const candidates = finderCandidates();

  // Breadcrumbs — each is clickable to rewind to that point.
  const crumbs = $("#finder-crumbs");
  crumbs.innerHTML = finderState.answers
    .map(
      (a, i) =>
        `<button class="finder-crumb" data-step="${i}" title="Change this answer">` +
        `<span class="crumb-step">${escapeHtml(a.stepLabel)}</span>` +
        `<span class="crumb-value">${escapeHtml(a.optionLabel)}</span>` +
        `<span class="crumb-change">change</span></button>`
    )
    .join(`<span class="finder-crumb-sep">›</span>`);
  crumbs.classList.toggle("hidden", finderState.answers.length === 0);
  $$(".finder-crumb", crumbs).forEach((btn) => {
    btn.addEventListener("click", () => {
      finderState.answers = finderState.answers.slice(0, Number(btn.dataset.step));
      finderState.showingAll = false;
      renderFinder();
    });
  });

  // A saint or two matching the same need. The occasion step now comes
  // first, so this can populate from the very first answer.
  const saintsPanel = $("#finder-saints");
  const keywords = [...new Set(finderState.answers.flatMap((a) => a.keywords || []))];
  const matchingSaints = matchingSaintsForKeywords(keywords);
  if (matchingSaints.length === 0) {
    saintsPanel.classList.add("hidden");
    saintsPanel.innerHTML = "";
  } else {
    saintsPanel.classList.remove("hidden");
    saintsPanel.innerHTML =
      `<span class="finder-saints-label">A saint for this too —</span>` +
      matchingSaints
        .map((s) => `<span class="chip related-saint-chip" data-slug="${s.slug}">${escapeHtml(s.name)}</span>`)
        .join("");
    $$(".related-saint-chip", saintsPanel).forEach((chip) =>
      chip.addEventListener("click", () => openSaintReader(chip.dataset.slug))
    );
  }

  const step = finderState.showingAll ? null : buildFinderStep(candidates);
  const done = !step || candidates.length <= FINDER_RESULT_THRESHOLD;

  $("#finder-question-block").classList.toggle("hidden", done);
  $("#finder-count").textContent =
    candidates.length === 1 ? "1 entry" : `${candidates.length} entries`;
  $("#btn-finder-showall").classList.toggle("hidden", done);

  if (!done) {
    $("#finder-question").textContent = step.question;
    $("#finder-options").innerHTML = step.options
      .map(
        (opt, i) => `
        <button class="finder-option${opt.isCatchAll ? " catch-all" : ""}" data-opt="${i}">
          <span class="finder-option-icon">${FINDER_ICONS[opt.icon] || FINDER_ICONS.dot}</span>
          <span class="finder-option-label">${escapeHtml(opt.label)}</span>
          ${opt.hint ? `<span class="finder-option-hint">${escapeHtml(opt.hint)}</span>` : ""}
          <span class="finder-option-count">${opt.ids.length}</span>
        </button>`
      )
      .join("");
    $$(".finder-option", $("#finder-options")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const opt = step.options[Number(btn.dataset.opt)];
        finderState.answers.push({
          stepLabel: step.label,
          optionLabel: opt.label,
          ids: opt.ids,
          tag: opt.tag,
          keywords: opt.keywords,
        });
        renderFinder();
      });
    });
    $("#finder-results").innerHTML = "";
    return;
  }

  // Results.
  const results = $("#finder-results");
  if (candidates.length === 0) {
    results.innerHTML = `<div class="empty-state">Nothing here — step back and try another answer.</div>`;
    return;
  }
  results.innerHTML =
    `<p class="finder-results-head">${
      candidates.length === 1 ? "This one:" : "Any of these:"
    }</p>` +
    sortLibraryEntries(candidates)
      .map(
        (e) => `
      <div class="entry-card" data-id="${e.id}">
        <div class="title">${escapeHtml(e.title)}${e.favorite ? " ★" : ""}</div>
        ${e.author ? `<div class="byline">— ${escapeHtml(e.author)}</div>` : ""}
        <div class="meta">
          <span class="badge-kind">${e.kind}</span>
          ${e.source ? `<span>${escapeHtml(e.source)}</span>` : ""}
        </div>
      </div>`
      )
      .join("");
  $$(".entry-card", results).forEach((card) => {
    card.addEventListener("click", () => {
      state.readerCameFromFinder = true;
      openLibraryReader(card.dataset.id);
    });
  });
}

// --- This hour's prayer, at the top of the Library --------------------------
//
// The 24 hourly prayers are only useful if the right one meets you without
// being looked up. This surfaces the current one above the library list — the
// same idea as the Saints tab's "today is the feast of" banner — and tapping
// it opens the full entry already on that hour.

function currentHourlyPrayer() {
  const entry = state.libraryEntries.find(
    (e) => e.tags && e.tags.some((t) => t.toLowerCase() === "hourly")
  );
  if (!entry) return null;
  const cached = state.libraryBodyFull && state.libraryBodyFull[entry.id];
  const parts = splitNumberedParts(cached || "");
  if (parts.length !== 24) return null;
  const hour = new Date().getHours();
  return { entry, part: parts[hour], hour };
}

async function renderHourBanner() {
  const banner = $("#library-hour-banner");
  if (!banner) return;

  const entry = state.libraryEntries.find(
    (e) => e.tags && e.tags.some((t) => t.toLowerCase() === "hourly")
  );
  if (!entry) {
    banner.classList.add("hidden");
    return;
  }

  // The list view only holds metadata, so fetch the body once and cache it.
  state.libraryBodyFull = state.libraryBodyFull || {};
  if (!state.libraryBodyFull[entry.id]) {
    const { body } = await getLibraryEntryText(entry.id);
    state.libraryBodyFull[entry.id] = body;
  }

  const current = currentHourlyPrayer();
  if (!current) {
    banner.classList.add("hidden");
    return;
  }

  const clock = `${String(current.hour).padStart(2, "0")}:00`;
  banner.innerHTML =
    `<span class="todays-saint-label">This hour · ${clock}</span>` +
    `<span class="hour-banner-text">${escapeHtml(current.part.text)}</span>` +
    `<span class="hour-banner-more">${escapeHtml(entry.title)} — ${current.part.n} of 24 ›</span>`;
  banner.classList.remove("hidden");

  banner.onclick = () => {
    state.pendingReaderPart = current.hour;
    openLibraryReader(entry.id);
  };
}

// Re-render on the hour so the banner never shows a stale prayer.
setInterval(() => {
  if (state.view === "library") renderHourBanner();
}, 60 * 1000);

// --- Palette picker --------------------------------------------------------
//
// Colours are entirely CSS custom properties (see "Palettes" in styles.css),
// so switching is one attribute on <html>. The choice is remembered per
// browser, and index.html applies it before first paint so the default never
// flashes first.

const PALETTE_KEY = "recollection.palette.v1";
const DEFAULT_PALETTE = "candlelight";

function currentPalette() {
  return document.documentElement.getAttribute("data-palette") || DEFAULT_PALETTE;
}

function applyPalette(name) {
  document.documentElement.setAttribute("data-palette", name);
  try {
    localStorage.setItem(PALETTE_KEY, name);
  } catch {
    /* storage blocked — the choice just won't survive the session */
  }
  // Keep the browser/PWA chrome in step with the page it sits above.
  const ground = getComputedStyle(document.documentElement)
    .getPropertyValue("--ground")
    .trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && ground) meta.setAttribute("content", ground);
  markPaletteChoice();
}

function markPaletteChoice() {
  const active = currentPalette();
  document.querySelectorAll(".palette-option").forEach((btn) => {
    const on = btn.dataset.palette === active;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  });
}

function initPalette() {
  // No stored choice yet — settle on the default explicitly so the attribute
  // is always present and the picker has something to highlight.
  if (!document.documentElement.getAttribute("data-palette")) {
    document.documentElement.setAttribute("data-palette", DEFAULT_PALETTE);
  }
  markPaletteChoice();

  const menu = $("#palette-menu");
  const btn = $("#btn-palette");
  const close = () => {
    menu.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("hidden");
    btn.setAttribute("aria-expanded", open ? "false" : "true");
  });

  document.querySelectorAll(".palette-option").forEach((opt) =>
    opt.addEventListener("click", () => {
      applyPalette(opt.dataset.palette);
      close();
    })
  );

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && e.target !== btn) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}
