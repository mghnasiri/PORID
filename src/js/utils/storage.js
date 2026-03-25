/**
 * Watchlist persistence via localStorage.
 * Items are stored as a JSON array under the key 'porid-watchlist'.
 */

const STORAGE_KEY = 'porid-watchlist';

/**
 * Retrieves the full watchlist array from localStorage.
 * @returns {Array<Object>}
 */
export function getWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Adds an item to the watchlist. Prevents duplicates by id.
 * @param {Object} item - Must have an `id` property.
 */
export function addToWatchlist(item) {
  const list = getWatchlist();
  if (list.some((entry) => entry.id === item.id)) return;
  list.push(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * Removes an item from the watchlist by id.
 * @param {string} id
 */
export function removeFromWatchlist(id) {
  const list = getWatchlist().filter((entry) => entry.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * Checks whether an item is in the watchlist.
 * @param {string} id
 * @returns {boolean}
 */
export function isWatchlisted(id) {
  return getWatchlist().some((entry) => entry.id === id);
}

/**
 * Exports the watchlist as a downloadable JSON blob.
 * Triggers a browser download.
 */
export function exportWatchlist() {
  const list = getWatchlist();
  const blob = new Blob([JSON.stringify(list, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `porid-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Reading Status (per item, stored in localStorage)
// ---------------------------------------------------------------------------

const STATUS_KEY = 'porid-read-status';
const STATUSES = ['new', 'reading', 'read'];

/**
 * Get reading status for an item.
 * @param {string} id
 * @returns {'new'|'reading'|'read'}
 */
export function getReadStatus(id) {
  try {
    const data = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
    return data[id] || 'new';
  } catch { return 'new'; }
}

/**
 * Cycle reading status: new → reading → read → new.
 * @param {string} id
 * @returns {'new'|'reading'|'read'} The new status
 */
export function cycleReadStatus(id) {
  try {
    const data = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
    const current = data[id] || 'new';
    const next = STATUSES[(STATUSES.indexOf(current) + 1) % STATUSES.length];
    if (next === 'new') {
      delete data[id];
    } else {
      data[id] = next;
    }
    localStorage.setItem(STATUS_KEY, JSON.stringify(data));
    return next;
  } catch { return 'new'; }
}

// ---------------------------------------------------------------------------
// Card Notes (FE-06: inline notes on any card)
// ---------------------------------------------------------------------------

const NOTES_KEY = 'porid-card-notes';

/**
 * Retrieves all card notes from localStorage.
 * @returns {Object<string, string>}
 */
export function getAllNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Get the note text for a specific item.
 * @param {string} id
 * @returns {string}
 */
export function getNote(id) {
  return getAllNotes()[id] || '';
}

/**
 * Set (or clear) a note for a specific item.
 * @param {string} id
 * @param {string} text
 */
export function setNote(id, text) {
  const notes = getAllNotes();
  if (text && text.trim()) {
    notes[id] = text.trim();
  } else {
    delete notes[id];
  }
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

/**
 * Check if an item has a saved note.
 * @param {string} id
 * @returns {boolean}
 */
export function hasNote(id) {
  return !!getAllNotes()[id];
}
