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

  // ── VD-10: Opportunity Funnel Dashboard ───────────────────
  view.appendChild(buildOpportunityFunnel(merged));

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

  // VD-07: Deadline Heat Calendar (6-month view)
  buildDeadlineHeatCalendar(merged, view);

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

/**
 * VD-07: Deadline Heat Calendar (GitHub-contribution style)
 * Shows 6-month heatmap grid. Each day is a small square colored by
 * the number of deadlines on that day. Hover shows deadline details.
 * @param {Array} items - merged items from mergeItems()
 * @param {HTMLElement} container - parent to append to
 */
function buildDeadlineHeatCalendar(items, container) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build 180-day window starting from today
  const days = 180;
  const startDate = new Date(today);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days - 1);

  // Parse deadline dates from items, build a count map (YYYY-MM-DD -> {count, items[]})
  const deadlineMap = {};

  items.forEach(item => {
    let dl = item._deadline || item.deadline || item.cfp_deadline || null;
    if (!dl) return;

    // Normalize dates like "2026-03-15"
    const parsed = new Date(dl);
    if (isNaN(parsed.getTime())) return;

    parsed.setHours(0, 0, 0, 0);
    if (parsed < startDate || parsed > endDate) return;

    const key = parsed.toISOString().slice(0, 10);
    if (!deadlineMap[key]) deadlineMap[key] = { count: 0, items: [] };
    deadlineMap[key].count++;
    const title = item.title || item.name || 'Untitled';
    deadlineMap[key].items.push(title.length > 50 ? title.slice(0, 48) + '\u2026' : title);
  });

  const section = document.createElement('div');
  section.className = 'heat-calendar';

  const header = document.createElement('div');
  header.className = 'heat-calendar__header';
  const heading = document.createElement('h3');
  heading.className = 'heat-calendar__title';
  heading.textContent = 'Deadline Heat Map (Next 6 Months)';
  header.appendChild(heading);

  // Total deadlines count
  const totalDeadlines = Object.values(deadlineMap).reduce((s, d) => s + d.count, 0);
  const countSpan = document.createElement('span');
  countSpan.className = 'heat-calendar__count';
  countSpan.textContent = totalDeadlines + ' deadline' + (totalDeadlines !== 1 ? 's' : '');
  header.appendChild(countSpan);
  section.appendChild(header);

  // Day-of-week labels
  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];
  const labelsCol = document.createElement('div');
  labelsCol.className = 'heat-calendar__day-labels';
  dayLabels.forEach(lbl => {
    const s = document.createElement('span');
    s.textContent = lbl;
    labelsCol.appendChild(s);
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'heat-calendar__wrapper';
  wrapper.appendChild(labelsCol);

  const grid = document.createElement('div');
  grid.className = 'heat-calendar__grid';

  // Find the Monday on or before startDate
  const dow = startDate.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() + mondayOffset);

  // Generate cells. We need enough weeks to cover 180 days.
  // Calculate total weeks: from gridStart to endDate
  const totalDays = Math.ceil((endDate - gridStart) / (1000 * 60 * 60 * 24)) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  // Month labels row
  const monthRow = document.createElement('div');
  monthRow.className = 'heat-calendar__months';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = -1;
  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = new Date(gridStart);
    weekStart.setDate(weekStart.getDate() + w * 7);
    const m = weekStart.getMonth();
    const span = document.createElement('span');
    span.className = 'heat-calendar__month-label';
    if (m !== lastMonth) {
      span.textContent = monthNames[m];
      lastMonth = m;
    }
    monthRow.appendChild(span);
  }

  // Build the grid: 7 rows (Mon-Sun) x N columns (weeks)
  // CSS grid goes column by column for GitHub style
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    for (let w = 0; w < totalWeeks; w++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(cellDate.getDate() + w * 7 + dayOfWeek);
      const key = cellDate.toISOString().slice(0, 10);

      const cell = document.createElement('div');
      cell.className = 'heat-calendar__cell';

      if (cellDate < startDate || cellDate > endDate) {
        cell.classList.add('heat-calendar__cell--empty');
      } else {
        const info = deadlineMap[key];
        const count = info ? info.count : 0;

        if (count === 0) {
          cell.classList.add('heat-calendar__cell--0');
        } else if (count === 1) {
          cell.classList.add('heat-calendar__cell--1');
        } else if (count === 2) {
          cell.classList.add('heat-calendar__cell--2');
        } else {
          cell.classList.add('heat-calendar__cell--3');
        }

        // Mark today
        if (key === today.toISOString().slice(0, 10)) {
          cell.classList.add('heat-calendar__cell--today');
        }

        // Tooltip
        const tipLines = [];
        const dateObj = new Date(key + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
        });
        tipLines.push(dateStr);
        if (count > 0 && info) {
          tipLines.push(count + ' deadline' + (count > 1 ? 's' : ''));
          info.items.forEach(name => tipLines.push('\u2022 ' + name));
        } else {
          tipLines.push('No deadlines');
        }
        cell.title = tipLines.join('\n');
      }

      grid.appendChild(cell);
    }
  }

  // Set CSS variable for number of weeks
  grid.style.setProperty('--heat-weeks', totalWeeks);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'heat-calendar__scroll';
  scrollWrap.appendChild(monthRow);
  scrollWrap.appendChild(grid);
  wrapper.appendChild(scrollWrap);
  section.appendChild(wrapper);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'heat-calendar__legend';
  const lessLabel = document.createElement('span');
  lessLabel.className = 'heat-calendar__legend-text';
  lessLabel.textContent = 'Less';
  legend.appendChild(lessLabel);

  [0, 1, 2, 3].forEach(lvl => {
    const box = document.createElement('span');
    box.className = 'heat-calendar__cell heat-calendar__cell--' + lvl;
    box.style.position = 'static';
    box.style.display = 'inline-block';
    legend.appendChild(box);
  });

  const moreLabel = document.createElement('span');
  moreLabel.className = 'heat-calendar__legend-text';
  moreLabel.textContent = 'More';
  legend.appendChild(moreLabel);
  section.appendChild(legend);

  container.appendChild(section);
}

/**
 * VD-10: Builds an opportunity funnel visualization.
 * Shows: Open (all) -> This Month -> This Week -> Today
 * @param {Array} items - merged items from mergeItems()
 * @returns {HTMLElement}
 */
function buildOpportunityFunnel(items) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // End of today
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // End of this week (Sunday)
  const dayOfWeek = now.getDay();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - dayOfWeek));
  endOfWeek.setHours(23, 59, 59);

  // End of this month
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Filter items with future deadlines
  const open = items.filter(i => {
    if (!i._deadline) return true; // no deadline = open
    return daysUntil(i._deadline) > 0;
  });

  const thisMonth = open.filter(i => {
    if (!i._deadline) return false;
    const d = new Date(i._deadline);
    return d >= now && d <= endOfMonth;
  });

  const thisWeek = open.filter(i => {
    if (!i._deadline) return false;
    const d = new Date(i._deadline);
    return d >= now && d <= endOfWeek;
  });

  const today = open.filter(i => {
    if (!i._deadline) return false;
    return i._deadline.slice(0, 10) === todayStr;
  });

  const stages = [
    { label: 'Open', count: open.length, cls: 'funnel__stage--open' },
    { label: 'This Month', count: thisMonth.length, cls: 'funnel__stage--month' },
    { label: 'This Week', count: thisWeek.length, cls: 'funnel__stage--week' },
    { label: 'Today', count: today.length, cls: 'funnel__stage--today' },
  ];

  const maxCount = Math.max(open.length, 1);

  const funnel = document.createElement('div');
  funnel.className = 'opportunity-funnel';

  const title = document.createElement('h3');
  title.className = 'opportunity-funnel__title';
  title.textContent = 'Deadline Funnel';
  funnel.appendChild(title);

  const track = document.createElement('div');
  track.className = 'opportunity-funnel__track';

  stages.forEach((stage, idx) => {
    const stageEl = document.createElement('div');
    stageEl.className = 'funnel__stage ' + stage.cls;

    const bar = document.createElement('div');
    bar.className = 'funnel__bar';
    const widthPct = Math.max(8, Math.round((stage.count / maxCount) * 100));
    bar.style.width = widthPct + '%';

    const count = document.createElement('span');
    count.className = 'funnel__count';
    count.textContent = String(stage.count);
    bar.appendChild(count);

    stageEl.appendChild(bar);

    const label = document.createElement('span');
    label.className = 'funnel__label';
    label.textContent = stage.label;
    stageEl.appendChild(label);

    // Arrow between stages
    if (idx < stages.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'funnel__arrow';
      arrow.textContent = '\u25B6';
      track.appendChild(stageEl);
      track.appendChild(arrow);
    } else {
      track.appendChild(stageEl);
    }
  });

  funnel.appendChild(track);
  return funnel;
}
