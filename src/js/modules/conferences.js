/**
 * Conferences module — renders conference cards with CFP deadline countdowns
 * and browser notification support for upcoming deadlines.
 *
 * Security note: All data rendered comes from local static JSON
 * (data/conferences.json), not from user input or external sources.
 * All uses of innerHTML below render exclusively from this trusted local data.
 */

import { formatDate, daysUntil } from '../utils/date.js';
import { isWatchlisted, getWatchlist } from '../utils/storage.js';

const NOTIFIED_KEY = 'porid-conf-notified';

/**
 * Get the set of conference IDs already notified this session.
 */
function getNotifiedIds() {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markNotified(id) {
  const ids = getNotifiedIds();
  ids.add(id);
  sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
}

/**
 * Check watchlisted conferences for upcoming deadlines and send notifications.
 */
function checkDeadlineNotifications(data) {
  const watchlist = getWatchlist();
  const watchIds = new Set(watchlist.map((w) => w.id));
  const notified = getNotifiedIds();

  const urgent = data.filter((item) => {
    if (!watchIds.has(item.id)) return false;
    if (notified.has(item.id)) return false;
    if (!item.cfp_deadline) return false;
    const days = daysUntil(item.cfp_deadline);
    return days > 0 && days <= 7;
  });

  if (urgent.length === 0) return;

  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    urgent.forEach((item) => {
      const days = daysUntil(item.cfp_deadline);
      new Notification('PORID - CFP Deadline Alert', {
        body: `${item.name}: ${days} day${days !== 1 ? 's' : ''} until CFP deadline`,
      });
      markNotified(item.id);
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        urgent.forEach((item) => {
          const days = daysUntil(item.cfp_deadline);
          new Notification('PORID - CFP Deadline Alert', {
            body: `${item.name}: ${days} day${days !== 1 ? 's' : ''} until CFP deadline`,
          });
          markNotified(item.id);
        });
      }
    });
  }
}

/**
 * Count conferences with CFP deadline within 7 days (for badge).
 */
export function getUrgentDeadlineCount(data) {
  return data.filter((item) => {
    if (!item.cfp_deadline) return false;
    const days = daysUntil(item.cfp_deadline);
    return days > 0 && days <= 7;
  }).length;
}

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

  // Check notifications at render time
  checkDeadlineNotifications(data);

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
    const iconDiv = document.createElement('div');
    iconDiv.className = 'empty-state__icon';
    iconDiv.textContent = '\u{1F393}';
    empty.appendChild(iconDiv);
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

  // All data from trusted local JSON — safe to use innerHTML
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  grid.innerHTML = items.map(renderConferenceCard).join('');
  container.textContent = '';
  container.appendChild(grid);
}
