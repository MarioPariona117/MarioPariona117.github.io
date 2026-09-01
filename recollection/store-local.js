// Local-storage-backed content store — mimics the exact function shape of
// drive.js (listLibrary, saveLibraryEntry, listJournal, saveJournalEntry,
// etc.) so app.js doesn't know or care which backend it's talking to.
//
// This is the interim mode: everything lives in this browser's
// localStorage only (like the wardrobe pages elsewhere in this repo) — no
// Google sign-in, no cross-device sync yet. See SETUP.md + index.html's
// script section for how to switch to real Google Drive sync later,
// which uses this same function interface.

const LS_LIBRARY_KEY = "recollection.library.v1";
const LS_JOURNAL_KEY = "recollection.journal.v1";

function lsRead(key, defaultValue = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}
function lsWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function newLocalId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function byModifiedDesc(a, b) {
  return a.modifiedTime < b.modifiedTime ? 1 : -1;
}

// --- Library ---

async function listLibrary() {
  return lsRead(LS_LIBRARY_KEY)
    .map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      tags: e.tags || [],
      source: e.source || "",
      author: e.author || "",
      authorNote: e.authorNote || "",
      related: e.related || [],
      relatedSaints: e.relatedSaints || [],
      seedVersion: e.seedVersion || 1,
      year: e.year || "",
      origin: e.origin || "",
      feastDay: e.feastDay || "",
      liturgical: e.liturgical || "",
      originalLanguage: e.originalLanguage || "",
      occasion: e.occasion || "",
      favorite: !!e.favorite,
      modifiedTime: e.modifiedTime,
    }))
    .sort(byModifiedDesc);
}

// Returns { body, background, latinBody } — the main (English) text, the
// freeform "why/when/where it was written" note, and an optional original-
// language text (Latin, Spanish, etc. — see originalLanguage) shown side by
// side with body when present.
async function getLibraryEntryText(id) {
  const entry = lsRead(LS_LIBRARY_KEY).find((e) => e.id === id);
  return {
    body: entry ? entry.body : "",
    background: entry ? entry.background || "" : "",
    latinBody: entry ? entry.latinBody || "" : "",
    spanishBody: entry ? entry.spanishBody || "" : "",
  };
}

async function saveLibraryEntry({ id, title, kind, tags, source, author, authorNote, year, origin, feastDay, liturgical, originalLanguage, favorite, body, background, latinBody, spanishBody, occasion, related, relatedSaints, seedVersion }) {
  const list = lsRead(LS_LIBRARY_KEY);
  const modifiedTime = new Date().toISOString();
  const fields = { title, kind, tags, source, author, authorNote, year, origin, feastDay, liturgical, originalLanguage, favorite, body, background, latinBody, spanishBody, occasion, related, relatedSaints, seedVersion };
  if (id) {
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...fields, modifiedTime };
  } else {
    id = newLocalId();
    list.push({ id, ...fields, modifiedTime });
  }
  lsWrite(LS_LIBRARY_KEY, list);
  return id;
}

async function deleteLibraryEntry(id) {
  lsWrite(LS_LIBRARY_KEY, lsRead(LS_LIBRARY_KEY).filter((e) => e.id !== id));
}

// --- Journal ---

async function listJournal() {
  return lsRead(LS_JOURNAL_KEY)
    .map((e) => ({
      id: e.id,
      name: e.name,
      tags: e.tags || [],
      linkedLibraryId: e.linkedLibraryId || "",
      modifiedTime: e.modifiedTime,
    }))
    .sort(byModifiedDesc);
}

async function getJournalEntryBody(id) {
  const entry = lsRead(LS_JOURNAL_KEY).find((e) => e.id === id);
  return entry ? entry.body : "";
}

async function saveJournalEntry({ id, date, title, tags, linkedLibraryId, body }) {
  const list = lsRead(LS_JOURNAL_KEY);
  const modifiedTime = new Date().toISOString();
  const name = `${date} — ${title || "Untitled"}`;
  if (id) {
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], name, tags, linkedLibraryId, body, modifiedTime };
  } else {
    id = newLocalId();
    list.push({ id, name, tags, linkedLibraryId, body, modifiedTime });
  }
  lsWrite(LS_JOURNAL_KEY, list);
  return id;
}

async function deleteJournalEntry(id) {
  lsWrite(LS_JOURNAL_KEY, lsRead(LS_JOURNAL_KEY).filter((e) => e.id !== id));
}

// --- Saints: personal layer ---
//
// The saint dossiers themselves (feast day, life, writings, etc.) are
// read-only data from saints-data.js — the repo is their source of truth,
// same one-way flow as wardrobe.yaml. Everything Mario records personally
// about a saint — relationship status, per-section familiarity, notes,
// study log, flashcard scheduling state — lives here instead, keyed by the
// saint's `slug` so it survives edits to the dossier text itself.
//
// Shape per slug:
//   {
//     status: "friend" | "acquaintance" | "tomeet" | "",
//     familiarity: { identity, dates, life, narrative, spirituality, writings, cult, connections } → 0-5,
//     notes: "freeform text",
//     studyLog: [{ date: "YYYY-MM-DD", note: "..." }, ...],
//     cards: { "0": { ease, interval, reps, due }, "1": {...}, ... }  — keyed by
//       the card's index in that saint's `cards` array in saints-data.js
//   }

const LS_SAINTS_KEY = "recollection.saints.personal.v1";

function emptySaintPersonal() {
  return { status: "", familiarity: {}, notes: "", studyLog: [], cards: {} };
}

async function getAllSaintsPersonal() {
  return lsRead(LS_SAINTS_KEY, {});
}

async function getSaintPersonal(slug) {
  const all = lsRead(LS_SAINTS_KEY, {});
  return all[slug] ? Object.assign(emptySaintPersonal(), all[slug]) : emptySaintPersonal();
}

async function saveSaintPersonal(slug, data) {
  const all = lsRead(LS_SAINTS_KEY, {});
  all[slug] = Object.assign(emptySaintPersonal(), all[slug], data);
  lsWrite(LS_SAINTS_KEY, all);
  return all[slug];
}

async function addSaintStudyLogEntry(slug, note, date) {
  const all = lsRead(LS_SAINTS_KEY, {});
  const current = all[slug] ? Object.assign(emptySaintPersonal(), all[slug]) : emptySaintPersonal();
  current.studyLog = current.studyLog || [];
  current.studyLog.unshift({ date: date || todayISO(), note });
  all[slug] = current;
  lsWrite(LS_SAINTS_KEY, all);
  return current;
}

// Card scheduling state is stored raw here (no SM-2 math — that lives in
// app.js so this file stays a plain store, matching drive.js's role).
async function saveSaintCardState(slug, cardIndex, cardState) {
  const all = lsRead(LS_SAINTS_KEY, {});
  const current = all[slug] ? Object.assign(emptySaintPersonal(), all[slug]) : emptySaintPersonal();
  current.cards = current.cards || {};
  current.cards[cardIndex] = cardState;
  all[slug] = current;
  lsWrite(LS_SAINTS_KEY, all);
  return current;
}
