/**
 * Resources module — OR blogs, newsletters, podcasts, courses, communities.
 *
 * Security note: All data rendered comes from local static JSON
 * (data/resources.json), not from user input or external sources.
 * All uses of innerHTML below render exclusively from this trusted local data.
 */

import { renderEmptyState } from '../components/empty-state.js';

const CATEGORY_ICONS = {
  blog: '\uD83D\uDCDD',
  newsletter: '\uD83D\uDCF0',
  podcast: '\uD83C\uDF99\uFE0F',
  course: '\uD83C\uDF93',
  community: '\uD83D\uDCAC',
  video: '\uD83C\uDFA5',
};

const CATEGORY_ORDER = ['blog', 'newsletter', 'podcast', 'video', 'course', 'community'];

/**
 * Render a single resource card. Trusted local data.
 */
function renderResourceCard(item) {
  const icon = CATEGORY_ICONS[item.category] || '\uD83D\uDCCC';
  const categoryLabel = (item.category || 'resource').charAt(0).toUpperCase() + (item.category || 'resource').slice(1);

  return `
    <article class="card card--resource" data-id="${item.id}" data-type="resource">
      <div class="card__header">
        <span class="resource-icon">${icon}</span>
        <h3 class="card__title">${item.name}</h3>
        <span class="resource-category-badge">${categoryLabel}</span>
      </div>
      <p class="card__body">${item.description}</p>
      <div class="card__tags">
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Visit</a>` : ''}
      </div>
    </article>
  `;
}

/**
 * Main render function for the Resources module.
 * @param {HTMLElement} container
 * @param {Object[]} data - Resources data array
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

  container.textContent = '';

  if (items.length === 0) {
    renderEmptyState(container, { module: 'resources', filters, totalCount: data.length });
    return;
  }

  // Group by category
  const groups = {};
  items.forEach((item) => {
    const cat = item.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'resources-container';

  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = 'OR Resources';
  wrapper.appendChild(heading);

  const subtitle = document.createElement('p');
  subtitle.className = 'section-subtitle';
  subtitle.textContent = 'Blogs, newsletters, podcasts, courses, and community resources';
  wrapper.appendChild(subtitle);

  // Render each category group in defined order
  const sortedCats = CATEGORY_ORDER.filter((c) => groups[c]);
  Object.keys(groups).forEach((c) => {
    if (!sortedCats.includes(c)) sortedCats.push(c);
  });

  let html = '';
  sortedCats.forEach((cat) => {
    const icon = CATEGORY_ICONS[cat] || '\uD83D\uDCCC';
    const label = cat.charAt(0).toUpperCase() + cat.slice(1) + 's';
    html += `<div class="resources-category">`;
    html += `<h3 class="resources-category__name">${icon} ${label}</h3>`;
    html += `<div class="card-grid">`;
    groups[cat].forEach((item) => {
      html += renderResourceCard(item);
    });
    html += `</div></div>`;
  });

  const contentDiv = document.createElement('div');
  // Trusted local data from data/resources.json — innerHTML safe
  contentDiv.innerHTML = html;
  wrapper.appendChild(contentDiv);

  container.appendChild(wrapper);
}
