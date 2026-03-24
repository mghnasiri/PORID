/**
 * Radar module — Opportunity aggregator view.
 *
 * Combines opportunities, conferences, and funding into a single
 * deadline-sorted timeline. Sub-routes: #radar/funding, #radar/positions.
 *
 * Security: All data rendered comes from local static JSON files
 * (data/*.json), not from user input or external sources.
 */

import { daysUntil, formatDate } from '../utils/date.js';
import { isWatchlisted } from '../utils/storage.js';

const TYPE_FILTERS = [
  { key: 'all', label: 'All', icon: '\u25C9' },
  { key: 'positions', label: 'Positions', icon: '\uD83C\uDFEB' },
  { key: 'funding', label: 'Funding', icon: '\uD83D\uDCB0' },
  { key: 'conferences', label: 'Conferences', icon: '\uD83C\uDF93' },
];

/**
 * Merges opportunities and conferences into a unified timeline.
 */
function mergeItems(allData) {
  const items = [];

  for (const opp of (allData.opportunities || [])) {
    items.push({
      ...opp,
      _category: opp.subtype || opp.type || 'position',
      _deadline: opp.deadline || null,
      _displayType: 'opportunity',
    });
  }

  for (const conf of (allData.conferences || [])) {
    items.push({
      ...conf,
      title: conf.name,
      _category: 'conference',
      _deadline: conf.cfp_deadline || null,
      _displayType: 'conference',
    });
  }

  return items;
}

function sortByDeadline(items) {
  return [...items].sort((a, b) => {
    const da = a._deadline ? daysUntil(a._deadline) : 9999;
    const db = b._deadline ? daysUntil(b._deadline) : 9999;
    const wa = da <= 0 ? 10000 + Math.abs(da) : da;
    const wb = db <= 0 ? 10000 + Math.abs(db) : db;
    return wa - wb;
  });
}

function filterByCategory(items, sub) {
  if (!sub || sub === 'all') return items;
  if (sub === 'positions') return items.filter(i => i._category !== 'conference' && i._category !== 'funding');
  if (sub === 'funding') return items.filter(i => i._category === 'funding' || (i.tags || []).includes('funding'));
  if (sub === 'conferences') return items.filter(i => i._category === 'conference');
  return items;
}

function buildDeadlineBadge(deadline) {
  const span = document.createElement('span');
  if (!deadline) {
    span.className = 'radar-badge radar-badge--none';
    span.textContent = 'No deadline';
    return span;
  }
  const days = daysUntil(deadline);
  if (days <= 0) {
    span.className = 'radar-badge radar-badge--passed';
    span.textContent = 'Passed';
  } else if (days <= 7) {
    span.className = 'radar-badge radar-badge--urgent';
    span.textContent = `${days}d left`;
  } else if (days <= 30) {
    span.className = 'radar-badge radar-badge--soon';
    span.textContent = `${days}d left`;
  } else {
    span.className = 'radar-badge';
    span.textContent = formatDate(deadline);
  }
  return span;
}

function buildCategoryBadge(item) {
  const span = document.createElement('span');
  const cat = item._category;
  const map = {
    conference: ['radar-cat radar-cat--conf', 'Conference'],
    funding: ['radar-cat radar-cat--fund', 'Funding'],
    phd: ['radar-cat radar-cat--phd', 'PhD'],
    postdoc: ['radar-cat radar-cat--postdoc', 'Postdoc'],
    faculty: ['radar-cat radar-cat--faculty', 'Faculty'],
  };
  const [cls, label] = map[cat] || ['radar-cat', 'Position'];
  span.className = cls;
  span.textContent = label;
  return span;
}

function buildRadarItem(item) {
  const article = document.createElement('article');
  article.className = 'radar-item';
  article.dataset.id = item.id;

  // Deadline column
  const dlCol = document.createElement('div');
  dlCol.className = 'radar-item__deadline';
  dlCol.appendChild(buildDeadlineBadge(item._deadline));
  article.appendChild(dlCol);

  // Body column
  const body = document.createElement('div');
  body.className = 'radar-item__body';

  const header = document.createElement('div');
  header.className = 'radar-item__header';
  header.appendChild(buildCategoryBadge(item));
  const h3 = document.createElement('h3');
  h3.className = 'radar-item__title';
  h3.textContent = item.title || item.name || 'Untitled';
  header.appendChild(h3);
  body.appendChild(header);

  const subtitle = item.institution || item.location || item.dates || '';
  if (subtitle) {
    const p = document.createElement('p');
    p.className = 'radar-item__subtitle';
    p.textContent = subtitle;
    body.appendChild(p);
  }

  const tags = (item.tags || []).slice(0, 4);
  if (tags.length > 0) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'radar-item__tags';
    tags.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      tagsDiv.appendChild(span);
    });
    body.appendChild(tagsDiv);
  }

  article.appendChild(body);

  // Actions column
  const actions = document.createElement('div');
  actions.className = 'radar-item__actions';

  const starred = isWatchlisted(item.id);
  const starBtn = document.createElement('button');
  starBtn.className = `card__star ${starred ? 'card__star--active' : ''}`;
  starBtn.dataset.id = item.id;
  starBtn.setAttribute('aria-label', 'Toggle watchlist');
  starBtn.textContent = starred ? '\u2605' : '\u2606';
  actions.appendChild(starBtn);

  if (item.url) {
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'card__action';
    link.textContent = '\u2197';
    actions.appendChild(link);
  }

  const detailBtn = document.createElement('button');
  detailBtn.className = 'card__detail-btn card__action';
  detailBtn.dataset.id = item.id;
  detailBtn.textContent = 'Details';
  actions.appendChild(detailBtn);

  article.appendChild(actions);

  return article;
}

/**
 * Main render function for the Radar view.
 * @param {HTMLElement} container
 * @param {Object} allData
 * @param {string} [sub] - Sub-route filter
 */
export function render(container, allData, sub) {
  const merged = mergeItems(allData);
  const filtered = filterByCategory(merged, sub);
  const sorted = sortByDeadline(filtered);

  const upcoming = sorted.filter(i => i._deadline && daysUntil(i._deadline) > 0);
  const closingSoon = upcoming.filter(i => daysUntil(i._deadline) <= 14);
  const activeFilter = sub || 'all';

  container.textContent = '';

  const view = document.createElement('div');
  view.className = 'radar-view';

  // Header
  const headerDiv = document.createElement('div');
  headerDiv.className = 'radar-view__header';
  const headerLeft = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.className = 'radar-view__title';
  h1.textContent = 'Radar';
  const subP = document.createElement('p');
  subP.className = 'radar-view__subtitle';
  subP.textContent = 'Opportunities, funding calls, and conference deadlines';
  headerLeft.appendChild(h1);
  headerLeft.appendChild(subP);
  headerDiv.appendChild(headerLeft);

  const statsDiv = document.createElement('div');
  statsDiv.className = 'radar-view__stats';
  const openStat = document.createElement('span');
  openStat.className = 'radar-view__stat';
  openStat.textContent = `${upcoming.length} open`;
  statsDiv.appendChild(openStat);
  if (closingSoon.length > 0) {
    const urgentStat = document.createElement('span');
    urgentStat.className = 'radar-view__stat radar-view__stat--urgent';
    urgentStat.textContent = `${closingSoon.length} closing soon`;
    statsDiv.appendChild(urgentStat);
  }
  headerDiv.appendChild(statsDiv);
  view.appendChild(headerDiv);

  // Filters
  const filtersDiv = document.createElement('div');
  filtersDiv.className = 'radar-view__filters';
  TYPE_FILTERS.forEach(f => {
    const a = document.createElement('a');
    const route = f.key !== 'all' ? '#radar/' + f.key : '#radar';
    a.href = route;
    a.className = `radar-filter ${activeFilter === f.key || (activeFilter === 'all' && f.key === 'all') ? 'radar-filter--active' : ''}`;
    a.textContent = `${f.icon} ${f.label}`;
    filtersDiv.appendChild(a);
  });
  view.appendChild(filtersDiv);

  // Content
  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-state__icon';
    icon.textContent = '\uD83D\uDCE1';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'No items found';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Try a different filter or check back when the pipeline has fetched new data.';
    empty.appendChild(icon);
    empty.appendChild(h2);
    empty.appendChild(p);
    view.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'radar-list';
    sorted.forEach(item => {
      list.appendChild(buildRadarItem(item));
    });
    view.appendChild(list);
  }

  container.appendChild(view);
}
