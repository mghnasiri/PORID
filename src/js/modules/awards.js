/**
 * Awards & Prizes module — renders award cards with organization badges,
 * deadline countdowns, and descriptions.
 *
 * Security note: All data rendered comes from local static JSON
 * (data/awards.json), not from user input or external sources.
 * All uses of innerHTML below render exclusively from this trusted local data.
 */

import { formatDate, daysUntil } from '../utils/date.js';
import { renderEmptyState } from '../components/empty-state.js';

/**
 * Render a single award card. Trusted local data.
 */
function renderAwardCard(item) {
  const days = item.deadline ? daysUntil(item.deadline) : null;
  let deadlineHtml = '';

  if (days !== null) {
    if (days <= 0) {
      deadlineHtml = '<span class="cfp-badge cfp-badge--passed">Deadline Passed</span>';
    } else if (days <= 30) {
      deadlineHtml = `<span class="cfp-badge cfp-badge--urgent">${days} days left</span>`;
    } else {
      deadlineHtml = `<span class="cfp-badge">${days} days to deadline</span>`;
    }
  }

  return `
    <article class="card card--award" data-id="${item.id}" data-type="award">
      <div class="card__header">
        <span class="org-badge">${item.organization}</span>
        <h3 class="card__title">${item.name}</h3>
        ${deadlineHtml}
      </div>
      <div class="conf-meta">
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#127942;</span>
          <span>${item.organization}</span>
        </div>
        ${item.deadline ? `
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#9200;</span>
          <span>Deadline: ${formatDate(item.deadline)}</span>
        </div>` : ''}
      </div>
      <p class="card__body">${item.description}</p>
      <div class="card__tags">
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Details</a>` : ''}
      </div>
    </article>
  `;
}

/**
 * Main render function for the Awards module.
 * @param {HTMLElement} container
 * @param {Object[]} data - Awards data array
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

  // Sort by deadline soonest first
  items.sort((a, b) => {
    const da = a.deadline ? new Date(a.deadline) : new Date('9999-12-31');
    const db = b.deadline ? new Date(b.deadline) : new Date('9999-12-31');
    return da - db;
  });

  container.textContent = '';

  if (items.length === 0) {
    renderEmptyState(container, { module: 'awards', filters, totalCount: data.length });
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'awards-container';

  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = 'Awards & Prizes';
  wrapper.appendChild(heading);

  const subtitle = document.createElement('p');
  subtitle.className = 'section-subtitle';
  subtitle.textContent = 'Major OR awards and nomination deadlines';
  wrapper.appendChild(subtitle);

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  // Trusted local data from data/awards.json — innerHTML safe
  grid.innerHTML = items.map(renderAwardCard).join('');
  wrapper.appendChild(grid);

  container.appendChild(wrapper);
}
