/**
 * Funding & Grants module — renders funding opportunity cards with
 * agency badges, amounts, and deadline countdowns.
 *
 * Security note: All data rendered comes from local static JSON
 * (data/funding.json), not from user input or external sources.
 * All uses of innerHTML below render exclusively from this trusted local data.
 */

import { formatDate, daysUntil } from '../utils/date.js';

/**
 * Render a single funding card. Trusted local data.
 */
function renderFundingCard(item) {
  const days = item.deadline && item.deadline !== 'Rolling' ? daysUntil(item.deadline) : null;
  let deadlineHtml = '';
  let urgentClass = '';

  if (item.deadline === 'Rolling') {
    deadlineHtml = '<span class="cfp-badge">Rolling</span>';
  } else if (days !== null) {
    if (days <= 0) {
      deadlineHtml = '<span class="cfp-badge cfp-badge--passed">Deadline Passed</span>';
    } else if (days <= 30) {
      deadlineHtml = `<span class="cfp-badge cfp-badge--urgent">${days} days left</span>`;
      urgentClass = 'card--urgent';
    } else {
      deadlineHtml = `<span class="cfp-badge">${days} days left</span>`;
    }
  }

  return `
    <article class="card card--funding ${urgentClass}" data-id="${item.id}" data-type="funding">
      <div class="card__header">
        <span class="agency-badge">${item.agency}</span>
        <h3 class="card__title">${item.name}</h3>
        ${deadlineHtml}
      </div>
      <div class="conf-meta">
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#128176;</span>
          <span class="funding-amount">${item.amount}</span>
        </div>
        ${item.deadline && item.deadline !== 'Rolling' ? `
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#9200;</span>
          <span>Deadline: ${formatDate(item.deadline)}</span>
        </div>` : ''}
      </div>
      <div class="card__tags">
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action card__action--funding">&#8599; Apply</a>` : ''}
      </div>
    </article>
  `;
}

/**
 * Main render function for the Funding module.
 * @param {HTMLElement} container
 * @param {Object[]} data - Funding data array
 * @param {Object} filters - Active filter state
 */
export function render(container, data, filters) {
  let items = [...data];

  // Apply tag filters
  if (filters && filters.tags && !filters.tags.includes('all') && filters.tags.length > 0) {
    items = items.filter((item) =>
      (item.tags || []).some((t) => filters.tags.includes(t))
    );
  }

  // Sort by deadline soonest first; rolling deadlines go to end
  items.sort((a, b) => {
    const isRollingA = !a.deadline || a.deadline === 'Rolling';
    const isRollingB = !b.deadline || b.deadline === 'Rolling';
    if (isRollingA && isRollingB) return 0;
    if (isRollingA) return 1;
    if (isRollingB) return -1;
    const da = daysUntil(a.deadline);
    const db = daysUntil(b.deadline);
    const wa = da <= 0 ? 10000 + Math.abs(da) : da;
    const wb = db <= 0 ? 10000 + Math.abs(db) : db;
    return wa - wb;
  });

  container.textContent = '';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const iconDiv = document.createElement('div');
    iconDiv.className = 'empty-state__icon';
    iconDiv.textContent = '\uD83D\uDCB0';
    empty.appendChild(iconDiv);
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'No Funding Opportunities Found';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Check back soon for new grants and funding calls.';
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'funding-container';

  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = 'Funding & Grants';
  wrapper.appendChild(heading);

  const subtitle = document.createElement('p');
  subtitle.className = 'section-subtitle';
  subtitle.textContent = 'Research funding opportunities relevant to Operations Research';
  wrapper.appendChild(subtitle);

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  // Trusted local data from data/funding.json — innerHTML safe
  grid.innerHTML = items.map(renderFundingCard).join('');
  wrapper.appendChild(grid);

  container.appendChild(wrapper);
}
