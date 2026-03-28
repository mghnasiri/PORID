/**
 * Data Loader — guaranteed fallback chain for all data loading.
 * Tries live data first, falls back to committed static copies.
 */
export async function loadData(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error('Empty data');
    }
    return data;
  } catch (err) {
    console.warn(`Live fetch failed for ${path}: ${err.message}. Using bundled fallback.`);
    try {
      const fallback = await fetch(path.replace('data/', 'data/static/'));
      if (!fallback.ok) throw new Error(`Fallback HTTP ${fallback.status}`);
      return await fallback.json();
    } catch {
      console.error(`Both live and fallback failed for ${path}`);
      return null;
    }
  }
}

/**
 * Show "Data verified: <date>" badge in a container.
 * Reads from data/metadata.json.
 */
export async function showLastUpdated(container) {
  try {
    const resp = await fetch('./data/metadata.json');
    if (!resp.ok) return;
    const meta = await resp.json();
    const date = new Date(meta.last_fetch || meta.last_updated || meta.timestamp);
    if (isNaN(date.getTime())) return;
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const div = document.createElement('div');
    div.className = 'last-updated';
    div.textContent = `Data verified: ${formatted}`;
    container.insertBefore(div, container.firstChild);
  } catch { /* silently skip if no metadata */ }
}
