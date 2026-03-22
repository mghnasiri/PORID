/**
 * Filter bar component — renders filter controls and applies filters to data arrays.
 */

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
];

const SOURCES = ['All Sources', 'arXiv', 'EJOR', 'Operations Research', 'INFORMS'];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
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

  return `
    <div class="filter-bar" role="toolbar" aria-label="Filters">
      <button class="tag filter-tag active" data-tag="all">All</button>
      ${tagPills}
      <div class="filter-bar__spacer"></div>
      ${sourceSelect}
      ${sortSelect}
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

  return {
    tags: activeTags,
    source,
    sort,
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
    result = result.filter((item) =>
      (item.tags || []).some((t) => filters.tags.includes(t))
    );
  }

  // Source filtering
  if (filters.source && filters.source !== 'All Sources') {
    result = result.filter((item) => item.source === filters.source);
  }

  // Sorting
  result.sort((a, b) => {
    if (filters.sort === 'newest') {
      return new Date(getDateKey(b)) - new Date(getDateKey(a));
    }
    if (filters.sort === 'oldest') {
      return new Date(getDateKey(a)) - new Date(getDateKey(b));
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
