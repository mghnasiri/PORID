/**
 * Detail modal component — shows full item information in an overlay.
 *
 * Note: All data rendered in this modal comes from our own local JSON files
 * (data/*.json), not from user input or external sources.
 * In a production app with user-generated content, a sanitizer like
 * DOMPurify should be used before setting innerHTML.
 */

import { formatDate, daysUntil } from '../utils/date.js';
import { isWatchlisted, addToWatchlist, removeFromWatchlist, addRecentView } from '../utils/storage.js';
import { generateBibTeX, copyToClipboard } from '../utils/citation.js';

let currentItem = null;

/**
 * Escapes HTML special characters to prevent injection.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Generates metadata rows based on item type.
 */
function buildMeta(item) {
  const rows = [];

  if (item.type === 'publication') {
    if (item.authors) rows.push(['Authors', item.authors.join(', ')]);
    if (item.source) rows.push(['Source', item.source]);
    if (item.doi) rows.push(['DOI', item.doi]);
    if (item.citation_count > 0) rows.push(['Citations', `${item.citation_count}`]);
    if (item.date) rows.push(['Published', formatDate(item.date)]);
  }

  if (item.type === 'software') {
    if (item.version) rows.push(['Version', item.version]);
    if (item.date) rows.push(['Released', formatDate(item.date)]);
  }

  if (item.type === 'conference') {
    if (item.dates) rows.push(['Dates', item.dates]);
    if (item.location) rows.push(['Location', item.location]);
    if (item.cfp_deadline) {
      const days = daysUntil(item.cfp_deadline);
      const status = days > 0 ? `${formatDate(item.cfp_deadline)} (${days} days left)` : `${formatDate(item.cfp_deadline)} (passed)`;
      rows.push(['CFP Deadline', status]);
    }
  }

  if (item.type === 'opportunity') {
    if (item.institution) rows.push(['Institution', item.institution]);
    if (item.location) rows.push(['Location', item.location]);
    if (item.deadline) {
      const days = daysUntil(item.deadline);
      const status = days > 0 ? `${formatDate(item.deadline)} (${days} days left)` : `${formatDate(item.deadline)} (passed)`;
      rows.push(['Deadline', status]);
    }
  }

  return rows
    .map(
      ([label, value]) => {
        const safeLabel = escapeHtml(label);
        const safeValue = escapeHtml(value);
        return `<div class="modal-meta__row">
          <span class="modal-meta__label">${safeLabel}</span>
          <span class="modal-meta__value">${safeValue}</span>
        </div>`;
      }
    )
    .join('');
}

/**
 * Builds the modal DOM content safely.
 * @param {Object} item
 * @param {HTMLElement} container
 */
function buildModalContent(item, container) {
  // Clear previous content
  container.textContent = '';

  const starred = isWatchlisted(item.id);
  const title = item.title || item.name || 'Untitled';
  const body = item.abstract || item.changelog || '';

  // -- Header --
  const header = document.createElement('div');
  header.className = 'modal-detail__header';

  const h2 = document.createElement('h2');
  h2.className = 'modal-detail__title';
  h2.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-detail__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', hideModal);

  header.appendChild(h2);
  header.appendChild(closeBtn);
  container.appendChild(header);

  // -- Metadata (built from our own controlled JSON data) --
  const metaDiv = document.createElement('div');
  metaDiv.className = 'modal-meta';
  metaDiv.innerHTML = buildMeta(item);
  container.appendChild(metaDiv);

  // -- Body text --
  if (body) {
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'modal-detail__body';
    bodyDiv.textContent = body;
    container.appendChild(bodyDiv);
  }

  // -- Tags --
  if (item.tags && item.tags.length) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'modal-detail__tags';
    item.tags.forEach((t) => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      tagsDiv.appendChild(span);
    });
    container.appendChild(tagsDiv);
  }

  // -- Notes --
  const noteKey = `porid-note-${item.id}`;
  const noteSection = document.createElement('div');
  noteSection.className = 'modal-detail__notes';

  const noteLabel = document.createElement('label');
  noteLabel.className = 'modal-meta__label';
  noteLabel.textContent = 'Your Notes';
  noteLabel.style.marginBottom = '4px';
  noteLabel.style.display = 'block';

  const noteArea = document.createElement('textarea');
  noteArea.className = 'watchlist-note__input';
  noteArea.placeholder = 'Add a private note about this item...';
  noteArea.rows = 3;
  noteArea.value = localStorage.getItem(noteKey) || '';
  noteArea.addEventListener('input', () => {
    const val = noteArea.value.trim();
    if (val) {
      localStorage.setItem(noteKey, val);
    } else {
      localStorage.removeItem(noteKey);
    }
  });

  noteSection.appendChild(noteLabel);
  noteSection.appendChild(noteArea);
  container.appendChild(noteSection);

  // -- Actions --
  const actions = document.createElement('div');
  actions.className = 'modal-detail__actions';

  const watchBtn = document.createElement('button');
  watchBtn.className = 'modal-detail__watchlist';
  watchBtn.innerHTML = starred ? '&#9733; Remove from Watchlist' : '&#9734; Add to Watchlist';
  watchBtn.addEventListener('click', () => {
    if (isWatchlisted(item.id)) {
      removeFromWatchlist(item.id);
    } else {
      addToWatchlist(item);
    }
    showModal(item);
    window.dispatchEvent(new CustomEvent('porid:watchlist-changed'));
  });
  actions.appendChild(watchBtn);

  if (item.type === 'publication') {
    const bibtexBtn = document.createElement('button');
    bibtexBtn.className = 'modal-detail__link';
    bibtexBtn.textContent = 'Copy BibTeX';
    bibtexBtn.addEventListener('click', () => {
      const bib = generateBibTeX(item);
      copyToClipboard(bib).then(() => {
        bibtexBtn.textContent = 'Copied!';
        setTimeout(() => { bibtexBtn.textContent = 'Copy BibTeX'; }, 2000);
      });
    });
    actions.appendChild(bibtexBtn);
  }

  if (item.url) {
    const link = document.createElement('a');
    link.className = 'modal-detail__link';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.innerHTML = '&#8599; Open Link';
    actions.appendChild(link);
  }

  container.appendChild(actions);
}

/**
 * Shows the detail modal for a given item.
 * @param {Object} item
 */
export function showModal(item) {
  currentItem = item;

  // ER-05: Track this item as recently viewed
  addRecentView(item);

  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailModalContent');

  buildModalContent(item, content);

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

/**
 * Hides the detail modal.
 */
export function hideModal() {
  const modal = document.getElementById('detailModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  currentItem = null;
}

/**
 * Returns the currently displayed item, if any.
 * @returns {Object|null}
 */
export function getCurrentItem() {
  return currentItem;
}
