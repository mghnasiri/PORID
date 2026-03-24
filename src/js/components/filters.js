/**
 * Filter bar component — renders filter controls and applies filters to data arrays.
 */

import { getReadStatus } from '../utils/storage.js';

const ALL_TAGS = [
  'scheduling',
  'vehicle-routing',
  'integer-programming',
  'stochastic',
  'ml-for-or',
  'healthcare-or',
  'metaheuristics',
  'solver',
  'simulation',
  'conference',
  'postdoc',
  'faculty',
  'industry',
  'survey',
];

const SOURCES = ['All Sources', 'arXiv', 'EJOR', 'Operations Research', 'INFORMS'];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'cited', label: 'Most Cited' },
  { value: 'deadline', label: 'Deadline Soonest' },
];

/**
 * Renders the filter bar HTML.
 * @param {Object} options
 * @param {string[]} [options.tags] - Available tags for the current view.
 * @param {boolean} [options.showSource] - Whether to show the source dropdown.
 * @param {boolean} [options.showDeadlineSort] - Whether to include deadline sort option.
 * @returns {string} HTML string
 */
export function renderFilterBar(options = {}) {
  const tags = options.tags || ALL_TAGS;
  const showSource = options.showSource !== false;
  const sortOpts = options.showDeadlineSort !== false
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter((s) => s.value !== 'deadline');

  const tagPills = tags
    .map(
      (t) =>
        `<button class="tag filter-tag" data-tag="${t}">${t}</button>`
    )
    .join('');

  const sourceSelect = showSource
    ? `<select class="filter-select" id="filterSource" aria-label="Filter by source">
        ${SOURCES.map((s) => `<option value="${s}">${s}</option>`).join('')}
      </select>`
    : '';

  const sortSelect = `
    <select class="filter-select" id="filterSort" aria-label="Sort order">
      ${sortOpts.map((s) => `<option value="${s.value}">${s.label}</option>`).join('')}
    </select>
  `;

  const readStatusSelect = `
    <select class="filter-select" id="filterReadStatus" aria-label="Reading status filter">
      <option value="all">All Status</option>
      <option value="new">Unread</option>
      <option value="reading">Reading</option>
      <option value="read">Read</option>
    </select>
  `;

  const exportSelect = `
    <select class="filter-select" id="filterExport" aria-label="Export filtered results">
      <option value="">Export...</option>
      <option value="bibtex">Export BibTeX</option>
      <option value="csv">Export CSV</option>
      <option value="json">Export JSON</option>
    </select>
  `;

  return `
    <div class="filter-bar" role="toolbar" aria-label="Filters">
      <button class="tag filter-tag active" data-tag="all">All</button>
      ${tagPills}
      <button class="tag filter-logic" id="filterLogic" title="Toggle AND/OR matching" aria-label="Toggle AND/OR filter logic">OR</button>
      <div class="filter-bar__spacer"></div>
      <input type="date" class="filter-date" id="filterDateFrom" aria-label="From date" title="From date">
      <span class="filter-date-sep">–</span>
      <input type="date" class="filter-date" id="filterDateTo" aria-label="To date" title="To date">
      ${sourceSelect}
      ${sortSelect}
      ${readStatusSelect}
      ${exportSelect}
      <button class="tag filter-clear" id="filterClear" style="display:none;" aria-label="Clear all filters">&#10005; Clear</button>
    </div>
  `;
}

/**
 * Reads the current filter state from the DOM.
 * @returns {{ tags: string[], source: string, sort: string }}
 */
export function getActiveFilters() {
  const activeTags = Array.from(
    document.querySelectorAll('.filter-tag.active')
  ).map((el) => el.dataset.tag);

  const sourceEl = document.getElementById('filterSource');
  const source = sourceEl ? sourceEl.value : 'All Sources';

  const sortEl = document.getElementById('filterSort');
  const sort = sortEl ? sortEl.value : 'newest';

  const logicEl = document.getElementById('filterLogic');
  const logic = logicEl && logicEl.textContent.trim() === 'AND' ? 'and' : 'or';

  const fromEl = document.getElementById('filterDateFrom');
  const toEl = document.getElementById('filterDateTo');

  const readStatusEl = document.getElementById('filterReadStatus');
  const readStatus = readStatusEl ? readStatusEl.value : 'all';

  return {
    tags: activeTags,
    source,
    sort,
    logic,
    dateFrom: fromEl ? fromEl.value : '',
    dateTo: toEl ? toEl.value : '',
    readStatus,
  };
}

/**
 * Filters and sorts an array of items based on active filters.
 * @param {Object[]} items
 * @param {{ tags: string[], source: string, sort: string }} filters
 * @returns {Object[]}
 */
export function applyFilters(items, filters) {
  let result = [...items];

  // Tag filtering (skip if "all" is selected)
  if (!filters.tags.includes('all') && filters.tags.length > 0) {
    const matcher = filters.logic === 'and' ? 'every' : 'some';
    result = result.filter((item) =>
      filters.tags[matcher]((t) => (item.tags || []).includes(t))
    );
  }

  // Date range filtering
  if (filters.dateFrom) {
    result = result.filter((item) => (getDateKey(item) || '') >= filters.dateFrom);
  }
  if (filters.dateTo) {
    result = result.filter((item) => (getDateKey(item) || '') <= filters.dateTo);
  }

  // Source filtering
  if (filters.source && filters.source !== 'All Sources') {
    result = result.filter((item) => item.source === filters.source);
  }

  // Reading status filtering
  if (filters.readStatus && filters.readStatus !== 'all') {
    result = result.filter((item) => getReadStatus(item.id) === filters.readStatus);
  }

  // Sorting
  result.sort((a, b) => {
    if (filters.sort === 'newest') {
      return new Date(getDateKey(b)) - new Date(getDateKey(a));
    }
    if (filters.sort === 'oldest') {
      return new Date(getDateKey(a)) - new Date(getDateKey(b));
    }
    if (filters.sort === 'cited') {
      return (b.citation_count || 0) - (a.citation_count || 0);
    }
    if (filters.sort === 'deadline') {
      const da = a.cfp_deadline || a.deadline || a.date || '9999-12-31';
      const db = b.cfp_deadline || b.deadline || b.date || '9999-12-31';
      return new Date(da) - new Date(db);
    }
    return 0;
  });

  return result;
}

/**
 * Extracts the best date key from an item for sorting.
 */
function getDateKey(item) {
  return item.date || item.cfp_deadline || item.deadline || '1970-01-01';
}
