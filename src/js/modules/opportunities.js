/**
 * Opportunities module — renders academic position cards with type badges.
 *
 * Security: All data rendered comes from local static JSON (data/opportunities.json).
 */

import { formatDate, daysUntil } from '../utils/date.js';
import { isWatchlisted, hasNote } from '../utils/storage.js';
import { renderEmptyState } from '../components/empty-state.js';
import { renderAlertBuilder, addAlertRule, deleteAlertRule, getAlertRules } from './opportunity-alerts.js';

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
        <button class="card__note-btn card__action${hasNote(item.id) ? ' card__note-btn--has-note' : ''}" data-id="${item.id}" aria-label="Add note" title="Add note">&#9998;${hasNote(item.id) ? '<span class="card__note-badge"></span>' : ''}</button>
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Apply</a>` : ''}
        <button class="card__detail-btn card__action" data-id="${item.id}">Details</button>
      </div>
      <div class="card__note-area" data-id="${item.id}" style="display:none;">
        <textarea class="card__note-input" data-id="${item.id}" placeholder="Add a note..." rows="2"></textarea>
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
    renderEmptyState(container, { module: 'opportunities', filters, totalCount: data.length });
    return;
  }

  // Alert builder panel (NF-05) — trusted template from our own code
  const alertHtml = renderAlertBuilder();

  // Trusted local data from static JSON files
  container.innerHTML = alertHtml + `<div class="card-grid">${items.map(renderOpportunityCard).join('')}</div>`;

  // Wire alert builder events
  wireAlertBuilderEvents(container, data, filters);
}

/**
 * Wires event listeners for the alert builder panel.
 */
function wireAlertBuilderEvents(container, data, filters) {
  const toggle = container.querySelector('#alertBuilderToggle');
  const body = container.querySelector('#alertBuilderBody');
  if (toggle && body) {
    toggle.addEventListener('click', () => {
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
    });
  }

  const addBtn = container.querySelector('#alertAddRule');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const typeEl = container.querySelector('#alertType');
      const geoEl = container.querySelector('#alertGeo');
      const subfieldEl = container.querySelector('#alertSubfield');
      const type = typeEl ? typeEl.value : '';
      const geography = geoEl ? geoEl.value.trim() : '';
      const subfield = subfieldEl ? subfieldEl.value.trim() : '';

      if (!type && !geography && !subfield) return;

      addAlertRule({ type, geography, subfield });
      // Re-render to show updated rules
      render(container, data, filters);
    });
  }

  container.querySelectorAll('.alert-rule__delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ruleId = btn.dataset.deleteRule;
      deleteAlertRule(ruleId);
      render(container, data, filters);
    });
  });
}
