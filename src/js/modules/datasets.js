/**
 * Resources module — curated OR benchmark instances and blogs/newsletters.
 *
 * Security: All data comes from local static JSON (data/datasets.json,
 * data/blogs.json), not from user input. innerHTML usage is safe in this
 * trusted-data context.
 */

/**
 * Render a single blog/newsletter card. Trusted local data.
 */
function renderBlogCard(item) {
  const typeLabel = item.type === 'newsletter' ? 'Newsletter' : 'Blog';
  return `
    <article class="card" data-type="blog">
      <div class="card__header">
        <h3 class="card__title">${item.name}</h3>
        <span class="version-badge">${typeLabel}</span>
      </div>
      ${item.author ? `<div class="card__author">by ${item.author}</div>` : ''}
      <p class="card__body">${item.description}</p>
      <div class="card__tags">
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Visit</a>` : ''}
      </div>
    </article>`;
}

/**
 * Renders the resources view (datasets + blogs).
 * @param {HTMLElement} container
 * @param {Object[]} data - Array of dataset objects
 * @param {Object[]} [blogs] - Array of blog/newsletter objects
 */
export function render(container, data, blogs) {
  container.textContent = '';

  const hasData = data && data.length > 0;
  const hasBlogs = blogs && blogs.length > 0;

  if (!hasData && !hasBlogs) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Resources will appear here once loaded.';
    container.appendChild(empty);
    return;
  }

  // Build HTML from trusted local data (data/datasets.json, data/blogs.json)
  let html = '<div class="datasets-container">';

  // --- Datasets & Benchmarks section ---
  if (hasData) {
    html += '<h2 class="datasets__title">Datasets &amp; Benchmarks</h2>';
    html += '<p class="datasets__subtitle">Standard OR benchmark instances and test libraries</p>';

    // Group by category
    const categories = {};
    data.forEach((d) => {
      const cat = d.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(d);
    });

    for (const [cat, items] of Object.entries(categories)) {
      html += '<div class="datasets-category">';
      html += `<h3 class="datasets-category__name">${cat}</h3>`;
      html += '<div class="card-grid">';

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
  }

  // --- Blogs & Newsletters section ---
  if (hasBlogs) {
    html += '<div class="blogs-section">';
    html += '<h3 class="blogs-section__title">Blogs &amp; Newsletters</h3>';
    html += '<p class="blogs-section__subtitle">OR-related blogs, newsletters, and community resources</p>';
    html += '<div class="card-grid">';
    blogs.forEach((b) => { html += renderBlogCard(b); });
    html += '</div></div>';
  }

  html += '</div>';
  // Trusted local data — safe to use innerHTML
  container.innerHTML = html;
}
