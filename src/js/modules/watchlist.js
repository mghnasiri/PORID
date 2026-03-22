/**
 * Watchlist module — renders saved items from localStorage.
 *
 * Security: Watchlist items originate from our own local JSON data files,
 * stored in localStorage by the user's explicit star action. The renderCard
 * function renders this trusted data.
 */

import { getWatchlist, removeFromWatchlist, exportWatchlist } from '../utils/storage.js';
import { renderCard } from '../components/card.js';

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

  const exportBtn = document.createElement('button');
  exportBtn.className = 'watchlist-toolbar__btn';
  exportBtn.textContent = '\u2913 Export JSON';
  exportBtn.addEventListener('click', () => exportWatchlist());

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
  toolbar.appendChild(exportBtn);
  toolbar.appendChild(clearBtn);

  // Trusted data from localStorage (originally from our own JSON files)
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  grid.innerHTML = items.map(renderCard).join(''); // renderCard uses trusted data

  container.textContent = '';
  container.appendChild(toolbar);
  container.appendChild(grid);
}
