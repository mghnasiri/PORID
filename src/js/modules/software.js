/**
 * Software module — renders software release cards with version badges.
 *
 * Security: All data rendered comes from local static JSON (data/software.json).
 */

import { relativeTime, formatDate } from '../utils/date.js';
import { isWatchlisted } from '../utils/storage.js';
import { applyFilters } from '../components/filters.js';

function changelogSnippet(text, max = 100) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

function formatCount(n) {
  if (!n && n !== 0) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function renderSoftwareCard(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starSymbol = starred ? '&#9733;' : '&#9734;';

  // Trusted local data
  return `
    <article class="card card--software" data-id="${item.id}" data-type="software">
      <div class="card__header">
        <div>
          <h3 class="card__title">${item.name}</h3>
          <span class="version-badge">v${item.version}</span>
          ${(item.stars || item.forks) ? `<span class="card__repo-stats">\u2B50 ${formatCount(item.stars)} \u00B7 \uD83C\uDF74 ${formatCount(item.forks)}</span>` : ''}
        </div>
        <span class="card__date" title="${formatDate(item.date)}">${relativeTime(item.date)}</span>
      </div>
      <p class="card__body">${changelogSnippet(item.changelog, 100)}</p>
      <div class="card__tags">
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
        ${item.license ? `<span class="tag tag--license">${item.license}</span>` : ''}
      </div>
      <div class="card__actions">
        <button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist">${starSymbol}</button>
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; GitHub</a>` : ''}
        <button class="card__detail-btn card__action" data-id="${item.id}">Details</button>
      </div>
    </article>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {Object[]} data
 * @param {Object} filters
 */
export function render(container, data, filters) {
  const filtered = applyFilters(data, filters);

  if (filtered.length === 0) {
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-state__icon">&#128230;</div>';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'No Software Releases Found';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Try adjusting your filters.';
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  // Trusted local data
  container.innerHTML = `<div class="card-grid">${filtered.map(renderSoftwareCard).join('')}</div>`;
}
