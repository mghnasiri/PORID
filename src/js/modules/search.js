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
let activeTypeFilter = 'all';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'publication', label: 'Publications' },
  { key: 'software', label: 'Software' },
  { key: 'conference', label: 'Conferences' },
  { key: 'opportunity', label: 'Opportunities' },
];

/**
 * Maps Fuse.js key names to human-readable labels.
 */
function matchKeyLabel(key) {
  const labels = {
    title: 'title',
    name: 'name',
    authors: 'authors',
    abstract: 'abstract',
    tags: 'tags',
  };
  return labels[key] || key;
}

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
    includeMatches: true,
  });
}

/**
 * Searches items and returns ranked results with match info.
 * @param {string} query
 * @returns {Object[]} Array of { item, matches } objects.
 */
export function searchItems(query) {
  if (!fuseIndex || !query) return [];
  return fuseIndex.search(query, { limit: 50 });
}

/**
 * Builds the type filter tabs DOM.
 */
function buildTypeTabs(onCloseSearch) {
  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'search-type-tabs';

  TYPE_FILTERS.forEach((tf) => {
    const btn = document.createElement('button');
    btn.className = 'search-type-tab' + (tf.key === activeTypeFilter ? ' active' : '');
    btn.textContent = tf.label;
    btn.addEventListener('click', () => {
      activeTypeFilter = tf.key;
      // Re-render with current query
      const input = document.getElementById('searchInput');
      if (input) {
        renderSearchResults(input.value.trim(), onCloseSearch);
      }
    });
    tabsDiv.appendChild(btn);
  });

  return tabsDiv;
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

  // Add type filter tabs
  resultsContainer.appendChild(buildTypeTabs(onCloseSearch));

  if (!query) {
    const hint = document.createElement('div');
    hint.className = 'search-modal__empty';
    hint.textContent = 'Start typing to search across all modules.';
    resultsContainer.appendChild(hint);
    return;
  }

  let results = searchItems(query);

  // Apply type filter
  if (activeTypeFilter !== 'all') {
    results = results.filter((r) => r.item.type === activeTypeFilter);
  }

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-modal__empty';
    empty.textContent = 'No results found.';
    resultsContainer.appendChild(empty);
    return;
  }

  results.forEach((result) => {
    const item = result.item;
    const matches = result.matches || [];

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

    // Match reason
    if (matches.length > 0) {
      const matchSpan = document.createElement('span');
      matchSpan.className = 'search-result__match';
      const matchedFields = [...new Set(matches.map((m) => matchKeyLabel(m.key)))];
      matchSpan.textContent = ` \u00B7 matched: ${matchedFields.join(', ')}`;
      meta.appendChild(matchSpan);
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

/** MW-09: Tracked highlighted index for keyboard navigation */
let highlightedIndex = -1;

/**
 * Updates the visual highlight on search results based on highlightedIndex.
 */
function updateHighlight() {
  const results = document.querySelectorAll('.search-result');
  results.forEach((el, i) => {
    el.classList.toggle('search-result--highlighted', i === highlightedIndex);
  });
  // Scroll highlighted into view
  const active = results[highlightedIndex];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

/**
 * Wires the search input to live-render results in the Cmd+K modal.
 * @param {Function} onCloseSearch - Callback to close the search modal.
 */
export function wireSearchInput(onCloseSearch) {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    highlightedIndex = -1;
    renderSearchResults(e.target.value.trim(), onCloseSearch);
  });

  // MW-09: Keyboard navigation (Arrow Up/Down/Enter)
  searchInput.addEventListener('keydown', (e) => {
    const results = document.querySelectorAll('.search-result');
    if (!results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, results.length - 1);
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlight();
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      results[highlightedIndex]?.click();
    }
  });
}
