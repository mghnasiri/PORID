/**
 * Shared empty-state component — renders contextual messages when filters
 * return zero results.
 *
 * Usage:
 *   import { renderEmptyState } from '../components/empty-state.js';
 *   renderEmptyState(container, { module, filters, totalCount });
 */

const MODULE_ICONS = {
  publications: '\u{1F4DA}',
  software: '\u{1F4E6}',
  conferences: '\u{1F393}',
  opportunities: '\u{1F4BC}',
  funding: '\u{1F4B0}',
  awards: '\u{1F3C6}',
  resources: '\u{1F4C1}',
  seminars: '\u{1F3A4}',
  datasets: '\u{1F4CA}',
  watchlist: '\u{2B50}',
};

const MODULE_LABELS = {
  publications: 'Publications',
  software: 'Software Releases',
  conferences: 'Conferences',
  opportunities: 'Opportunities',
  funding: 'Funding Programmes',
  awards: 'Awards',
  resources: 'Resources',
  seminars: 'Seminars',
  datasets: 'Datasets',
  watchlist: 'Watchlist Items',
};

/**
 * Builds a contextual suggestion string based on active filters.
 * @param {Object} context
 * @param {string} context.module - Module name (publications, conferences, etc.)
 * @param {Object} [context.filters] - Active filters from getActiveFilters()
 * @param {number} [context.totalCount] - Total unfiltered item count for the module
 * @returns {string} Suggestion text
 */
function buildSuggestion(context) {
  const { module, filters, totalCount } = context;
  const label = MODULE_LABELS[module] || 'items';
  const suggestions = [];

  if (filters) {
    // Suggest removing specific active tag filters
    const activeTags = (filters.tags || []).filter((t) => t !== 'all');
    if (activeTags.length > 0) {
      const tagList = activeTags.map((t) => `"${t}"`).join(', ');
      suggestions.push(`removing the ${tagList} tag${activeTags.length > 1 ? 's' : ''}`);
    }

    // Suggest broadening date range
    if (filters.dateFrom || filters.dateTo) {
      suggestions.push('broadening the date range');
    }

    // Suggest resetting source filter
    if (filters.source && filters.source !== 'All Sources') {
      suggestions.push(`changing the source from "${filters.source}"`);
    }

    // Suggest changing read status
    if (filters.readStatus && filters.readStatus !== 'all') {
      const statusLabels = { new: 'Unread', reading: 'Reading', read: 'Read' };
      suggestions.push(`removing the "${statusLabels[filters.readStatus] || filters.readStatus}" status filter`);
    }

    // Suggest switching from AND to OR
    if (filters.logic === 'and' && activeTags.length > 1) {
      suggestions.push('switching filter logic from AND to OR');
    }
  }

  if (suggestions.length > 0) {
    const suggestionText = suggestions.length === 1
      ? suggestions[0]
      : suggestions.slice(0, -1).join(', ') + ' or ' + suggestions[suggestions.length - 1];
    return `Try ${suggestionText}.`;
  }

  return 'Try adjusting your filters or search terms.';
}

/**
 * Builds the "browse all" link text.
 */
function buildBrowseAll(context) {
  const { module, totalCount } = context;
  const label = MODULE_LABELS[module] || 'items';
  if (totalCount && totalCount > 0) {
    return `Browse all ${totalCount} ${label.toLowerCase()}`;
  }
  return '';
}

/**
 * Renders a contextual empty-state message into a container.
 *
 * @param {HTMLElement} container - The DOM element to render into.
 * @param {Object} context
 * @param {string} context.module - Module name (e.g. 'publications').
 * @param {Object} [context.filters] - Active filter state from getActiveFilters().
 * @param {number} [context.totalCount] - Total unfiltered item count.
 */
export function renderEmptyState(container, context) {
  const { module } = context;
  const icon = MODULE_ICONS[module] || '\u{1F50D}';
  const label = MODULE_LABELS[module] || 'Results';

  container.textContent = '';

  const empty = document.createElement('div');
  empty.className = 'empty-state';

  const iconDiv = document.createElement('div');
  iconDiv.className = 'empty-state__icon';
  iconDiv.textContent = icon;
  empty.appendChild(iconDiv);

  const h2 = document.createElement('h2');
  h2.className = 'empty-state__title';
  h2.textContent = `No ${label} Found`;
  empty.appendChild(h2);

  const suggestion = buildSuggestion(context);
  const p = document.createElement('p');
  p.className = 'empty-state__text';
  p.textContent = suggestion;
  empty.appendChild(p);

  const browseText = buildBrowseAll(context);
  if (browseText) {
    const browseLink = document.createElement('a');
    browseLink.className = 'empty-state__browse';
    browseLink.href = `#${module}`;
    browseLink.textContent = browseText + ' \u2192';
    empty.appendChild(browseLink);
  }

  container.appendChild(empty);
}
