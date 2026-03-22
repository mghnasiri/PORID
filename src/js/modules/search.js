/**
 * Search module — initializes Fuse.js and wires into the Cmd+K modal.
 *
 * Security: All data comes from local static JSON files. Search results
 * are rendered using DOM methods (textContent) for safety.
 */

import { showModal } from '../components/modal.js';
import { relativeTime } from '../utils/date.js';

let fuseIndex = null;
let allDataRef = [];

/**
 * Initializes Fuse.js search index with all data arrays merged.
 * Call this once after all data is loaded.
 * @param {Object} allData - { publications: [], software: [], ... }
 */
export function initSearch(allData) {
  allDataRef = Object.values(allData).flat();

  if (typeof Fuse === 'undefined') {
    console.warn('Fuse.js not loaded — search disabled.');
    return;
  }

  fuseIndex = new Fuse(allDataRef, {
    keys: [
      { name: 'title', weight: 0.3 },
      { name: 'name', weight: 0.25 },
      { name: 'authors', weight: 0.15 },
      { name: 'abstract', weight: 0.1 },
      { name: 'tags', weight: 0.2 },
    ],
    threshold: 0.3,
    includeScore: true,
  });
}

/**
 * Searches items and returns ranked results.
 * @param {string} query
 * @returns {Object[]} Array of matched items.
 */
export function searchItems(query) {
  if (!fuseIndex || !query) return [];
  return fuseIndex.search(query, { limit: 10 }).map((r) => r.item);
}

/**
 * Renders search results as mini-cards into the search modal results container.
 * Uses DOM methods for safe rendering.
 * @param {string} query
 * @param {Function} onCloseSearch - Callback to close the search modal.
 */
function renderSearchResults(query, onCloseSearch) {
  const resultsContainer = document.querySelector('.search-modal__results');
  if (!resultsContainer) return;

  resultsContainer.textContent = '';

  if (!query) {
    const hint = document.createElement('div');
    hint.className = 'search-modal__empty';
    hint.textContent = 'Start typing to search across all modules.';
    resultsContainer.appendChild(hint);
    return;
  }

  const results = searchItems(query);

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-modal__empty';
    empty.textContent = 'No results found.';
    resultsContainer.appendChild(empty);
    return;
  }

  results.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'search-result';

    const title = document.createElement('div');
    title.className = 'search-result__title';
    title.textContent = item.title || item.name || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'search-result__meta';

    const typeSpan = document.createElement('span');
    typeSpan.textContent = item.type;

    const dateSpan = document.createElement('span');
    const dateStr = item.date || item.cfp_deadline || item.deadline || '';
    if (dateStr) {
      dateSpan.textContent = ` \u00B7 ${relativeTime(dateStr)}`;
    }

    meta.appendChild(typeSpan);
    meta.appendChild(dateSpan);

    // Tags preview
    if (item.tags && item.tags.length) {
      const tagsSpan = document.createElement('span');
      tagsSpan.className = 'search-result__tags';
      tagsSpan.textContent = ` \u00B7 ${item.tags.slice(0, 3).join(', ')}`;
      meta.appendChild(tagsSpan);
    }

    row.appendChild(title);
    row.appendChild(meta);

    row.addEventListener('click', () => {
      if (onCloseSearch) onCloseSearch();
      showModal(item);
    });

    resultsContainer.appendChild(row);
  });
}

/**
 * Wires the search input to live-render results in the Cmd+K modal.
 * @param {Function} onCloseSearch - Callback to close the search modal.
 */
export function wireSearchInput(onCloseSearch) {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    renderSearchResults(e.target.value.trim(), onCloseSearch);
  });
}
