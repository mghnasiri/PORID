/**
 * User preferences stored in localStorage.
 */

const STORAGE_KEY = 'porid-preferences';

const DEFAULTS = {
  defaultTab: 'pulse',
  sortOrder: 'newest',
  viewMode: 'grid',
  focusTags: [],        // Tags to highlight/prioritize
  itemsPerPage: 50,     // Not paginated yet but prepared
  theme: 'system',      // dark | light | system
};

/**
 * Retrieves preferences, merging stored values with defaults.
 * @returns {Object}
 */
export function getPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    const prefs = { ...DEFAULTS, ...stored };

    // Merge focus tags from onboarding if present
    try {
      const focusRaw = localStorage.getItem('porid-focus-tags');
      if (focusRaw) {
        const focusTags = JSON.parse(focusRaw);
        if (Array.isArray(focusTags) && focusTags.length > 0) {
          prefs.focusTags = focusTags;
        }
      }
    } catch { /* ignore parse errors */ }

    return prefs;
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Sets a single preference value.
 * @param {string} key
 * @param {*} value
 */
export function setPreference(key, value) {
  const prefs = getPreferences();
  prefs[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * Resets all preferences to defaults.
 */
export function resetPreferences() {
  localStorage.removeItem(STORAGE_KEY);
}
