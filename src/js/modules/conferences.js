/**
 * Conferences module — renders conference cards with CFP deadline countdowns.
 *
 * Security: All data rendered comes from local static JSON (data/conferences.json).
 */

import { formatDate, daysUntil } from '../utils/date.js';
import { isWatchlisted } from '../utils/storage.js';

function renderConferenceCard(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starSymbol = starred ? '&#9733;' : '&#9734;';

  const days = item.cfp_deadline ? daysUntil(item.cfp_deadline) : null;
  let deadlineHtml = '';
  let urgentClass = '';

  if (days !== null) {
    if (days <= 0) {
      deadlineHtml = '<span class="cfp-badge cfp-badge--passed">CFP Passed</span>';
    } else if (days <= 14) {
      deadlineHtml = `<span class="cfp-badge cfp-badge--urgent">${days} days left</span>`;
      urgentClass = 'card--urgent';
    } else {
      deadlineHtml = `<span class="cfp-badge">${days} days left</span>`;
    }
  }

  // Trusted local data
  return `
    <article class="card ${urgentClass}" data-id="${item.id}" data-type="conference">
      <div class="card__header">
        <h3 class="card__title">${item.name}</h3>
        ${deadlineHtml}
      </div>
      <div class="conf-meta">
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#128197;</span>
          <span>${item.dates}</span>
        </div>
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#128205;</span>
          <span>${item.location}</span>
        </div>
        ${item.cfp_deadline ? `
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#9200;</span>
          <span>CFP Deadline: ${formatDate(item.cfp_deadline)}</span>
        </div>` : ''}
      </div>
      <div class="card__tags">
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        <button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist">${starSymbol}</button>
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Website</a>` : ''}
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
  let items = [...data];

  // Apply tag filters
  if (filters && filters.tags && !filters.tags.includes('all') && filters.tags.length > 0) {
    items = items.filter((item) =>
      (item.tags || []).some((t) => filters.tags.includes(t))
    );
  }

  // Sort by CFP deadline soonest first; passed deadlines go to end
  items.sort((a, b) => {
    const da = a.cfp_deadline ? daysUntil(a.cfp_deadline) : 9999;
    const db = b.cfp_deadline ? daysUntil(b.cfp_deadline) : 9999;
    const wa = da <= 0 ? 10000 + Math.abs(da) : da;
    const wb = db <= 0 ? 10000 + Math.abs(db) : db;
    return wa - wb;
  });

  if (items.length === 0) {
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-state__icon">&#127891;</div>';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'No Conferences Found';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Try adjusting your filters.';
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  // Trusted local data
  container.innerHTML = `<div class="card-grid">${items.map(renderConferenceCard).join('')}</div>`;
}
