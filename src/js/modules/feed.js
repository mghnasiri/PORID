/**
 * OR Feed — consolidated view merging publications, software, conferences,
 * opportunities, and trends into a single filterable feed.
 *
 * Replaces the old separate top-level tabs for these categories.
 */

import { relativeTime, formatDate } from '../utils/date.js';

const FEED_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'publications', label: 'Publications' },
  { key: 'software', label: 'Software' },
  { key: 'conferences', label: 'Conferences' },
  { key: 'opportunities', label: 'Opportunities' },
];

/**
 * @param {HTMLElement} container
 * @param {Object} data - { publications, software, conferences, opportunities, ... }
 * @param {string} [activeType] - Pre-selected filter type
 */
export function render(container, data, activeType) {
  const selected = activeType || 'all';
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'feed-page';

  // Header
  const h1 = document.createElement('h1');
  h1.className = 'feed-page__title';
  h1.textContent = 'OR Feed';
  wrapper.appendChild(h1);

  const desc = document.createElement('p');
  desc.className = 'feed-page__desc';
  desc.textContent = 'Publications, conferences, software releases, and opportunities from across the OR community.';
  wrapper.appendChild(desc);

  // Filter buttons
  const filters = document.createElement('div');
  filters.className = 'feed-filters';
  FEED_TYPES.forEach(ft => {
    const btn = document.createElement('button');
    btn.className = `feed-filter${ft.key === selected ? ' active' : ''}`;
    btn.dataset.type = ft.key;
    btn.textContent = ft.label;

    // Add count badge
    if (ft.key !== 'all') {
      const items = data[ft.key] || [];
      if (items.length > 0) {
        const count = document.createElement('span');
        count.className = 'feed-filter__count';
        count.textContent = items.length;
        btn.appendChild(count);
      }
    }

    btn.addEventListener('click', () => {
      // Update URL without full re-render
      window.history.replaceState(null, '', `#feed${ft.key !== 'all' ? '/' + ft.key : ''}`);
      render(container, data, ft.key);
    });
    filters.appendChild(btn);
  });
  wrapper.appendChild(filters);

  // Content area
  const content = document.createElement('div');
  content.className = 'feed-content';

  // Merge and sort items
  const items = mergeItems(data, selected);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.textContent = 'No items found.';
    content.appendChild(empty);
  } else {
    // Render items as cards
    items.slice(0, 100).forEach((item, i) => {
      const card = buildFeedCard(item);
      card.style.animationDelay = `${Math.min(i * 30, 600)}ms`;
      content.appendChild(card);
    });

    if (items.length > 100) {
      const more = document.createElement('p');
      more.className = 'feed-more';
      more.textContent = `Showing 100 of ${items.length} items. Use the filter buttons to narrow results.`;
      content.appendChild(more);
    }
  }

  wrapper.appendChild(content);
  container.appendChild(wrapper);
}

function mergeItems(data, type) {
  let items = [];

  if (type === 'all' || type === 'publications') {
    (data.publications || []).forEach(item => {
      items.push({ ...item, _feedType: 'publication' });
    });
  }
  if (type === 'all' || type === 'software') {
    (data.software || []).forEach(item => {
      items.push({ ...item, _feedType: 'software' });
    });
  }
  if (type === 'all' || type === 'conferences') {
    (data.conferences || []).forEach(item => {
      items.push({ ...item, _feedType: 'conference' });
    });
  }
  if (type === 'all' || type === 'opportunities') {
    (data.opportunities || []).forEach(item => {
      items.push({ ...item, _feedType: 'opportunity' });
    });
  }

  // Sort by date descending
  items.sort((a, b) => {
    const da = a.date || a.deadline || a.cfp_deadline || '';
    const db = b.date || b.deadline || b.cfp_deadline || '';
    return db.localeCompare(da);
  });

  return items;
}

function buildFeedCard(item) {
  const card = document.createElement('div');
  card.className = 'feed-card card';
  card.dataset.id = item.id || '';

  // Type badge
  const badge = document.createElement('span');
  badge.className = `feed-card__badge feed-card__badge--${item._feedType}`;
  badge.textContent = item._feedType;
  card.appendChild(badge);

  // Title
  const title = document.createElement('h3');
  title.className = 'feed-card__title';
  if (item.url) {
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = item.title || 'Untitled';
    title.appendChild(a);
  } else {
    title.textContent = item.title || 'Untitled';
  }
  card.appendChild(title);

  // Date
  const dateStr = item.date || item.deadline || item.cfp_deadline;
  if (dateStr) {
    const dateEl = document.createElement('span');
    dateEl.className = 'feed-card__date';
    dateEl.textContent = new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    card.appendChild(dateEl);
  }

  // Authors (for publications)
  if (item.authors && item.authors.length > 0) {
    const authors = document.createElement('p');
    authors.className = 'feed-card__authors';
    authors.textContent = item.authors.slice(0, 3).join(', ') +
      (item.authors.length > 3 ? ` +${item.authors.length - 3} more` : '');
    card.appendChild(authors);
  }

  // Abstract / description (truncated)
  const text = item.abstract || item.description || '';
  if (text) {
    const desc = document.createElement('p');
    desc.className = 'feed-card__desc';
    desc.textContent = text.length > 200 ? text.slice(0, 200) + '...' : text;
    card.appendChild(desc);
  }

  // Tags
  if (item.tags && item.tags.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'feed-card__tags';
    item.tags.slice(0, 5).forEach(t => {
      const tag = document.createElement('span');
      tag.className = 'feed-card__tag';
      tag.textContent = t;
      tags.appendChild(tag);
    });
    card.appendChild(tags);
  }

  // Version badge (for software)
  if (item.version) {
    const ver = document.createElement('span');
    ver.className = 'feed-card__version';
    ver.textContent = `v${item.version}`;
    card.appendChild(ver);
  }

  // Deadline badge (for conferences/opportunities)
  if (item.deadline || item.cfp_deadline) {
    const dl = item.deadline || item.cfp_deadline;
    const daysLeft = Math.ceil((new Date(dl) - new Date()) / 86400000);
    if (daysLeft > 0 && daysLeft <= 30) {
      const urgency = document.createElement('span');
      urgency.className = `feed-card__deadline${daysLeft <= 7 ? ' feed-card__deadline--urgent' : ''}`;
      urgency.textContent = `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
      card.appendChild(urgency);
    }
  }

  return card;
}
