const state = {
  view: "signin", // signin | library | journal
  libraryEntries: [],
  journalEntries: [],
  filterKind: "all",
  filterTags: new Set(), // multiple tags AND'd together to narrow results fast
  filterAuthor: null, // one active author at a time — click a byline to toggle
  filterOrigin: null, // one active origin/tradition at a time
  filterLiturgical: null, // one active liturgical season/use at a time
  filterFavoritesOnly: false,
  filterBilingualOnly: false,
  searchQuery: "",
  sortBy: "recent", // recent | title | kind
  libraryBodyIndex: {}, // id -> lowercased "body \n background \n latinBody", built lazily for full-text search
  readingLibraryId: null, // set while the library reader is open
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
function renderTextBlock(text) {
  return (text || "")
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p class="reader-para">${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
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

window.addEventListener("DOMContentLoaded", () => {
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
  $("#btn-filters-done").addEventListener("click", () => setView("library"));
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

  $("#btn-reader-back").addEventListener("click", () => setView("library"));
  $("#btn-reader-edit").addEventListener("click", () => openLibraryEditor(state.readingLibraryId));

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

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});

async function onSignedIn() {
  $("#view-signin").classList.remove("active");
  $("#app-shell").classList.add("active");
  await seedDefaultsIfEmpty();
  await dedupeLibraryByTitle();
  await Promise.all([refreshLibrary(), refreshJournal(), refreshSaints()]);
  setView("library");
}

// Real starter entries so the Library isn't empty on first launch. Each is
// matched by title+kind and backfilled in place if it was already saved by
// an earlier version of this app missing the newer fields — so re-running
// this is always safe, never duplicates.
const SEED_LIBRARY_ENTRIES = [
  {
    title: "Morning Offering",
    kind: "prayer",
    tags: ["morning", "daily"],
    source: "Traditional — Apostleship of Prayer",
    author: "Fr. François-Xavier Gautrelet, S.J.",
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
    tags: ["Incarnation", "Marian", "morning", "noon", "evening"],
    source: "Traditional Catholic prayer, prayed at 6am, noon, and 6pm",
    author: "Traditional / Anonymous",
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
      "Compar sit laudatio.",
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
      "Might, and endless majesty.",
    background:
      "The last two verses of Pange Lingua Gloriosi Corporis Mysterium, a longer " +
      "processional hymn St. Thomas Aquinas composed around 1264 for the newly " +
      "established Feast of Corpus Christi, at Pope Urban IV's request. These " +
      "closing verses broke off to become their own devotional unit, sung or " +
      "recited at Benediction and Eucharistic Adoration — the moment the priest " +
      "incenses the Host, right before the blessing. The English here is Fr. " +
      "Edward Caswall's 19th-century translation, 'Down in Adoration Falling,' " +
      "the version most commonly sung in English-speaking parishes today. It's " +
      "traditionally followed by a versicle, response, and closing collect, not " +
      "included here.",
  },
  {
    title: "Panis Angelicus",
    kind: "hymn",
    tags: ["eucharist", "Corpus Christi"],
    source: "Penultimate stanza of Sacris Solemniis; famously set to music separately by César Franck (1872)",
    author: "St. Thomas Aquinas, O.P.",
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
    author: "Traditional / Anonymous",
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
    author: "Traditional / Anonymous",
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
    kind: "prayer",
    tags: ["Marian", "Compline", "antiphon"],
    source: "One of the four seasonal Marian antiphons sung/recited at the close of Compline",
    author: "Bl. Hermann of Reichenau, O.S.B.",
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
    kind: "prayer",
    tags: ["Marian", "Compline", "antiphon", "Advent"],
    source: "One of the four seasonal Marian antiphons sung/recited at the close of Compline",
    author: "Bl. Hermann of Reichenau, O.S.B.",
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
    kind: "prayer",
    tags: ["Marian", "Compline", "antiphon", "Lent"],
    source: "One of the four seasonal Marian antiphons sung/recited at the close of Compline",
    author: "Traditional / Anonymous",
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
    kind: "prayer",
    tags: ["Marian", "Compline", "antiphon", "Easter"],
    source: "One of the four seasonal Marian antiphons; also replaces the Angelus during the Easter season",
    author: "Traditional / Anonymous",
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
    author: "Traditional / Anonymous",
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
    author: "Traditional / Anonymous",
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
    author: "Traditional / Anonymous",
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
    author: "Traditional / Anonymous",
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
    author: "Traditional / Anonymous",
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
    author: "Traditional / Anonymous",
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
    author: "Traditional / Anonymous",
    authorNote: "popularized through catechisms",
    year: "Common English wording widespread by the 19th century",
    origin: "Devotion to the Guardian Angels",
    liturgical: "",
    feastDay: "October 2 (Feast of the Guardian Angels)",
    originalLanguage: "",
    favorite: false,
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
    author: "Traditional / Anonymous",
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
    tags: ["Marian", "intercession"],
    source: "Manuscript tradition traces to Nicolas Salicetus's Antidotarius animae (1489)",
    author: "Traditional / Anonymous",
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
    kind: "quote",
    tags: ["trust", "Divine Mercy"],
    source: "Diariusz — Divine Mercy in My Soul (her Diary)",
    author: "St. Faustina Kowalska",
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
      "From the same body of conferences as 'Humility Is Nothing But Truth,' above. The logic here is " +
      "specifically about pride as the devil's own native weapon — since humility is the one thing pride " +
      "cannot counterfeit or turn to its own use, Vincent treats it as uniquely disarming rather than " +
      "merely virtuous.",
  },
  {
    title: "Suffering Accepted Produces a Good Crop",
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
    kind: "quote",
    tags: ["perseverance"],
    source: "The Way",
    author: "St. Josemaría Escrivá",
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
    kind: "quote",
    tags: ["love", "little way"],
    source: "Story of a Soul",
    author: "St. Thérèse of Lisieux",
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
    kind: "quote",
    tags: ["courage"],
    source: "First homily as Pope, St. Peter's Square, 22 October 1978",
    author: "St. John Paul II",
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
    kind: "quote",
    tags: ["little way"],
    source: "Story of a Soul",
    author: "St. Thérèse of Lisieux",
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
    kind: "quote",
    tags: ["little way"],
    source: "The Way, no. 815",
    author: "St. Josemaría Escrivá",
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
    kind: "quote",
    tags: ["zeal"],
    source: "Letter 368, to Stefano di Corrado Maconi",
    author: "St. Catherine of Siena",
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
    kind: "quote",
    tags: ["zeal"],
    source: "Address at World Youth Day, Rome, 2000 — explicitly given there as a paraphrase of St. Catherine of Siena",
    author: "St. John Paul II",
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
    title: "To Know That You Died for Him",
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
    kind: "quote",
    tags: ["prayer"],
    source: "The Great Means of Salvation and of Perfection",
    author: "St. Alphonsus Liguori",
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
    kind: "quote",
    tags: ["love"],
    source: "Popular paraphrase of a line from On Loving God (De Diligendo Deo), ch. 1, c. 1132–1135",
    author: "St. Bernard of Clairvaux",
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
    kind: "quote",
    tags: ["Holy Spirit", "prayer"],
    source: "Widely attested in compilations of his catechetical sermons; no primary manuscript pinned",
    author: "St. John Vianney",
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
    kind: "quote",
    tags: ["morning", "prayer"],
    source: "Widely attested in compilations of his sayings; no primary manuscript pinned",
    author: "St. John Vianney",
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
];

async function seedDefaultsIfEmpty() {
  const existing = await listLibrary();
  for (const seed of SEED_LIBRARY_ENTRIES) {
    // Match by title alone (not title+kind) — a later fix to a seed entry's
    // kind must still be recognized as the same entry, or it re-inserts a
    // duplicate under the new kind instead of updating the existing one.
    const already = existing.find((e) => e.title === seed.title);
    if (already && already.author) continue; // already fully seeded, nothing to do
    await saveLibraryEntry({ ...seed, id: already ? already.id : null });
  }
}

// One-time safety net: cleans up exact-title duplicates that the matching
// bug above could have already created (e.g. one "quote" copy and one
// "prayer" copy of the same entry, from a kind correction made before the
// fix). Keeps whichever copy matches the current seed definition's kind.
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
  if (view === "library" || view === "journal" || view === "saints") {
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
  }
}

function switchTab(tab) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  $$(".tabpanel").forEach((p) => p.classList.toggle("active", p.dataset.tab === tab));
}

// --- Library ---

async function refreshLibrary() {
  state.libraryEntries = await listLibrary();
  renderLibraryList();
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

function renderTagChipRow() {
  const row = $("#tag-chip-row");
  row.innerHTML = allTags(state.libraryEntries)
    .map(
      (t) =>
        `<span class="chip tag-select-chip${state.filterTags.has(t) ? " active" : ""}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`
    )
    .join("");
  $$(".tag-select-chip", row).forEach((chip) => chip.addEventListener("click", () => toggleTagFilter(chip.dataset.tag)));
}

function renderOriginChipRow() {
  const row = $("#filter-origin-row");
  const origins = allOrigins(state.libraryEntries);
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
  const seasons = allLiturgical(state.libraryEntries);
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
  const authors = allAuthors(state.libraryEntries);
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
    state.filterKind !== "all" ||
    state.filterTags.size > 0 ||
    state.filterAuthor ||
    state.filterOrigin ||
    state.filterLiturgical ||
    state.filterFavoritesOnly ||
    state.filterBilingualOnly;
  $("#btn-clear-tag-filter").classList.toggle("hidden", !hasAnyFilter);

  let entries = state.libraryEntries.filter((e) => {
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
  renderActiveFilterChips();
  updateFilterBadge();

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
        e.author
          ? `<div class="byline${state.filterAuthor === e.author ? " active" : ""}" data-author="${escapeHtml(e.author)}">— ${escapeHtml(e.author)}</div>`
          : ""
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
  $$(".byline", list).forEach((byline) => {
    byline.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleAuthorFilter(byline.dataset.author);
    });
  });
}

const KIND_LABELS = { prayer: "Prayer", hymn: "Hymn", litany: "Litany", saint: "Saint", quote: "Quote" };

function updateFeastDayVisibility() {
  $("#lib-feast-day-field").classList.toggle("hidden", $("#lib-kind").value !== "saint");
}

async function openLibraryReader(id) {
  state.readingLibraryId = id;
  const entry = state.libraryEntries.find((e) => e.id === id);

  $("#reader-kind").textContent = (KIND_LABELS[entry.kind] || entry.kind) + (entry.favorite ? " · ★ Favourite" : "");
  $("#reader-title").textContent = entry.title;

  const attrParts = [];
  if (entry.author) {
    let authorHtml = `<span class="reader-author-link" data-author="${escapeHtml(entry.author)}">${escapeHtml(entry.author)}</span>`;
    if (entry.authorNote) authorHtml += `<span class="reader-author-note"> (${escapeHtml(entry.authorNote)})</span>`;
    attrParts.push(authorHtml);
  }
  if (entry.year) attrParts.push(escapeHtml(entry.year));
  if (entry.origin) attrParts.push(escapeHtml(entry.origin));
  if (entry.feastDay) attrParts.push("Feast: " + escapeHtml(entry.feastDay));
  if (entry.liturgical) attrParts.push("Used: " + escapeHtml(entry.liturgical));
  $("#reader-attribution").innerHTML = attrParts.join('<span class="dot">·</span>');
  const authorLink = $(".reader-author-link", $("#reader-attribution"));
  if (authorLink) {
    authorLink.addEventListener("click", () => {
      toggleAuthorFilter(entry.author);
      setView("library");
    });
  }

  const metaParts = [];
  if (entry.source) metaParts.push(escapeHtml(entry.source));
  if (entry.tags.length) metaParts.push(entry.tags.map((t) => "#" + escapeHtml(t)).join(" "));
  $("#reader-meta").innerHTML = metaParts.join('<span class="dot">·</span>');

  $("#reader-text").textContent = "Loading…";
  $("#reader-background-wrap").classList.add("hidden");
  setView("library-reader");

  const { body, background, latinBody } = await getLibraryEntryText(id);
  $("#reader-text").innerHTML = latinBody ? renderBilingualBlock(latinBody, body, entry.originalLanguage) : renderTextBlock(body);
  if (background) {
    $("#reader-background").innerHTML = renderTextBlock(background);
    $("#reader-background-wrap").classList.remove("hidden");
  }
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
    const savedId = await saveLibraryEntry({
      id: state.editingLibraryId,
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
    list.innerHTML = `<div class="empty-state">No reflections yet — tap "+ New reflection" to write one.</div>`;
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
