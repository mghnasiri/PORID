/**
 * Publications module — renders publication cards with grid/list toggle.
 *
 * Security: All data rendered comes from local static JSON (data/publications.json),
 * not from user input. innerHTML usage is safe in this context.
 */

import { relativeTime, formatDate } from '../utils/date.js';
import { isWatchlisted } from '../utils/storage.js';
import { applyFilters } from '../components/filters.js';

let viewMode = 'grid'; // 'grid' | 'list'

/** Maps source names to CSS modifier classes for color-coded badges. */
function sourceClass(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('arxiv')) return 'tag--source tag--source-arxiv';
  if (s.includes('ejor')) return 'tag--source tag--source-ejor';
  if (s.includes('operations research')) return 'tag--source tag--source-or';
  if (s.includes('informs') || s.includes('interfaces')) return 'tag--source tag--source-informs';
  if (s.includes('transportation') || s.includes('manufacturing')) return 'tag--source tag--source-ts';
  return 'tag--source';
}

/**
 * Truncates authors list: max 3 + "et al."
 */
function formatAuthors(authors) {
  if (!authors || authors.length === 0) return '';
  if (authors.length <= 3) return authors.join(', ');
  return authors.slice(0, 3).join(', ') + ' et al.';
}

/**
 * Truncates abstract to n chars.
 */
function snippet(text, max = 200) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

/**
 * Renders a publication card (grid mode) as HTML string.
 */
function renderGridCard(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starSymbol = starred ? '&#9733;' : '&#9734;';

  return `
    <article class="card" data-id="${item.id}" data-type="publication">
      <div class="card__header">
        <h3 class="card__title">${item.title}</h3>
        <span class="card__date" title="${formatDate(item.date)}">${relativeTime(item.date)}</span>
      </div>
      <p class="card__subtitle">${formatAuthors(item.authors)}</p>
      <p class="card__body">${snippet(item.abstract, 200)}</p>
      <div class="card__tags">
        <span class="tag ${sourceClass(item.source)}">${item.source}</span>
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        <button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist" title="Toggle watchlist">${starSymbol}</button>
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Open</a>` : ''}
        <button class="card__detail-btn card__action" data-id="${item.id}">Details</button>
      </div>
    </article>
  `;
}

/**
 * Renders a compact list row.
 */
function renderListRow(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starSymbol = starred ? '&#9733;' : '&#9734;';

  return `
    <div class="list-row" data-id="${item.id}" data-type="publication">
      <button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist">${starSymbol}</button>
      <div class="list-row__main">
        <span class="list-row__title">${item.title}</span>
        <span class="list-row__authors">${formatAuthors(item.authors)}</span>
      </div>
      <span class="tag tag--source list-row__source">${item.source}</span>
      <span class="list-row__date">${relativeTime(item.date)}</span>
      <button class="card__detail-btn card__action" data-id="${item.id}">Details</button>
    </div>
  `;
}

/**
 * Renders the view toggle buttons.
 */
function renderViewToggle() {
  return `
    <div class="view-toggle">
      <button class="view-toggle__btn ${viewMode === 'grid' ? 'active' : ''}" data-view="grid" aria-label="Grid view" title="Grid view">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
      </button>
      <button class="view-toggle__btn ${viewMode === 'list' ? 'active' : ''}" data-view="list" aria-label="List view" title="List view">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/><rect x="1" y="11.5" width="14" height="2.5" rx="1"/></svg>
      </button>
    </div>
  `;
}

/**
 * Main render function for the publications module.
 * @param {HTMLElement} container - The #content element.
 * @param {Object[]} data - Raw publications array.
 * @param {Object} filters - Active filter state from getActiveFilters().
 */
export function render(container, data, filters) {
  const filtered = applyFilters(data, filters);

  if (filtered.length === 0) {
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-state__icon">&#128218;</div>';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'No Publications Found';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Try adjusting your filters or search terms.';
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  const toggle = renderViewToggle();

  // Trusted local data rendering
  if (viewMode === 'list') {
    container.innerHTML = `${toggle}<div class="list-view">${filtered.map(renderListRow).join('')}</div>`;
  } else {
    container.innerHTML = `${toggle}<div class="card-grid">${filtered.map(renderGridCard).join('')}</div>`;
  }

  // Wire view toggle clicks
  container.querySelectorAll('.view-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.view;
      render(container, data, filters);
    });
  });
}
