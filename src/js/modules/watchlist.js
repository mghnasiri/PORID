/**
 * Watchlist module — renders saved items from localStorage.
 *
 * Security: Watchlist items originate from our own local JSON data files,
 * stored in localStorage by the user's explicit star action. The renderCard
 * function renders this trusted data. All innerHTML usage renders only
 * data from our controlled local JSON sources.
 */

import { getWatchlist, removeFromWatchlist, exportWatchlist, addToWatchlist } from '../utils/storage.js';
import { renderCard } from '../components/card.js';
import { generateBibTeX, generateRIS, deduplicateByDOI, downloadFile, generateZoteroRDF, generateBookmarkHTML } from '../utils/citation.js';

const NOTES_KEY = 'porid-watchlist-notes';

function getNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setNote(id, text) {
  const notes = getNotes();
  if (text.trim()) {
    notes[id] = text;
  } else {
    delete notes[id];
  }
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

function getNote(id) {
  return getNotes()[id] || '';
}

/**
 * Export all publication-type watchlisted items as a .bib file.
 */
function exportBibTeX(items) {
  const pubs = items.filter((i) => i.type === 'publication');
  if (pubs.length === 0) return;
  const content = pubs.map(generateBibTeX).join('\n\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `porid-watchlist-${new Date().toISOString().slice(0, 10)}.bib`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all publication-type watchlisted items as a .ris file.
 */
function exportRIS(items) {
  const pubs = items.filter((i) => i.type === 'publication');
  if (pubs.length === 0) return;
  const content = pubs.map(generateRIS).join('\n\n');
  downloadFile(content, `porid-watchlist-${new Date().toISOString().slice(0, 10)}.ris`, 'application/x-research-info-systems');
}

/**
 * Export all watchlisted items as a CSV file.
 */
function exportCSV(items) {
  if (items.length === 0) return;
  const headers = ['id', 'type', 'title', 'authors', 'source', 'date', 'url', 'tags'];
  const rows = items.map((item) => {
    return [
      item.id || '',
      item.type || '',
      (item.title || item.name || '').replace(/"/g, '""'),
      (item.authors || []).join('; '),
      item.source || '',
      item.date || '',
      item.url || '',
      (item.tags || []).join('; '),
    ].map((v) => `"${v}"`).join(',');
  });
  const content = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `porid-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * SC-07: Export watchlisted items as a self-contained HTML reading list.
 */
function exportHTML(items) {
  if (items.length === 0) return;
  const dateStr = new Date().toISOString().slice(0, 10);
  const notes = getNotes();

  const itemsHtml = items.map(item => {
    const title = item.title || item.name || 'Untitled';
    const authors = (item.authors || []).join(', ');
    const tags = (item.tags || []).map(t => `<span style="display:inline-block;padding:2px 8px;margin:2px;border-radius:10px;background:#eef2ff;color:#4338ca;font-size:0.75rem;">${t}</span>`).join('');
    const note = notes[item.id] ? `<blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #c5a059;background:#fafaf5;color:#555;font-style:italic;">${notes[item.id]}</blockquote>` : '';

    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;">
        <h3 style="margin:0 0 4px;">
          ${item.url ? `<a href="${item.url}" style="color:#1e40af;text-decoration:none;">${title}</a>` : title}
        </h3>
        ${authors ? `<p style="margin:0 0 4px;color:#6b7280;font-size:0.9rem;">${authors}</p>` : ''}
        ${item.source ? `<p style="margin:0 0 4px;color:#9ca3af;font-size:0.8rem;">${item.source} ${item.date ? '&middot; ' + item.date : ''}</p>` : ''}
        ${tags ? `<div style="margin:4px 0;">${tags}</div>` : ''}
        ${note}
      </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PORID Reading List — ${dateStr}</title>
  <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#1f2937;background:#fff;}</style>
</head>
<body>
  <h1>PORID Reading List</h1>
  <p style="color:#6b7280;">Exported on ${dateStr} &middot; ${items.length} item${items.length !== 1 ? 's' : ''}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
  ${itemsHtml}
  <footer style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:0.8rem;">
    Generated by <a href="https://mghnasiri.github.io/PORID/" style="color:#4338ca;">PORID</a>
  </footer>
</body>
</html>`;

  downloadFile(html, `porid-reading-list-${dateStr}.html`, 'text/html');
}

/**
 * SC-07: Export watchlisted items as a Markdown reading list.
 */
function exportMarkdown(items) {
  if (items.length === 0) return;
  const dateStr = new Date().toISOString().slice(0, 10);
  const notes = getNotes();

  const lines = [
    `# PORID Reading List`,
    ``,
    `*Exported on ${dateStr} — ${items.length} item${items.length !== 1 ? 's' : ''}*`,
    ``,
    `---`,
    ``,
  ];

  items.forEach((item, i) => {
    const title = item.title || item.name || 'Untitled';
    const authors = (item.authors || []).join(', ');
    const tags = (item.tags || []).map(t => `\`${t}\``).join(' ');
    const note = notes[item.id];

    lines.push(`## ${i + 1}. ${item.url ? `[${title}](${item.url})` : title}`);
    if (authors) lines.push(`**Authors:** ${authors}`);
    if (item.source || item.date) {
      const parts = [];
      if (item.source) parts.push(item.source);
      if (item.date) parts.push(item.date);
      lines.push(`*${parts.join(' · ')}*`);
    }
    if (tags) lines.push(`Tags: ${tags}`);
    if (note) {
      lines.push(``);
      lines.push(`> ${note}`);
    }
    lines.push(``);
  });

  lines.push(`---`);
  lines.push(`*Generated by [PORID](https://mghnasiri.github.io/PORID/)*`);

  const content = lines.join('\n');
  downloadFile(content, `porid-reading-list-${dateStr}.md`, 'text/markdown');
}

/**
 * R4-02: Export watchlisted items as Zotero RDF.
 */
function exportZotero(items) {
  const pubs = items.filter((i) => i.type === 'publication');
  if (pubs.length === 0) return;
  const content = generateZoteroRDF(pubs);
  downloadFile(content, `porid-watchlist-${new Date().toISOString().slice(0, 10)}.rdf`, 'application/rdf+xml');
}

/**
 * R4-03: Export watchlisted items as Netscape Bookmark HTML.
 */
function exportBookmarks(items) {
  if (items.length === 0) return;
  const content = generateBookmarkHTML(items);
  downloadFile(content, `porid-bookmarks-${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
}

/**
 * R4-05: Import items from a JSON-LD / JSON file into the watchlist.
 * Validates that each item has id, title, and url. Merges into existing watchlist.
 * @param {HTMLElement} container - For re-rendering after import
 */
function importFromJSON(container) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json,application/ld+json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let data = JSON.parse(reader.result);
        // Support both array and { @graph: [...] } JSON-LD
        if (!Array.isArray(data)) data = data['@graph'] || data.items || [];
        const existing = new Set(getWatchlist().map(i => i.id));
        let imported = 0;
        data.forEach(item => {
          if (!item.id || !item.title || !item.url) return;
          if (existing.has(item.id)) return;
          addToWatchlist(item);
          imported++;
        });
        showImportToast(imported);
        render(container);
        window.dispatchEvent(new CustomEvent('porid:watchlist-changed'));
      } catch {
        showImportToast(-1); // error
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function showImportToast(count) {
  const msg = count < 0 ? 'Import failed: invalid JSON' : `Imported ${count} item${count !== 1 ? 's' : ''} to watchlist`;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('toast--visible'), 10);
  setTimeout(() => { toast.classList.remove('toast--visible'); setTimeout(() => toast.remove(), 300); }, 2500);
}

/**
 * Renders the watchlist view.
 * @param {HTMLElement} container
 */
export function render(container) {
  const items = getWatchlist();

  if (items.length === 0) {
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const icon = document.createElement('div');
    icon.className = 'empty-state__icon';
    icon.textContent = '\u2606';

    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'Your Watchlist is Empty';

    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Star items from any section to save them here.';

    empty.appendChild(icon);
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  // Build toolbar with DOM methods
  const toolbar = document.createElement('div');
  toolbar.className = 'watchlist-toolbar';

  const count = document.createElement('span');
  count.className = 'watchlist-toolbar__count';
  count.textContent = `${items.length} saved item${items.length !== 1 ? 's' : ''}`;

  const exportJsonBtn = document.createElement('button');
  exportJsonBtn.className = 'watchlist-toolbar__btn';
  exportJsonBtn.textContent = '\u2913 Export JSON';
  exportJsonBtn.addEventListener('click', () => exportWatchlist());

  // Dedup checkbox (defined early so export buttons can reference it)
  const dedupLabel = document.createElement('label');
  dedupLabel.className = 'watchlist-toolbar__dedup';
  dedupLabel.title = 'Remove entries with duplicate DOIs before export';
  const dedupCb = document.createElement('input');
  dedupCb.type = 'checkbox';
  dedupCb.id = 'watchlistDedup';
  dedupLabel.appendChild(dedupCb);
  dedupLabel.appendChild(document.createTextNode(' Dedup'));

  const getExportItems = () => dedupCb.checked ? deduplicateByDOI(items) : items;

  const exportBibBtn = document.createElement('button');
  exportBibBtn.className = 'watchlist-toolbar__btn';
  exportBibBtn.textContent = '\u2913 Export BibTeX';
  exportBibBtn.addEventListener('click', () => exportBibTeX(getExportItems()));

  const exportRisBtn = document.createElement('button');
  exportRisBtn.className = 'watchlist-toolbar__btn';
  exportRisBtn.textContent = '\u2913 Export RIS';
  exportRisBtn.addEventListener('click', () => exportRIS(getExportItems()));

  const exportCsvBtn = document.createElement('button');
  exportCsvBtn.className = 'watchlist-toolbar__btn';
  exportCsvBtn.textContent = '\u2913 Export CSV';
  exportCsvBtn.addEventListener('click', () => exportCSV(getExportItems()));

  // SC-07: Export HTML button
  const exportHtmlBtn = document.createElement('button');
  exportHtmlBtn.className = 'watchlist-toolbar__btn';
  exportHtmlBtn.textContent = '\u2913 Export HTML';
  exportHtmlBtn.addEventListener('click', () => exportHTML(getExportItems()));

  // SC-07: Export Markdown button
  const exportMdBtn = document.createElement('button');
  exportMdBtn.className = 'watchlist-toolbar__btn';
  exportMdBtn.textContent = '\u2913 Export Markdown';
  exportMdBtn.addEventListener('click', () => exportMarkdown(getExportItems()));

  // R4-02: Export Zotero RDF button
  const exportZoteroBtn = document.createElement('button');
  exportZoteroBtn.className = 'watchlist-toolbar__btn';
  exportZoteroBtn.textContent = '\u2913 Export Zotero';
  exportZoteroBtn.addEventListener('click', () => exportZotero(getExportItems()));

  // R4-03: Export Bookmarks button
  const exportBookmarkBtn = document.createElement('button');
  exportBookmarkBtn.className = 'watchlist-toolbar__btn';
  exportBookmarkBtn.textContent = '\u2913 Export Bookmarks';
  exportBookmarkBtn.addEventListener('click', () => exportBookmarks(getExportItems()));

  // R4-05: Import JSON button
  const importBtn = document.createElement('button');
  importBtn.className = 'watchlist-toolbar__btn';
  importBtn.textContent = '\u2912 Import';
  importBtn.addEventListener('click', () => importFromJSON(container));

  const clearBtn = document.createElement('button');
  clearBtn.className = 'watchlist-toolbar__btn watchlist-toolbar__btn--danger';
  clearBtn.textContent = '\u2717 Clear All';
  clearBtn.addEventListener('click', () => {
    if (confirm('Remove all items from your watchlist?')) {
      const all = getWatchlist();
      all.forEach((item) => removeFromWatchlist(item.id));
      render(container);
      window.dispatchEvent(new CustomEvent('porid:watchlist-changed'));
    }
  });

  toolbar.appendChild(count);
  toolbar.appendChild(exportJsonBtn);
  toolbar.appendChild(exportBibBtn);
  toolbar.appendChild(exportRisBtn);
  toolbar.appendChild(exportCsvBtn);
  toolbar.appendChild(exportHtmlBtn);
  toolbar.appendChild(exportMdBtn);
  toolbar.appendChild(exportZoteroBtn);
  toolbar.appendChild(exportBookmarkBtn);
  toolbar.appendChild(dedupLabel);
  toolbar.appendChild(importBtn);
  toolbar.appendChild(clearBtn);

  // Build grid with cards + note areas using DOM methods
  const grid = document.createElement('div');
  grid.className = 'card-grid';

  items.forEach((item) => {
    // Card wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'watchlist-card-wrapper';
    // renderCard returns trusted HTML from local JSON data
    const cardDiv = document.createElement('div');
    cardDiv.innerHTML = renderCard(item);
    while (cardDiv.firstChild) {
      wrapper.appendChild(cardDiv.firstChild);
    }

    // Note area
    const noteDiv = document.createElement('div');
    noteDiv.className = 'watchlist-note';

    const textarea = document.createElement('textarea');
    textarea.className = 'watchlist-note__input';
    textarea.placeholder = 'Add a note...';
    textarea.rows = 2;
    textarea.value = getNote(item.id);
    textarea.addEventListener('change', () => setNote(item.id, textarea.value));
    textarea.addEventListener('blur', () => setNote(item.id, textarea.value));

    noteDiv.appendChild(textarea);
    wrapper.appendChild(noteDiv);
    grid.appendChild(wrapper);
  });

  container.textContent = '';
  container.appendChild(toolbar);
  container.appendChild(grid);
}
