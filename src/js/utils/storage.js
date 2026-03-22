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
