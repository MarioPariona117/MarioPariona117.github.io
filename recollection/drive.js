// Drive v3 REST helpers. Everything the app touches lives inside one
// "Spiritual Journal" folder with "library" and "journal" subfolders,
// created on first run and found by name+parent on every run after.

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function doFetch(url, opts, responseType, retried = false) {
  const token = await getValidToken();
  const headers = Object.assign({ Authorization: `Bearer ${token}` }, opts.headers);
  const res = await fetch(url, Object.assign({}, opts, { headers }));

  if (res.status === 401 && !retried) {
    await getValidToken(true);
    return doFetch(url, opts, responseType, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive API error ${res.status}: ${text}`);
  }
  if (responseType === "none") return null;
  if (responseType === "text") return res.text();
  return res.json();
}

function apiGet(path) {
  return doFetch(`${DRIVE_API}${path}`, { method: "GET" }, "json");
}
function apiJson(path, method, body) {
  return doFetch(
    `${DRIVE_API}${path}`,
    { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    "json"
  );
}
function apiDelete(path) {
  return doFetch(`${DRIVE_API}${path}`, { method: "DELETE" }, "none");
}
function apiGetText(path) {
  return doFetch(`${DRIVE_API}${path}`, { method: "GET" }, "text");
}

async function findOrCreateFolder(name, parentId) {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQueryValue(name)}' and trashed=false and ${parentClause}`;
  const res = await apiGet(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  if (res.files && res.files.length > 0) return res.files[0].id;

  const created = await apiJson("/files", "POST", {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentId ? [parentId] : undefined,
  });
  return created.id;
}

let foldersCache = null;
async function ensureFolders() {
  if (foldersCache) return foldersCache;
  const rootId = await findOrCreateFolder(CONFIG.ROOT_FOLDER_NAME, null);
  const libraryId = await findOrCreateFolder("library", rootId);
  const journalId = await findOrCreateFolder("journal", rootId);
  foldersCache = { rootId, libraryId, journalId };
  return foldersCache;
}

async function listFolderFiles(folderId) {
  const q = `'${folderId}' in parents and trashed=false`;
  const res = await apiGet(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,properties,modifiedTime)&orderBy=modifiedTime desc&pageSize=1000`
  );
  return res.files || [];
}

function buildMultipartBody(metadata, content, mimeType) {
  const boundary = "journalapp_" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;
  return { boundary, body };
}

async function createFile({ name, parentId, properties, content, mimeType = "text/markdown" }) {
  const metadata = { name, parents: [parentId], properties };
  const { boundary, body } = buildMultipartBody(metadata, content, mimeType);
  return doFetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,properties,modifiedTime`,
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    "json"
  );
}

function updateFileContent(fileId, content, mimeType = "text/markdown") {
  return doFetch(
    `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`,
    { method: "PATCH", headers: { "Content-Type": `${mimeType}; charset=UTF-8` }, body: content },
    "json"
  );
}

function updateFileMetadata(fileId, metadata) {
  return apiJson(`/files/${fileId}`, "PATCH", metadata);
}

function getFileContent(fileId) {
  return apiGetText(`/files/${fileId}?alt=media`);
}

function deleteFile(fileId) {
  return apiDelete(`/files/${fileId}`);
}

// --- Library ---

// Drive file `properties` are metadata-only and capped at ~124 bytes per
// value — fine for short fields (author, year, origin…) but not the
// freeform "background" text or a full Latin original. So both travel
// inside the file content itself, wrapped in these delimiters, and split
// back apart on read. Never shown if the file is opened directly in Drive.
const LATIN_DELIMITER = "\n%%LATIN%%\n";
const BACKGROUND_DELIMITER = "\n%%BACKGROUND%%\n";

function fileToLibraryEntry(f) {
  const p = f.properties || {};
  return {
    id: f.id,
    title: f.name,
    kind: p.kind || "quote",
    tags: p.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    source: p.source || "",
    author: p.author || "",
    authorNote: p.authorNote || "",
    year: p.year || "",
    origin: p.origin || "",
    feastDay: p.feastDay || "",
    liturgical: p.liturgical || "",
    originalLanguage: p.originalLanguage || "",
    favorite: p.favorite === "true",
    modifiedTime: f.modifiedTime,
  };
}

async function listLibrary() {
  const { libraryId } = await ensureFolders();
  return (await listFolderFiles(libraryId)).map(fileToLibraryEntry);
}

async function getLibraryEntryText(id) {
  let raw = await getFileContent(id);
  let latinBody = "";
  const latinIdx = raw.indexOf(LATIN_DELIMITER);
  if (latinIdx !== -1) {
    latinBody = raw.slice(0, latinIdx);
    raw = raw.slice(latinIdx + LATIN_DELIMITER.length);
  }
  const bgIdx = raw.indexOf(BACKGROUND_DELIMITER);
  if (bgIdx === -1) return { body: raw, background: "", latinBody };
  return { body: raw.slice(0, bgIdx), background: raw.slice(bgIdx + BACKGROUND_DELIMITER.length), latinBody };
}

async function saveLibraryEntry({ id, title, kind, tags, source, author, authorNote, year, origin, feastDay, liturgical, originalLanguage, favorite, body, background, latinBody }) {
  const properties = {
    kind,
    tags: (tags || []).join(","),
    source: source || "",
    author: author || "",
    authorNote: authorNote || "",
    year: year || "",
    origin: origin || "",
    feastDay: feastDay || "",
    liturgical: liturgical || "",
    originalLanguage: originalLanguage || "",
    favorite: favorite ? "true" : "false",
  };
  let content = latinBody ? `${latinBody}${LATIN_DELIMITER}${body}` : body;
  if (background) content += `${BACKGROUND_DELIMITER}${background}`;
  if (id) {
    await updateFileMetadata(id, { name: title, properties });
    await updateFileContent(id, content);
    return id;
  }
  const { libraryId } = await ensureFolders();
  const created = await createFile({ name: title, parentId: libraryId, properties, content });
  return created.id;
}

function deleteLibraryEntry(id) {
  return deleteFile(id);
}

// --- Journal ---

function fileToJournalEntry(f) {
  const p = f.properties || {};
  return {
    id: f.id,
    name: f.name,
    tags: p.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    linkedLibraryId: p.linkedLibraryId || "",
    modifiedTime: f.modifiedTime,
  };
}

async function listJournal() {
  const { journalId } = await ensureFolders();
  return (await listFolderFiles(journalId)).map(fileToJournalEntry);
}

function getJournalEntryBody(id) {
  return getFileContent(id);
}

async function saveJournalEntry({ id, date, title, tags, linkedLibraryId, body }) {
  const name = `${date} — ${title || "Untitled"}`;
  const properties = { tags: (tags || []).join(","), linkedLibraryId: linkedLibraryId || "" };
  if (id) {
    await updateFileMetadata(id, { name, properties });
    await updateFileContent(id, body);
    return id;
  }
  const { journalId } = await ensureFolders();
  const created = await createFile({ name, parentId: journalId, properties, content: body });
  return created.id;
}

function deleteJournalEntry(id) {
  return deleteFile(id);
}

// --- Saints: personal layer ---
//
// Same shape and interface as store-local.js's saints functions. Rather
// than one Drive file per saint (72 tiny files), the whole personal-layer
// object is kept as a single JSON file, "saints-personal.json", in the
// root app folder — it's small, changes often, and per-saint round-trips
// would multiply API calls for no benefit.

const SAINTS_PERSONAL_FILENAME = "saints-personal.json";
let saintsPersonalFileIdCache = null;

async function findSaintsPersonalFile() {
  const { rootId } = await ensureFolders();
  const q = `name='${escapeDriveQueryValue(SAINTS_PERSONAL_FILENAME)}' and trashed=false and '${rootId}' in parents`;
  const res = await apiGet(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  return res.files && res.files.length > 0 ? res.files[0].id : null;
}

async function loadSaintsPersonalAll() {
  if (saintsPersonalFileIdCache === null) {
    saintsPersonalFileIdCache = (await findSaintsPersonalFile()) || "";
  }
  if (!saintsPersonalFileIdCache) return {};
  try {
    return JSON.parse(await getFileContent(saintsPersonalFileIdCache));
  } catch {
    return {};
  }
}

async function writeSaintsPersonalAll(all) {
  const content = JSON.stringify(all);
  if (saintsPersonalFileIdCache) {
    await updateFileContent(saintsPersonalFileIdCache, content, "application/json");
    return;
  }
  const { rootId } = await ensureFolders();
  const created = await createFile({ name: SAINTS_PERSONAL_FILENAME, parentId: rootId, properties: {}, content, mimeType: "application/json" });
  saintsPersonalFileIdCache = created.id;
}

function emptySaintPersonalDrive() {
  return { status: "", familiarity: {}, notes: "", studyLog: [], cards: {} };
}

async function getAllSaintsPersonal() {
  return loadSaintsPersonalAll();
}

async function getSaintPersonal(slug) {
  const all = await loadSaintsPersonalAll();
  return all[slug] ? Object.assign(emptySaintPersonalDrive(), all[slug]) : emptySaintPersonalDrive();
}

async function saveSaintPersonal(slug, data) {
  const all = await loadSaintsPersonalAll();
  all[slug] = Object.assign(emptySaintPersonalDrive(), all[slug], data);
  await writeSaintsPersonalAll(all);
  return all[slug];
}

async function addSaintStudyLogEntry(slug, note, date) {
  const all = await loadSaintsPersonalAll();
  const current = all[slug] ? Object.assign(emptySaintPersonalDrive(), all[slug]) : emptySaintPersonalDrive();
  current.studyLog = current.studyLog || [];
  current.studyLog.unshift({ date: date || todayISO(), note });
  all[slug] = current;
  await writeSaintsPersonalAll(all);
  return current;
}

async function saveSaintCardState(slug, cardIndex, cardState) {
  const all = await loadSaintsPersonalAll();
  const current = all[slug] ? Object.assign(emptySaintPersonalDrive(), all[slug]) : emptySaintPersonalDrive();
  current.cards = current.cards || {};
  current.cards[cardIndex] = cardState;
  all[slug] = current;
  await writeSaintsPersonalAll(all);
  return current;
}
