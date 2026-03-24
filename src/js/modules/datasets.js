/**
 * Datasets & Benchmarks module — curated OR benchmark instances.
 *
 * Security: All data comes from local static JSON (data/datasets.json),
 * not from user input. innerHTML usage is safe in this context.
 */

/**
 * Renders the datasets view.
 * @param {HTMLElement} container
 * @param {Object[]} data - Array of dataset objects
 */
export function render(container, data) {
  container.textContent = '';

  if (!data || data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Benchmark datasets will appear here once loaded.';
    container.appendChild(empty);
    return;
  }

  // Group by category
  const categories = {};
  data.forEach((d) => {
    const cat = d.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(d);
  });

  // Trusted local data rendering
  let html = '<div class="datasets-container">';
  html += '<h2 class="datasets__title">Datasets &amp; Benchmarks</h2>';
  html += '<p class="datasets__subtitle">Standard OR benchmark instances and test libraries</p>';

  for (const [cat, items] of Object.entries(categories)) {
    html += `<div class="datasets-category">`;
    html += `<h3 class="datasets-category__name">${cat}</h3>`;
    html += `<div class="card-grid">`;

    items.forEach((d) => {
      const instancesLabel = d.instances > 0 ? `<span class="datasets__instances">${d.instances.toLocaleString()} instances</span>` : '';
      html += `
        <article class="card" data-type="dataset">
          <div class="card__header">
            <h3 class="card__title">${d.name}</h3>
            ${instancesLabel}
          </div>
          <p class="card__body">${d.description}</p>
          <div class="card__tags">
            ${(d.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
          </div>
          <div class="card__actions">
            ${d.url ? `<a href="${d.url}" target="_blank" rel="noopener" class="card__action">&#8599; Visit Library</a>` : ''}
          </div>
        </article>`;
    });

    html += '</div></div>';
  }

  html += '</div>';
  container.innerHTML = html;
}
