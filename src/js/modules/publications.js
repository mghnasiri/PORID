/**
 * Publications module — renders publication cards with grid/list/table toggle.
 *
 * Security note: All data rendered comes from local static JSON
 * (data/publications.json). This is trusted data from our own controlled
 * source. In a production app with user-generated content, DOMPurify
 * should be used before setting innerHTML.
 */

import { relativeTime, formatDate } from '../utils/date.js';
import { isWatchlisted, getReadStatus } from '../utils/storage.js';
import { applyFilters } from '../components/filters.js';
import { renderEmptyState } from '../components/empty-state.js';
import { showModal } from '../components/modal.js';
import { generateBibTeX } from '../utils/citation.js';

let viewMode = 'grid'; // 'grid' | 'list' | 'table'
let tableSortCol = 'date';
let tableSortDir = 'desc';

/** Pagination state — limits initial render to PAGE_SIZE cards. */
const PAGE_SIZE = 50;
let currentPage = 1;

/** Maps source names to CSS modifier classes for color-coded badges. */
function sourceClass(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('arxiv')) return 'tag--source tag--source-arxiv';
  if (s.includes('ejor')) return 'tag--source tag--source-ejor';
  if (s.includes('operations research')) return 'tag--source tag--source-or';
  if (s.includes('informs') || s.includes('interfaces')) return 'tag--source tag--source-informs';
  if (s.includes('transportation') || s.includes('manufacturing')) return 'tag--source tag--source-ts';
  return 'tag--source';
}

/**
 * Truncates authors list: max 3 + "et al."
 */
function formatAuthors(authors) {
  if (!authors || authors.length === 0) return '';
  if (authors.length <= 3) return authors.join(', ');
  return authors.slice(0, 3).join(', ') + ' et al.';
}

/**
 * Truncates abstract to n chars.
 */
function snippet(text, max = 200) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

/**
 * Renders a publication card (grid mode) as HTML string.
 * Data comes exclusively from trusted local JSON files.
 */
function renderGridCard(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starSymbol = starred ? '&#9733;' : '&#9734;';
  const citedClass = item.citation_count > 50 ? ' card--cited' : '';
  const citationBadge = item.citation_count > 50 ? `<span class="citation-badge">\uD83D\uDD25 ${item.citation_count} cited</span>` : '';

  return `
    <article class="card${citedClass}" tabindex="0" data-id="${item.id}" data-type="publication">
      <div class="card__header">
        <h3 class="card__title">${item.title}</h3>
        ${citationBadge}
        <span class="card__date" title="${formatDate(item.date)}">
          ${item.citation_count > 0 ? `<span class="card__citations">${item.citation_count} cited</span> · ` : ''}${relativeTime(item.date)}
        </span>
      </div>
      <p class="card__subtitle">${formatAuthors(item.authors)}</p>
      <p class="card__body">${snippet(item.abstract, 200)}</p>
      <div class="card__tags">
        <span class="tag ${sourceClass(item.source)}">${item.source}</span>
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        <button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist" title="Toggle watchlist">${starSymbol}</button>
        <button class="card__read-status card__action" data-id="${item.id}" data-status="${getReadStatus(item.id)}" title="Reading status: ${getReadStatus(item.id)}">
          <span class="read-dot read-dot--${getReadStatus(item.id)}"></span>
        </button>
        <button class="card__cite card__action" data-id="${item.id}" aria-label="Copy BibTeX citation" title="Copy BibTeX">Cite</button>
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Open</a>` : ''}
        ${item.url && item.url.includes('arxiv.org/abs/') ? `<a href="${item.url.replace('/abs/', '/pdf/') + '.pdf'}" target="_blank" rel="noopener" class="card__action" title="Download PDF">PDF</a>` : ''}
        <button class="card__detail-btn card__action" data-id="${item.id}">Details</button>
      </div>
    </article>
  `;
}

/**
 * Renders a compact list row. Trusted local data.
 */
function renderListRow(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starSymbol = starred ? '&#9733;' : '&#9734;';

  return `
    <div class="list-row" data-id="${item.id}" data-type="publication">
      <button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist">${starSymbol}</button>
      <div class="list-row__main">
        <span class="list-row__title">${item.title}</span>
        <span class="list-row__authors">${formatAuthors(item.authors)}</span>
      </div>
      <span class="tag tag--source list-row__source">${item.source}</span>
      <span class="list-row__date">${relativeTime(item.date)}</span>
      ${item.url && item.url.includes('arxiv.org/abs/') ? `<a href="${item.url.replace('/abs/', '/pdf/') + '.pdf'}" target="_blank" rel="noopener" class="card__action" title="Download PDF">PDF</a>` : ''}
      <button class="card__detail-btn card__action" data-id="${item.id}">Details</button>
    </div>
  `;
}

/**
 * Sorts items for table view.
 */
function sortForTable(items) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    let va, vb;
    switch (tableSortCol) {
      case 'title':
        va = (a.title || '').toLowerCase();
        vb = (b.title || '').toLowerCase();
        return tableSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'authors':
        va = (a.authors || []).join(', ').toLowerCase();
        vb = (b.authors || []).join(', ').toLowerCase();
        return tableSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'source':
        va = (a.source || '').toLowerCase();
        vb = (b.source || '').toLowerCase();
        return tableSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'date':
        va = new Date(a.date || '1970-01-01');
        vb = new Date(b.date || '1970-01-01');
        return tableSortDir === 'asc' ? va - vb : vb - va;
      default:
        return 0;
    }
  });
  return sorted;
}

/**
 * Renders sortable table view. Trusted local data.
 */
function renderTable(items) {
  const sorted = sortForTable(items);
  const cols = [
    { key: 'title', label: 'Title' },
    { key: 'authors', label: 'Authors' },
    { key: 'source', label: 'Source' },
    { key: 'date', label: 'Date' },
    { key: 'tags', label: 'Tags' },
    { key: 'star', label: '\u2605' },
  ];

  const ths = cols.map((col) => {
    let cls = '';
    if (col.key === tableSortCol) {
      cls = tableSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc';
    }
    const sortable = ['title', 'authors', 'source', 'date'].includes(col.key);
    return `<th class="${cls}" ${sortable ? `data-sort="${col.key}"` : ''}>${col.label}</th>`;
  }).join('');

  const rows = sorted.map((item) => {
    const starred = isWatchlisted(item.id);
    const starSymbol = starred ? '&#9733;' : '&#9734;';
    const starClass = starred ? 'card__star--active' : '';
    const tags = (item.tags || []).map((t) => `<span class="tag">${t}</span>`).join(' ');

    return `
      <tr class="table-view__row" data-id="${item.id}">
        <td class="table-view__title">${item.title}${item.url && item.url.includes('arxiv.org/abs/') ? ` <a href="${item.url.replace('/abs/', '/pdf/') + '.pdf'}" target="_blank" rel="noopener" class="card__action" title="Download PDF">PDF</a>` : ''}</td>
        <td>${formatAuthors(item.authors)}</td>
        <td><span class="tag ${sourceClass(item.source)}">${item.source}</span></td>
        <td>${item.date ? formatDate(item.date) : ''}</td>
        <td>${tags}</td>
        <td><button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist">${starSymbol}</button></td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-view-wrapper">
      <table class="table-view">
        <thead><tr>${ths}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Renders the view toggle buttons.
 */
function renderViewToggle(filteredData) {
  // ER-01: Reading progress stats
  const progressHTML = buildReadingProgressHTML(filteredData);

  return `
    <div class="view-toggle" style="display:flex;align-items:center;gap:var(--space-sm);width:100%">
      <button class="view-toggle__btn ${viewMode === 'grid' ? 'active' : ''}" data-view="grid" aria-label="Grid view" title="Grid view">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
      </button>
      <button class="view-toggle__btn ${viewMode === 'list' ? 'active' : ''}" data-view="list" aria-label="List view" title="List view">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/><rect x="1" y="11.5" width="14" height="2.5" rx="1"/></svg>
      </button>
      <button class="view-toggle__btn ${viewMode === 'table' ? 'active' : ''}" data-view="table" aria-label="Table view" title="Table view">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="2" rx="0.5"/><rect x="1" y="5" width="14" height="1" rx="0.3" opacity="0.5"/><rect x="1" y="8" width="14" height="1" rx="0.3" opacity="0.5"/><rect x="1" y="11" width="14" height="1" rx="0.3" opacity="0.5"/><rect x="1" y="14" width="14" height="1" rx="0.3" opacity="0.5"/><rect x="5" y="1" width="0.5" height="14" opacity="0.3"/><rect x="10" y="1" width="0.5" height="14" opacity="0.3"/></svg>
      </button>
      ${progressHTML}
      <select class="filter-select" id="exportBtn" style="margin-left:auto">
        <option value="">Export...</option>
        <option value="bibtex">BibTeX (.bib)</option>
        <option value="csv">CSV (.csv)</option>
        <option value="json">JSON (.json)</option>
      </select>
    </div>
  `;
}

/**
 * ER-01: Builds reading progress bar HTML.
 * Counts read/reading/unread across filtered publications.
 */
function buildReadingProgressHTML(data) {
  if (!data || data.length === 0) return '';
  let readCount = 0;
  let readingCount = 0;
  data.forEach(item => {
    const status = getReadStatus(item.id);
    if (status === 'read') readCount++;
    else if (status === 'reading') readingCount++;
  });
  const total = data.length;
  const pct = total > 0 ? Math.round((readCount / total) * 100) : 0;
  return `
    <div class="pub-progress" title="${readCount} read, ${readingCount} reading, ${total - readCount - readingCount} unread">
      <div class="pub-progress__bar">
        <div class="pub-progress__fill" style="width:${pct}%"></div>
      </div>
      <span class="pub-progress__label">${pct}% read</span>
    </div>
  `;
}

/**
 * Triggers a file download via Blob URL.
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports filtered items in the specified format.
 */
function exportItems(items, format) {
  const dateStr = new Date().toISOString().slice(0, 10);
  if (format === 'bibtex') {
    const bib = items.map((item) => generateBibTeX(item)).join('\n\n');
    downloadFile(bib, `porid-publications-${dateStr}.bib`, 'application/x-bibtex');
  } else if (format === 'csv') {
    const headers = ['title', 'authors', 'date', 'source', 'url', 'doi', 'tags'];
    const rows = items.map((item) =>
      headers.map((h) => {
        let val = item[h];
        if (Array.isArray(val)) val = val.join('; ');
        val = String(val || '').replace(/"/g, '""');
        return `"${val}"`;
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    downloadFile(csv, `porid-publications-${dateStr}.csv`, 'text/csv');
  } else if (format === 'json') {
    downloadFile(JSON.stringify(items, null, 2), `porid-publications-${dateStr}.json`, 'application/json');
  }
}

/**
 * DF-03: Builds a summary statistics bar showing counts for the current view.
 * @param {Object[]} filtered - The filtered items array.
 * @param {Object[]} allData - The full unfiltered data array.
 * @returns {string} HTML string for the summary bar.
 */
function buildSummaryBar(filtered, allData) {
  const total = allData.length;
  const showing = filtered.length;

  // Count items from the last 7 days
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = filtered.filter(item => {
    if (!item.date) return false;
    return new Date(item.date + 'T00:00:00').getTime() > weekAgo;
  }).length;

  // Count unique sources
  const sources = new Set(filtered.map(item => item.source).filter(Boolean));

  return `<p class="stats-summary-bar">Showing ${showing} of ${total} publications \u00b7 ${newThisWeek} new this week \u00b7 ${sources.size} source${sources.size !== 1 ? 's' : ''}</p>`;
}

/**
 * Main render function for the publications module.
 * @param {HTMLElement} container - The #content element.
 * @param {Object[]} data - Raw publications array (trusted local JSON).
 * @param {Object} filters - Active filter state from getActiveFilters().
 */
export function render(container, data, filters) {
  // Reset page when filters change (caller re-invokes render on filter change)
  currentPage = 1;
  renderPage(container, data, filters);
}

/**
 * Internal renderer that respects pagination state.
 * Grid and list views are paginated (PAGE_SIZE per page); table view shows all.
 */
function renderPage(container, data, filters) {
  const filtered = applyFilters(data, filters);

  if (filtered.length === 0) {
    renderEmptyState(container, { module: 'publications', filters, totalCount: data.length });
    return;
  }

  const toggle = renderViewToggle(filtered);

  // DF-03: Per-view statistics summary bar
  const summaryBar = buildSummaryBar(filtered, data);

  // Determine the visible slice for grid/list (table always shows all)
  const isTableMode = viewMode === 'table';
  const visibleCount = isTableMode ? filtered.length : currentPage * PAGE_SIZE;
  const visible = isTableMode ? filtered : filtered.slice(0, visibleCount);
  const hasMore = !isTableMode && visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  // Build "Load more" button via DOM methods
  const loadMoreFrag = document.createDocumentFragment();
  if (hasMore) {
    const loadMoreDiv = document.createElement('div');
    loadMoreDiv.className = 'load-more-wrapper';
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.id = 'pubLoadMore';
    loadMoreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} remaining)`;
    loadMoreDiv.appendChild(loadMoreBtn);
    loadMoreFrag.appendChild(loadMoreDiv);
  }

  // Trusted local data — innerHTML is safe in this context
  const wrapper = document.createElement('div');
  if (isTableMode) {
    wrapper.innerHTML = `${toggle}${summaryBar}${renderTable(filtered)}`;
  } else if (viewMode === 'list') {
    wrapper.innerHTML = `${toggle}${summaryBar}<div class="list-view">${visible.map(renderListRow).join('')}</div>`;
  } else {
    wrapper.innerHTML = `${toggle}${summaryBar}<div class="card-grid">${visible.map(renderGridCard).join('')}</div>`;
  }
  container.textContent = '';
  while (wrapper.firstChild) {
    container.appendChild(wrapper.firstChild);
  }
  // Append load-more button after content (built with DOM methods)
  if (hasMore) {
    container.appendChild(loadMoreFrag);
  }

  // Wire "Load more" button
  const loadMoreEl = container.querySelector('#pubLoadMore');
  if (loadMoreEl) {
    loadMoreEl.addEventListener('click', () => {
      currentPage += 1;
      renderPage(container, data, filters);
    });
  }

  // Wire view toggle clicks
  container.querySelectorAll('.view-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.view;
      currentPage = 1;
      renderPage(container, data, filters);
    });
  });

  // Wire export dropdown
  const exportSelect = container.querySelector('#exportBtn');
  if (exportSelect) {
    exportSelect.addEventListener('change', () => {
      const format = exportSelect.value;
      if (format) {
        exportItems(filtered, format);
        exportSelect.value = '';
      }
    });
  }

  // Wire table sort headers
  if (isTableMode) {
    container.querySelectorAll('.table-view th[data-sort]').forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (tableSortCol === col) {
          tableSortDir = tableSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          tableSortCol = col;
          tableSortDir = 'asc';
        }
        renderPage(container, data, filters);
      });
    });

    // Wire table row clicks to open detail modal
    container.querySelectorAll('.table-view__row').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', (e) => {
        // Don't open modal if clicking the star button
        if (e.target.closest('.card__star')) return;
        const id = row.dataset.id;
        const item = filtered.find((i) => i.id === id);
        if (item) showModal(item);
      });
    });
  }
}
