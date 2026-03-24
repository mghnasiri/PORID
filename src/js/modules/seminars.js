/**
 * Seminars & Webinars module — curated list of recurring OR seminar series.
 *
 * Security note: All data rendered comes from local static JSON
 * (data/seminars.json). This is trusted data from our own controlled
 * source, not user input. innerHTML usage is safe in this context.
 */

const FORMAT_ICONS = { online: '\uD83C\uDF10', 'in-person': '\uD83D\uDCCD', hybrid: '\uD83D\uDD04' };

/**
 * Renders the seminars view.
 * @param {HTMLElement} container
 * @param {Object[]} data
 */
export function render(container, data) {
  container.textContent = '';

  if (!data || data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Seminar series will appear here once loaded.';
    container.appendChild(empty);
    return;
  }

  const seminars = data.filter((d) => d.type === 'seminar');
  const schools = data.filter((d) => d.type === 'school');

  // Trusted local data rendering
  let html = '<div class="seminars-container">';
  html += '<h2 class="datasets__title">Seminars &amp; Webinars</h2>';
  html += '<p class="datasets__subtitle">Recurring OR seminar series and intensive programs</p>';

  if (seminars.length) {
    html += '<h3 class="datasets-category__name">Recurring Seminar Series</h3>';
    html += '<div class="card-grid">';
    seminars.forEach((s) => { html += renderCard(s); });
    html += '</div>';
  }

  if (schools.length) {
    html += '<h3 class="datasets-category__name" style="margin-top:var(--space-xl)">Schools &amp; Intensive Programs</h3>';
    html += '<div class="card-grid">';
    schools.forEach((s) => { html += renderCard(s); });
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderCard(item) {
  const icon = FORMAT_ICONS[item.format] || '';
  const tags = (item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');

  return `
    <article class="card" data-type="seminar">
      <div class="card__header">
        <h3 class="card__title">${item.name}</h3>
      </div>
      <div class="conf-meta">
        <div class="conf-meta__row"><span class="conf-meta__icon">\uD83D\uDCC5</span><span>${item.frequency}</span></div>
        <div class="conf-meta__row"><span class="conf-meta__icon">${icon}</span><span>${item.format}</span></div>
      </div>
      <p class="card__body">${item.description}</p>
      <div class="card__tags">${tags}</div>
      <div class="card__actions">
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Visit</a>` : ''}
      </div>
    </article>`;
}
