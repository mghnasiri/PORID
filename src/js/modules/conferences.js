/**
 * Conferences module — renders conference cards with CFP deadline countdowns
 * and browser notification support for upcoming deadlines.
 *
 * Security note: All data rendered comes from local static JSON
 * (data/conferences.json), not from user input or external sources.
 * All uses of innerHTML below render exclusively from this trusted local data.
 */

import { formatDate, daysUntil } from '../utils/date.js';
import { isWatchlisted, getWatchlist } from '../utils/storage.js';
import { renderEmptyState } from '../components/empty-state.js';

const NOTIFIED_KEY = 'porid-conf-notified';

/**
 * Get the set of conference IDs already notified this session.
 */
function getNotifiedIds() {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markNotified(id) {
  const ids = getNotifiedIds();
  ids.add(id);
  sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
}

/**
 * Check watchlisted conferences for upcoming deadlines and send notifications.
 */
function checkDeadlineNotifications(data) {
  const watchlist = getWatchlist();
  const watchIds = new Set(watchlist.map((w) => w.id));
  const notified = getNotifiedIds();

  const urgent = data.filter((item) => {
    if (!watchIds.has(item.id)) return false;
    if (notified.has(item.id)) return false;
    if (!item.cfp_deadline) return false;
    const days = daysUntil(item.cfp_deadline);
    return days > 0 && days <= 7;
  });

  if (urgent.length === 0) return;

  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    urgent.forEach((item) => {
      const days = daysUntil(item.cfp_deadline);
      new Notification('PORID - CFP Deadline Alert', {
        body: `${item.name}: ${days} day${days !== 1 ? 's' : ''} until CFP deadline`,
      });
      markNotified(item.id);
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        urgent.forEach((item) => {
          const days = daysUntil(item.cfp_deadline);
          new Notification('PORID - CFP Deadline Alert', {
            body: `${item.name}: ${days} day${days !== 1 ? 's' : ''} until CFP deadline`,
          });
          markNotified(item.id);
        });
      }
    });
  }
}

/**
 * Count conferences with CFP deadline within 7 days (for badge).
 */
export function getUrgentDeadlineCount(data) {
  return data.filter((item) => {
    if (!item.cfp_deadline) return false;
    const days = daysUntil(item.cfp_deadline);
    return days > 0 && days <= 7;
  }).length;
}

function renderConferenceCard(item) {
  const starred = isWatchlisted(item.id);
  const starClass = starred ? 'card__star--active' : '';
  const starSymbol = starred ? '&#9733;' : '&#9734;';

  const days = item.cfp_deadline ? daysUntil(item.cfp_deadline) : null;
  let deadlineHtml = '';
  let urgentClass = '';

  if (days !== null) {
    if (days <= 0) {
      deadlineHtml = '<span class="cfp-badge cfp-badge--passed">CFP Passed</span>';
    } else if (days <= 14) {
      deadlineHtml = `<span class="cfp-badge cfp-badge--urgent">${days} days left</span>`;
      urgentClass = 'card--urgent';
    } else {
      deadlineHtml = `<span class="cfp-badge">${days} days left</span>`;
    }
  }

  // Format badge: in-person, online, hybrid
  const FORMAT_ICONS = { 'in-person': '\uD83C\uDFE2', 'online': '\uD83D\uDCE1', 'hybrid': '\uD83D\uDD04' };
  const formatIcon = FORMAT_ICONS[item.format] || '';
  const formatBadge = item.format ? `<span class="format-badge">${formatIcon} ${item.format}</span>` : '';

  return `
    <article class="card ${urgentClass}" data-id="${item.id}" data-type="conference">
      <div class="card__header">
        <h3 class="card__title">${item.name}</h3>
        ${formatBadge}
        ${deadlineHtml}
      </div>
      <div class="conf-meta">
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#128197;</span>
          <span>${item.dates}</span>
        </div>
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#128205;</span>
          <span>${item.location}</span>
        </div>
        ${item.cfp_deadline ? `
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#9200;</span>
          <span>CFP Deadline: ${formatDate(item.cfp_deadline)}</span>
        </div>` : ''}
      </div>
      <div class="card__tags">
        ${(item.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <div class="card__actions">
        <button class="card__star ${starClass}" data-id="${item.id}" aria-label="Toggle watchlist">${starSymbol}</button>
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Website</a>` : ''}
        <button class="card__detail-btn card__action" data-id="${item.id}">Details</button>
      </div>
    </article>
  `;
}

/**
 * Render an award/prize card. Trusted local data from awards.json.
 */
function renderAwardCard(item) {
  const deadlineDays = item.deadline ? daysUntil(item.deadline) : null;
  let deadlineHtml = '';
  if (deadlineDays !== null && deadlineDays > 0) {
    const urgencyClass = deadlineDays <= 30 ? 'cfp-badge--urgent' : '';
    deadlineHtml = `<span class="cfp-badge ${urgencyClass}">${deadlineDays} days to deadline</span>`;
  } else if (deadlineDays !== null && deadlineDays <= 0) {
    deadlineHtml = '<span class="cfp-badge cfp-badge--passed">Deadline Passed</span>';
  }

  return `
    <article class="card" data-type="award">
      <div class="card__header">
        <h3 class="card__title">${item.name}</h3>
        ${deadlineHtml}
      </div>
      <div class="conf-meta">
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#127942;</span>
          <span>${item.organization}</span>
        </div>
        ${item.deadline ? `
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#9200;</span>
          <span>Deadline: ${formatDate(item.deadline)}</span>
        </div>` : ''}
      </div>
      <p class="card__body">${item.description}</p>
      <div class="card__actions">
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Details</a>` : ''}
      </div>
    </article>
  `;
}

/**
 * Render a special issue card. Trusted local data from special_issues.json.
 */
function renderSpecialIssueCard(item) {
  const deadlineDays = item.deadline ? daysUntil(item.deadline) : null;
  let deadlineHtml = '';
  if (deadlineDays !== null && deadlineDays > 0) {
    const urgencyClass = deadlineDays <= 30 ? 'cfp-badge--urgent' : '';
    deadlineHtml = `<span class="cfp-badge ${urgencyClass}">${deadlineDays} days left</span>`;
  } else if (deadlineDays !== null && deadlineDays <= 0) {
    deadlineHtml = '<span class="cfp-badge cfp-badge--passed">Deadline Passed</span>';
  }

  const topicTags = (item.topics || []).map((t) => `<span class="tag">${t}</span>`).join('');

  return `
    <article class="card card--special-issue" data-type="special_issue">
      <div class="card__header">
        <span class="journal-badge">${item.journal}</span>
        <h3 class="card__title">${item.name}</h3>
        ${deadlineHtml}
      </div>
      <div class="conf-meta">
        ${item.deadline ? `
        <div class="conf-meta__row">
          <span class="conf-meta__icon">&#9200;</span>
          <span>Submission Deadline: ${formatDate(item.deadline)}</span>
        </div>` : ''}
      </div>
      <div class="card__tags">${topicTags}</div>
      <div class="card__actions">
        ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="card__action">&#8599; Journal Page</a>` : ''}
      </div>
    </article>
  `;
}

/**
 * NF-09: Conference Deadline Calendar View
 * Renders a monthly calendar grid showing CFP deadline dots.
 * No external libraries -- pure DOM generation.
 * Security note: all data rendered comes from trusted local JSON.
 */
function buildCalendarView(items, container) {
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let selectedDate = null;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Build map of YYYY-MM-DD -> conferences with deadlines
  const deadlineMap = {};
  items.forEach(item => {
    if (!item.cfp_deadline || item.cfp_deadline === 'TBA') return;
    const d = new Date(item.cfp_deadline);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!deadlineMap[key]) deadlineMap[key] = [];
    deadlineMap[key].push(item);
  });

  const calWrap = document.createElement('div');
  calWrap.className = 'conf-calendar';

  function renderMonth() {
    calWrap.textContent = '';

    // Navigation
    const nav = document.createElement('div');
    nav.className = 'conf-calendar__nav';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'conf-calendar__nav-btn';
    prevBtn.textContent = '\u2190';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      selectedDate = null;
      renderMonth();
    });
    const nextBtn = document.createElement('button');
    nextBtn.className = 'conf-calendar__nav-btn';
    nextBtn.textContent = '\u2192';
    nextBtn.setAttribute('aria-label', 'Next month');
    nextBtn.addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      selectedDate = null;
      renderMonth();
    });
    const monthLabel = document.createElement('span');
    monthLabel.className = 'conf-calendar__month-label';
    monthLabel.textContent = `${monthNames[viewMonth]} ${viewYear}`;
    nav.appendChild(prevBtn);
    nav.appendChild(monthLabel);
    nav.appendChild(nextBtn);
    calWrap.appendChild(nav);

    // Day-of-week headers
    const grid = document.createElement('div');
    grid.className = 'conf-calendar__grid';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
      const hdr = document.createElement('div');
      hdr.className = 'conf-calendar__dow';
      hdr.textContent = d;
      grid.appendChild(hdr);
    });

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Empty leading cells
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'conf-calendar__cell conf-calendar__cell--empty';
      grid.appendChild(empty);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('div');
      cell.className = 'conf-calendar__cell';
      if (dateKey === todayKey) cell.classList.add('conf-calendar__cell--today');
      if (selectedDate === dateKey) cell.classList.add('conf-calendar__cell--selected');

      const dayNum = document.createElement('span');
      dayNum.className = 'conf-calendar__day-num';
      dayNum.textContent = day;
      cell.appendChild(dayNum);

      const confs = deadlineMap[dateKey];
      if (confs && confs.length > 0) {
        cell.classList.add('conf-calendar__cell--has-deadline');
        const dot = document.createElement('span');
        dot.className = 'conf-calendar__dot';
        if (confs.length > 1) {
          const count = document.createElement('span');
          count.className = 'conf-calendar__dot-count';
          count.textContent = confs.length;
          dot.appendChild(count);
        }
        cell.appendChild(dot);
      }

      cell.addEventListener('click', () => {
        selectedDate = selectedDate === dateKey ? null : dateKey;
        renderMonth();
      });
      grid.appendChild(cell);
    }

    calWrap.appendChild(grid);

    // Detail panel below grid
    const detail = document.createElement('div');
    detail.className = 'conf-calendar__detail';

    if (selectedDate && deadlineMap[selectedDate]) {
      const confs = deadlineMap[selectedDate];
      const detailTitle = document.createElement('h4');
      detailTitle.className = 'conf-calendar__detail-title';
      const selDate = new Date(selectedDate + 'T00:00:00');
      detailTitle.textContent = `Deadlines on ${selDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
      detail.appendChild(detailTitle);
      confs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'conf-calendar__detail-item';
        const name = document.createElement('strong');
        name.textContent = c.name;
        item.appendChild(name);
        const loc = document.createElement('span');
        loc.className = 'conf-calendar__detail-loc';
        loc.textContent = c.location || '';
        item.appendChild(loc);
        if (c.url) {
          const link = document.createElement('a');
          link.href = c.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.className = 'conf-calendar__detail-link';
          link.textContent = 'Website';
          item.appendChild(link);
        }
        detail.appendChild(item);
      });
    } else if (selectedDate) {
      const p = document.createElement('p');
      p.className = 'conf-calendar__detail-empty';
      p.textContent = 'No deadlines on this date.';
      detail.appendChild(p);
    } else {
      // Show all deadlines in this month as summary
      const monthConfs = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dk = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (deadlineMap[dk]) {
          deadlineMap[dk].forEach(c => monthConfs.push({ conf: c, day }));
        }
      }
      if (monthConfs.length > 0) {
        const detailTitle = document.createElement('h4');
        detailTitle.className = 'conf-calendar__detail-title';
        detailTitle.textContent = `${monthConfs.length} deadline${monthConfs.length !== 1 ? 's' : ''} this month`;
        detail.appendChild(detailTitle);
        monthConfs.forEach(({ conf, day }) => {
          const item = document.createElement('div');
          item.className = 'conf-calendar__detail-item';
          const dateLabel = document.createElement('span');
          dateLabel.className = 'conf-calendar__detail-date';
          dateLabel.textContent = `${monthNames[viewMonth].slice(0, 3)} ${day}`;
          item.appendChild(dateLabel);
          const name = document.createElement('strong');
          name.textContent = conf.name;
          item.appendChild(name);
          detail.appendChild(item);
        });
      } else {
        const p = document.createElement('p');
        p.className = 'conf-calendar__detail-empty';
        p.textContent = 'No CFP deadlines this month. Use the arrows to browse other months.';
        detail.appendChild(p);
      }
    }

    calWrap.appendChild(detail);
  }

  renderMonth();
  container.appendChild(calWrap);
}

/**
 * @param {HTMLElement} container
 * @param {Object[]} data - Conferences data
 * @param {Object} filters
 * @param {Object[]} [awards] - Awards data to render below conferences
 * @param {Object[]} [specialIssues] - Special issues data
 */
export function render(container, data, filters, awards, specialIssues) {
  let items = [...data];

  // Check notifications at render time
  checkDeadlineNotifications(data);

  // Apply tag filters
  if (filters && filters.tags && !filters.tags.includes('all') && filters.tags.length > 0) {
    items = items.filter((item) =>
      (item.tags || []).some((t) => filters.tags.includes(t))
    );
  }

  // Sort by CFP deadline soonest first; passed deadlines go to end
  items.sort((a, b) => {
    const da = a.cfp_deadline ? daysUntil(a.cfp_deadline) : 9999;
    const db = b.cfp_deadline ? daysUntil(b.cfp_deadline) : 9999;
    const wa = da <= 0 ? 10000 + Math.abs(da) : da;
    const wb = db <= 0 ? 10000 + Math.abs(db) : db;
    return wa - wb;
  });

  container.textContent = '';

  if (items.length === 0 && (!awards || awards.length === 0)) {
    renderEmptyState(container, { module: 'conferences', filters, totalCount: data.length });
    return;
  }

  // Top bar: view toggle + subscribe button
  const topBar = document.createElement('div');
  topBar.className = 'conf-top-bar';

  const viewToggle = document.createElement('div');
  viewToggle.className = 'conf-view-toggle';
  const listBtn = document.createElement('button');
  listBtn.className = 'conf-view-toggle__btn conf-view-toggle__btn--active';
  listBtn.textContent = 'List View';
  listBtn.dataset.view = 'list';
  const calToggleBtn = document.createElement('button');
  calToggleBtn.className = 'conf-view-toggle__btn';
  calToggleBtn.textContent = 'Calendar View';
  calToggleBtn.dataset.view = 'calendar';
  viewToggle.appendChild(listBtn);
  viewToggle.appendChild(calToggleBtn);
  topBar.appendChild(viewToggle);

  const calBtn = document.createElement('div');
  calBtn.className = 'conf-cal-subscribe';
  const calLink = document.createElement('a');
  calLink.href = './data/conferences.ics';
  calLink.className = 'card__action card__action--cal';
  calLink.textContent = '\uD83D\uDCC5 Subscribe to Calendar';
  calLink.title = 'Download iCal feed for all OR conferences';
  calBtn.appendChild(calLink);
  topBar.appendChild(calBtn);

  container.appendChild(topBar);

  // View containers
  const listContainer = document.createElement('div');
  listContainer.className = 'conf-list-view';
  const calContainer = document.createElement('div');
  calContainer.className = 'conf-calendar-view';
  calContainer.style.display = 'none';

  // Toggle logic
  [listBtn, calToggleBtn].forEach(btn => {
    btn.addEventListener('click', () => {
      const isCalendar = btn.dataset.view === 'calendar';
      listContainer.style.display = isCalendar ? 'none' : '';
      calContainer.style.display = isCalendar ? '' : 'none';
      listBtn.classList.toggle('conf-view-toggle__btn--active', !isCalendar);
      calToggleBtn.classList.toggle('conf-view-toggle__btn--active', isCalendar);
    });
  });

  // List view -- conferences grid (trusted local JSON, innerHTML safe)
  if (items.length > 0) {
    const confGrid = document.createElement('div');
    confGrid.className = 'card-grid';
    confGrid.innerHTML = items.map(renderConferenceCard).join('');
    listContainer.appendChild(confGrid);
  }

  container.appendChild(listContainer);

  // Calendar view
  buildCalendarView(items, calContainer);
  container.appendChild(calContainer);

  // Awards section below conferences — trusted local data from awards.json
  if (awards && awards.length > 0) {
    const section = document.createElement('div');
    section.className = 'awards-section';
    const sortedAwards = [...awards].sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline) : new Date('9999-12-31');
      const db = b.deadline ? new Date(b.deadline) : new Date('9999-12-31');
      return da - db;
    });

    const heading = document.createElement('h3');
    heading.className = 'awards-section__title';
    heading.textContent = 'Awards & Prizes';
    section.appendChild(heading);

    const subtitle = document.createElement('p');
    subtitle.className = 'awards-section__subtitle';
    subtitle.textContent = 'Major OR awards and nomination deadlines';
    section.appendChild(subtitle);

    const awardsGrid = document.createElement('div');
    awardsGrid.className = 'card-grid';
    // Trusted local data — innerHTML safe
    awardsGrid.innerHTML = sortedAwards.map(renderAwardCard).join('');
    section.appendChild(awardsGrid);

    container.appendChild(section);
  }

  // Special Issues section below awards — trusted local data from special_issues.json
  if (specialIssues && specialIssues.length > 0) {
    const siSection = document.createElement('div');
    siSection.className = 'special-issues-section';
    const sortedSI = [...specialIssues].sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline) : new Date('9999-12-31');
      const db = b.deadline ? new Date(b.deadline) : new Date('9999-12-31');
      return da - db;
    });

    // Apply tag filters to special issues too
    let filteredSI = sortedSI;
    if (filters && filters.tags && !filters.tags.includes('all') && filters.tags.length > 0) {
      filteredSI = sortedSI.filter((item) =>
        (item.topics || []).some((t) => filters.tags.includes(t))
      );
    }

    if (filteredSI.length > 0) {
      const siHeading = document.createElement('h3');
      siHeading.className = 'special-issues-section__title';
      siHeading.textContent = 'Special Issues';
      siSection.appendChild(siHeading);

      const siSubtitle = document.createElement('p');
      siSubtitle.className = 'special-issues-section__subtitle';
      siSubtitle.textContent = 'Open calls for papers in OR journals';
      siSection.appendChild(siSubtitle);

      const siGrid = document.createElement('div');
      siGrid.className = 'card-grid';
      // Trusted local data — innerHTML safe
      siGrid.innerHTML = filteredSI.map(renderSpecialIssueCard).join('');
      siSection.appendChild(siGrid);

      container.appendChild(siSection);
    }
  }
}
