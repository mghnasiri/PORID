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

/* R4-20: DOI / arXiv paste-detection patterns */
const DOI_RE = /\b10\.\d{4,9}\/[^\s]+/i;
const ARXIV_RE = /\b(\d{4}\.\d{4,5})(v\d+)?\b/;

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


// ---------------------------------------------------------------------------
// R4-17: Command palette go-to commands
// ---------------------------------------------------------------------------

const GOTO_COMMANDS = {
  pulse: 'pulse',
  radar: 'radar',
  toolkit: 'toolkit',
  solvers: 'toolkit',
  benchmarks: 'toolkit',
  publications: 'publications',
  papers: 'publications',
  software: 'software',
  conferences: 'conferences',
  opportunities: 'opportunities',
  jobs: 'opportunities',
  watchlist: 'watchlist',
  trends: 'trends',
  digest: 'digest',
  datasets: 'datasets',
  seminars: 'seminars',
  funding: 'funding',
  awards: 'awards',
  resources: 'resources',
  changelog: 'changelog',
};

const GOTO_LABELS = {
  pulse: 'Pulse',
  radar: 'Opportunity Radar',
  toolkit: 'Solver Observatory',
  publications: 'Publications',
  software: 'Software Releases',
  conferences: 'Conferences',
  opportunities: 'Opportunities',
  watchlist: 'Watchlist',
  trends: 'Trends',
  digest: 'Digest',
  datasets: 'Datasets & Blogs',
  seminars: 'Seminars',
  funding: 'Funding',
  awards: 'Awards',
  resources: 'Resources',
  changelog: 'Changelog',
};

/**
 * Checks if query is a go-to command (starts with ">" or "go:").
 * Returns matching sections or null if not a command.
 */
function matchGoToCommand(query) {
  let cmd = null;
  if (query.startsWith('>')) {
    cmd = query.slice(1).trim().toLowerCase();
  } else if (query.toLowerCase().startsWith('go:')) {
    cmd = query.slice(3).trim().toLowerCase();
  }
  if (!cmd) return null;

  // Find matching sections
  const matches = [];
  for (const [key, tab] of Object.entries(GOTO_COMMANDS)) {
    if (key.startsWith(cmd) || key.includes(cmd)) {
      // Deduplicate by target tab
      if (!matches.find((m) => m.tab === tab)) {
        matches.push({ key, tab, label: GOTO_LABELS[tab] || tab });
      }
    }
  }
  return matches;
}

/**
 * Renders go-to command results as navigation items.
 */
function renderGoToResults(matches, resultsContainer, onCloseSearch) {
  const header = document.createElement('div');
  header.className = 'search-modal__empty';
  header.textContent = 'Go to section:';
  resultsContainer.appendChild(header);

  matches.forEach((match) => {
    const row = document.createElement('div');
    row.className = 'search-result search-result--goto';

    const icon = document.createElement('span');
    icon.className = 'search-result__goto-icon';
    icon.textContent = '\u2192';

    const title = document.createElement('div');
    title.className = 'search-result__title';
    title.textContent = match.label;

    const meta = document.createElement('div');
    meta.className = 'search-result__meta';
    meta.textContent = 'Navigate to #' + match.tab;

    row.appendChild(icon);
    const textWrap = document.createElement('div');
    textWrap.appendChild(title);
    textWrap.appendChild(meta);
    row.appendChild(textWrap);

    row.addEventListener('click', () => {
      if (onCloseSearch) onCloseSearch();
      window.location.hash = match.tab;
    });

    resultsContainer.appendChild(row);
  });
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

  // R4-17: Check for go-to commands before normal search
  if (query) {
    const goToMatches = matchGoToCommand(query);
    if (goToMatches && goToMatches.length > 0) {
      renderGoToResults(goToMatches, resultsContainer, onCloseSearch);
      return;
    }
  }

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
 * R4-20: Handle pasted DOI / arXiv identifiers.
 * If the pasted text matches, search the index. If found, open the item;
 * otherwise show a "Not in index" message with an external link.
 */
function handleIdPaste(text, onCloseSearch) {
  const doiMatch = text.match(DOI_RE);
  const arxivMatch = text.match(ARXIV_RE);
  if (!doiMatch && !arxivMatch) return false;

  const id = doiMatch ? doiMatch[0] : arxivMatch[0];
  const isArxiv = !doiMatch;

  // Mark the input visually
  const input = document.getElementById('searchInput');
  if (input) input.classList.add('search-modal__input--id-detected');

  // Try to find in data by DOI field or arXiv id in the URL/id fields
  const found = allDataRef.find((item) => {
    const haystack = [item.doi, item.arxiv_id, item.url, item.id, item.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(id.toLowerCase());
  });

  const resultsContainer = document.querySelector('.search-modal__results');
  if (!resultsContainer) return true;
  resultsContainer.textContent = '';

  if (found) {
    const row = document.createElement('div');
    row.className = 'search-result search-result--id-match';
    const title = document.createElement('div');
    title.className = 'search-result__title';
    title.textContent = found.title || found.name || 'Untitled';
    const meta = document.createElement('div');
    meta.className = 'search-result__meta';
    meta.textContent = `Found by ${isArxiv ? 'arXiv' : 'DOI'}: ${id}`;
    row.appendChild(title);
    row.appendChild(meta);
    row.addEventListener('click', () => {
      if (onCloseSearch) onCloseSearch();
      showModal(found);
    });
    resultsContainer.appendChild(row);
  } else {
    const msg = document.createElement('div');
    msg.className = 'search-modal__empty search-modal__not-indexed';
    const extUrl = isArxiv
      ? `https://arxiv.org/abs/${id}`
      : `https://doi.org/${id}`;
    const label = isArxiv ? 'arXiv' : 'DOI.org';
    const txt = document.createTextNode('Not in index \u2014 view on ');
    const link = document.createElement('a');
    link.href = extUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    link.className = 'search-modal__ext-link';
    msg.appendChild(txt);
    msg.appendChild(link);
    resultsContainer.appendChild(msg);
  }
  return true;
}

/**
 * Wires the search input to live-render results in the Cmd+K modal.
 * @param {Function} onCloseSearch - Callback to close the search modal.
 */
export function wireSearchInput(onCloseSearch) {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  /* R4-20: Paste listener for DOI / arXiv detection */
  searchInput.addEventListener('paste', (e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (pasted && handleIdPaste(pasted.trim(), onCloseSearch)) {
      e.preventDefault();
      searchInput.value = pasted.trim();
    }
  });

  /* Remove ID-detected highlight on normal typing */
  searchInput.addEventListener('input', (e) => {
    searchInput.classList.remove('search-modal__input--id-detected');
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
