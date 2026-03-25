/**
 * Card component — renders a single data item as an HTML card string.
 */

import { relativeTime, formatDate, daysUntil } from '../utils/date.js';
import { isWatchlisted } from '../utils/storage.js';
import { generateBibTeX, copyToClipboard } from '../utils/citation.js';

/**
 * Maps source names to CSS modifier classes for color-coded badges.
 */
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
 * Renders tag pills HTML from an array of tag strings.
 */
function renderTags(tags) {
  return tags
    .map((t) => `<span class="tag">${t}</span>`)
    .join('');
}

/**
 * Builds the subtitle line based on item type.
 */
function getSubtitle(item) {
  switch (item.type) {
    case 'publication':
      return item.authors ? item.authors.join(', ') : '';
    case 'software':
      return `v${item.version}`;
    case 'conference':
      return `${item.location} · ${item.dates}`;
    case 'opportunity':
      return `${item.institution} · ${item.location}`;
    default:
      return '';
  }
}

/**
 * Builds the date / deadline display.
 */
function getDateDisplay(item) {
  if (item.type === 'conference' && item.cfp_deadline) {
    const days = daysUntil(item.cfp_deadline);
    const label = days > 0 ? `CFP in ${days}d` : 'CFP passed';
    return `<span class="card__date" title="Deadline: ${formatDate(item.cfp_deadline)}">${label}</span>`;
  }

  if (item.type === 'opportunity' && item.deadline) {
    const days = daysUntil(item.deadline);
    const label = days > 0 ? `${days}d left` : 'Deadline passed';
    return `<span class="card__date" title="Deadline: ${formatDate(item.deadline)}">${label}</span>`;
  }

  const dateStr = item.date;
  if (!dateStr) return '';
  return `<span class="card__date" title="${formatDate(dateStr)}">${relativeTime(dateStr)}</span>`;
}

/**
 * Returns the card title text. Uses `title` or `name` depending on type.
 */
function getTitle(item) {
  return item.title || item.name || 'Untitled';
}

/**
 * Returns a brief body text.
 */
function getBody(item) {
  if (item.type === 'publication' && item.abstract) {
    return item.abstract.length > 180
      ? item.abstract.slice(0, 180) + '…'
      : item.abstract;
  }
  if (item.type === 'software' && item.changelog) {
    return item.changelog.length > 160
      ? item.changelog.slice(0, 160) + '…'
      : item.changelog;
  }
  return '';
}

/**
 * Renders a single card as an HTML string.
 * @param {Object} item - Data item from any module.
 * @returns {string} HTML string
 */
export function renderCard(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starLabel = starred ? 'Remove from watchlist' : 'Add to watchlist';
  const title = getTitle(item);
  const subtitle = getSubtitle(item);
  const body = getBody(item);
  const dateHtml = getDateDisplay(item);
  const tagsHtml = renderTags(item.tags || []);

  // Check if item is from the last 7 days
  const isNewThisWeek = item.date && (Date.now() - new Date(item.date + 'T00:00:00').getTime()) < 7 * 24 * 60 * 60 * 1000;
  const newBadge = isNewThisWeek ? '<span class="card__new-badge">NEW</span>' : '';

  // Check if item is from the last 24 hours for pulse glow animation
  const isNew24h = item.date && (Date.now() - new Date(item.date + 'T00:00:00').getTime()) < 24 * 60 * 60 * 1000;
  const newClass = isNew24h ? ' card-new' : '';

  // Source badge for publications
  const sourceBadge =
    item.type === 'publication' && item.source
      ? `<span class="tag ${sourceClass(item.source)}">${item.source}</span>`
      : '';

  return `
    <article class="card${newClass}" tabindex="0" data-id="${item.id}" data-type="${item.type}">
      <div class="card__header">
        <h3 class="card__title">${title}</h3>
        ${newBadge}
        ${dateHtml}
      </div>
      ${subtitle ? `<p class="card__subtitle">${subtitle}</p>` : ''}
      ${body ? `<p class="card__body">${body}</p>` : ''}
      <div class="card__tags">
        ${sourceBadge}${tagsHtml}
      </div>
      <div class="card__actions">
        <button class="card__star ${starClass}" data-id="${item.id}" aria-label="${starLabel}" title="${starLabel}">
          ${starred ? '&#9733;' : '&#9734;'}
        </button>
        ${item.type === 'publication' ? `<button class="card__cite card__action" data-id="${item.id}" aria-label="Copy BibTeX citation" title="Copy BibTeX">Cite</button>` : ''}
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action" aria-label="Open external link">&#8599; Open</a>` : ''}
        ${item.url && item.url.includes('arxiv.org/abs/') ? `<a href="${item.url.replace('/abs/', '/pdf/') + '.pdf'}" target="_blank" rel="noopener" class="card__action card__pdf" title="Download PDF">PDF</a>` : ''}
        <button class="card__detail-btn card__action" data-id="${item.id}">Details</button>
        <a href="https://github.com/mghnasiri/PORID/issues/new?title=${encodeURIComponent('Issue: ' + title)}&body=${encodeURIComponent('Item URL: ' + (item.url || 'N/A'))}" target="_blank" rel="noopener" class="card__action card__report" title="Report issue">&#128681;</a>
      </div>
    </article>
  `;
}
