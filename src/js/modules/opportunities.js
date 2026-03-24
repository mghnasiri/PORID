/**
 * Opportunities module — renders academic position cards with type badges.
 *
 * Security: All data rendered comes from local static JSON (data/opportunities.json).
 */

import { formatDate, daysUntil } from '../utils/date.js';
import { isWatchlisted } from '../utils/storage.js';

const TYPE_LABELS = {
  postdoc: 'Postdoc',
  faculty: 'Faculty',
  industry: 'Industry',
  phd: 'PhD',
};

function getPositionType(tags) {
  for (const t of tags || []) {
    if (TYPE_LABELS[t]) return t;
  }
  return null;
}

function renderOpportunityCard(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starSymbol = starred ? '&#9733;' : '&#9734;';

  // Check if item is new (within last 7 days)
  const isNewThisWeek = item.date && (Date.now() - new Date(item.date + 'T00:00:00').getTime()) < 7 * 24 * 60 * 60 * 1000;
  const newBadge = isNewThisWeek ? '<span class="new-badge">NEW</span>' : '';

  const posType = getPositionType(item.tags);
  const typeBadge = posType
    ? `<span class="type-badge type-badge--${posType}">${TYPE_LABELS[posType]}</span>`
    : '';

  let deadlineHtml = '';
  if (item.deadline) {
    const days = daysUntil(item.deadline);
    if (days <= 0) {
      deadlineHtml = '<span class="cfp-badge cfp-badge--passed">Deadline Passed</span>';
    } else if (days <= 14) {
      deadlineHtml = `<span class="cfp-badge cfp-badge--urgent">${days} days left</span>`;
    } else {
      deadlineHtml = `<span class="cfp-badge">${days} days left</span>`;
    }
  }

  // Trusted local data
  return `
    <article class="card" data-id="${item.id}" data-type="opportunity">
      <div class="card__header">
        <h3 class="card__title">${item.title}</h3>
        ${newBadge}
        ${deadlineHtml}
      </div>
      <div class="conf-meta">
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#127979;</span>
          <span>${item.institution}</span>
        </div>
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#128205;</span>
          <span>${item.location}</span>
        </div>
        ${item.deadline ? `
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#9200;</span>
          <span>Deadline: ${formatDate(item.deadline)}</span>
        </div>` : ''}
      </div>
      <div class="card__tags">
        ${typeBadge}
        ${(item.tags || []).filter((t) => !TYPE_LABELS[t]).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        <button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist">${starSymbol}</button>
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Apply</a>` : ''}
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

  // Sort by deadline soonest first; passed at end
  items.sort((a, b) => {
    const da = a.deadline ? daysUntil(a.deadline) : 9999;
    const db = b.deadline ? daysUntil(b.deadline) : 9999;
    const wa = da <= 0 ? 10000 + Math.abs(da) : da;
    const wb = db <= 0 ? 10000 + Math.abs(db) : db;
    return wa - wb;
  });

  if (items.length === 0) {
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-state__icon">&#128188;</div>';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'No Opportunities Found';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Try adjusting your filters.';
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  // Trusted local data
  container.innerHTML = `<div class="card-grid">${items.map(renderOpportunityCard).join('')}</div>`;
}
