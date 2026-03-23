/**
 * Watchlist module — renders saved items from localStorage.
 *
 * Security: Watchlist items originate from our own local JSON data files,
 * stored in localStorage by the user's explicit star action. The renderCard
 * function renders this trusted data. All innerHTML usage renders only
 * data from our controlled local JSON sources.
 */

import { getWatchlist, removeFromWatchlist, exportWatchlist } from '../utils/storage.js';
import { renderCard } from '../components/card.js';
import { generateBibTeX } from '../utils/citation.js';

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

  const exportBibBtn = document.createElement('button');
  exportBibBtn.className = 'watchlist-toolbar__btn';
  exportBibBtn.textContent = '\u2913 Export BibTeX';
  exportBibBtn.addEventListener('click', () => exportBibTeX(items));

  const exportCsvBtn = document.createElement('button');
  exportCsvBtn.className = 'watchlist-toolbar__btn';
  exportCsvBtn.textContent = '\u2913 Export CSV';
  exportCsvBtn.addEventListener('click', () => exportCSV(items));

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
  toolbar.appendChild(exportCsvBtn);
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
