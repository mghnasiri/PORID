/**
 * Pulse module — Landing view for the OR Intelligence Hub.
 *
 * Shows: hero section, topic velocity radar chart placeholder,
 * key metrics, weekly brief, and quick-access cards linking to
 * Radar, Toolkit, and Papers views.
 *
 * Security: All data rendered comes from local static JSON files
 * (data/*.json), not from user input or external sources.
 */

import { daysUntil, formatDate, relativeTime } from '../utils/date.js';
import { renderRadarChart } from '../components/radar-chart.js';
import { getWatchlist, getRecentViews, getAllNotes } from '../utils/storage.js';

/**
 * Computes live metrics from loaded data.
 * @param {Object} allData - { publications, software, conferences, opportunities }
 * @returns {Object} metrics
 */
export function computeMetrics(allData) {
  const pubs = allData.publications || [];
  const software = allData.software || [];
  const opps = allData.opportunities || [];
  const confs = allData.conferences || [];

  const uniqueTags = new Set(pubs.flatMap(p => p.tags || []));

  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const thisQuarter = pubs.filter(p => {
    if (!p.date) return false;
    return new Date(p.date) >= ninetyDaysAgo;
  });

  const activeOpps = opps.filter(o => {
    if (!o.deadline) return true;
    return daysUntil(o.deadline) > 0;
  });

  const activeConfs = confs.filter(c => {
    if (!c.cfp_deadline) return true;
    return daysUntil(c.cfp_deadline) > 0;
  });

  return {
    subdomains: uniqueTags.size,
    papersThisQuarter: thisQuarter.length,
    totalPapers: pubs.length,
    activeOpportunities: activeOpps.length + activeConfs.length,
    solversTracked: software.length,
  };
}

/**
 * Renders the Pulse (landing) view.
 * All data rendered originates from our own local static JSON files.
 * @param {HTMLElement} container
 * @param {Object} allData
 * @param {Object} [extra] - { trends, brief }
 */
export function render(container, allData, extra = {}) {
  const m = computeMetrics(allData);
  const trends = extra.trends || null;
  const brief = extra.brief || null;

  const opps = allData.opportunities || [];
  const confs = allData.conferences || [];
  const software = allData.software || [];

  // Count deadlines this month
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const deadlinesThisMonth = [...opps, ...confs].filter(item => {
    const dl = item.deadline || item.cfp_deadline;
    if (!dl) return false;
    const d = new Date(dl);
    return d >= now && d <= endOfMonth;
  }).length;

  // Recent solver updates (last 30 days)
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSolverUpdates = software.filter(s =>
    s.date && new Date(s.date) >= thirtyDaysAgo
  ).length;

  // Build DOM safely using createElement for untrusted parts
  container.textContent = '';

  const pulse = document.createElement('div');
  pulse.className = 'pulse';

  // Hero
  const hero = document.createElement('div');
  hero.className = 'pulse__hero';
  const h1 = document.createElement('h1');
  h1.className = 'pulse__title';
  h1.textContent = 'PORID';
  const sub = document.createElement('p');
  sub.className = 'pulse__subtitle';
  sub.textContent = 'OR Intelligence Hub';
  const tagline = document.createElement('p');
  tagline.className = 'pulse__tagline';
  tagline.textContent = 'The pulse of Operations Research: trends, tools, funding';
  hero.appendChild(h1);
  hero.appendChild(sub);
  hero.appendChild(tagline);
  pulse.appendChild(hero);

  // Radar chart placeholder
  const radarContainer = document.createElement('div');
  radarContainer.className = 'pulse__radar-container';
  radarContainer.id = 'radarChartContainer';
  const placeholder = document.createElement('div');
  placeholder.className = 'pulse__radar-placeholder';
  const placeholderIcon = document.createElement('div');
  placeholderIcon.className = 'pulse__radar-placeholder-icon';
  placeholderIcon.textContent = '\u25C9';
  const placeholderText = document.createElement('p');
  placeholderText.textContent = 'Topic Velocity Radar';
  const placeholderNote = document.createElement('span');
  placeholderNote.className = 'pulse__radar-placeholder-note';
  placeholderNote.textContent = trends ? 'Loading visualization...' : 'Trend data generates after the pipeline runs';
  placeholder.appendChild(placeholderIcon);
  placeholder.appendChild(placeholderText);
  placeholder.appendChild(placeholderNote);
  radarContainer.appendChild(placeholder);
  pulse.appendChild(radarContainer);

  // Metrics bar
  const metrics = document.createElement('div');
  metrics.className = 'pulse__metrics';
  const metricsData = [
    { value: String(m.subdomains), label: 'subdomains' },
    { value: m.totalPapers > 999 ? (m.totalPapers / 1000).toFixed(1) + 'k' : String(m.totalPapers), label: 'papers tracked' },
    { value: String(m.activeOpportunities), label: 'active opportunities' },
    { value: String(m.solversTracked), label: 'tools tracked' },
  ];
  metricsData.forEach(md => {
    const metric = document.createElement('div');
    metric.className = 'pulse__metric';
    const val = document.createElement('span');
    val.className = 'pulse__metric-value';
    val.textContent = md.value;
    const lbl = document.createElement('span');
    lbl.className = 'pulse__metric-label';
    lbl.textContent = md.label;
    metric.appendChild(val);
    metric.appendChild(lbl);
    metrics.appendChild(metric);
  });
  pulse.appendChild(metrics);

  // ── ER-03: Personalized Landing from Browse History ────────────
  const personalizedSection = buildPersonalizedSection(allData);
  if (personalizedSection) {
    pulse.appendChild(personalizedSection);
  }

  // Weekly brief
  const briefContainer = document.createElement('div');
  briefContainer.className = 'pulse__brief';
  briefContainer.id = 'weeklyBrief';
  if (brief) {
    buildBriefDOM(brief, briefContainer);
  } else {
    buildBriefPlaceholderDOM(briefContainer);
  }
  pulse.appendChild(briefContainer);

  // Quick access cards
  const cards = document.createElement('div');
  cards.className = 'pulse__cards';

  const cardData = [
    { href: '#radar', icon: '\uD83D\uDCE1', title: 'Radar', desc: `${deadlinesThisMonth} deadline${deadlinesThisMonth !== 1 ? 's' : ''} this month` },
    { href: '#toolkit', icon: '\uD83D\uDD27', title: 'Toolkit', desc: `${recentSolverUpdates} tool update${recentSolverUpdates !== 1 ? 's' : ''} this month` },
    { href: '#papers', icon: '\uD83D\uDCDA', title: 'Papers', desc: `Browse ${m.totalPapers} publications` },
  ];
  cardData.forEach(cd => {
    const a = document.createElement('a');
    a.href = cd.href;
    a.className = 'pulse__card';
    const icon = document.createElement('div');
    icon.className = 'pulse__card-icon';
    icon.textContent = cd.icon;
    const content = document.createElement('div');
    content.className = 'pulse__card-content';
    const h3 = document.createElement('h3');
    h3.className = 'pulse__card-title';
    h3.textContent = cd.title;
    const p = document.createElement('p');
    p.className = 'pulse__card-desc';
    p.textContent = cd.desc;
    content.appendChild(h3);
    content.appendChild(p);
    const arrow = document.createElement('span');
    arrow.className = 'pulse__card-arrow';
    arrow.textContent = '\u2192';
    a.appendChild(icon);
    a.appendChild(content);
    a.appendChild(arrow);
    cards.appendChild(a);
  });
  pulse.appendChild(cards);

  // ── VD-01: Sparkline Grid for All Subdomains ────────────────
  if (trends && trends.subdomains && trends.subdomains.length > 0) {
    pulse.appendChild(buildSparklineGrid(trends.subdomains));
  }

  // ── VD-04: Tag Cloud from Trending Keywords ─────────────────
  if (trends && trends.subdomains && trends.subdomains.length > 0) {
    pulse.appendChild(buildTagCloud(trends.subdomains));
  }

  container.appendChild(pulse);

  // Render D3 radar chart if trends data available
  if (trends && trends.subdomains && trends.subdomains.length > 0) {
    const chartContainer = document.getElementById('radarChartContainer');
    if (chartContainer) {
      // Defer to allow DOM to settle
      requestAnimationFrame(() => {
        renderRadarChart(chartContainer, trends);
      });
    }
  }
}

/**
 * VD-01: Builds a sparkline grid showing mini bar charts for each subdomain.
 * @param {Array} subdomains - trends.subdomains array
 * @returns {HTMLElement}
 */
function buildSparklineGrid(subdomains) {
  const section = document.createElement('section');
  section.className = 'sparkline-grid';

  const heading = document.createElement('h2');
  heading.className = 'sparkline-grid__title';
  heading.textContent = 'Subdomain Activity';
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'sparkline-grid__container';

  subdomains.forEach(sd => {
    const cell = document.createElement('div');
    cell.className = 'sparkline-cell';

    // Header row: name + velocity arrow
    const header = document.createElement('div');
    header.className = 'sparkline-cell__header';
    const nameEl = document.createElement('span');
    nameEl.className = 'sparkline-cell__name';
    nameEl.textContent = sd.display_name || sd.tag;
    header.appendChild(nameEl);

    const arrow = document.createElement('span');
    const vel = sd.velocity_label || '';
    if (vel === 'accelerating') {
      arrow.className = 'sparkline-cell__arrow sparkline-cell__arrow--up';
      arrow.textContent = '\u25B2';
    } else if (vel === 'decelerating') {
      arrow.className = 'sparkline-cell__arrow sparkline-cell__arrow--down';
      arrow.textContent = '\u25BC';
    } else {
      arrow.className = 'sparkline-cell__arrow sparkline-cell__arrow--flat';
      arrow.textContent = '\u2013';
    }
    header.appendChild(arrow);
    cell.appendChild(header);

    // Sparkline bars
    const sparkline = sd.sparkline || [];
    const maxVal = Math.max(...sparkline, 1);
    const barsContainer = document.createElement('div');
    barsContainer.className = 'sparkline-cell__bars';
    sparkline.forEach((val, i) => {
      const bar = document.createElement('div');
      bar.className = 'sparkline-cell__bar';
      const heightPct = Math.round((val / maxVal) * 100);
      bar.style.height = heightPct + '%';
      if (i === sparkline.length - 1) {
        bar.classList.add('sparkline-cell__bar--current');
      }
      barsContainer.appendChild(bar);
    });
    cell.appendChild(barsContainer);

    // Count
    const countEl = document.createElement('span');
    countEl.className = 'sparkline-cell__count';
    countEl.textContent = String(sd.current_quarter_count || 0);
    cell.appendChild(countEl);

    grid.appendChild(cell);
  });

  section.appendChild(grid);
  return section;
}

/**
 * VD-04: Builds a tag cloud from top_keywords across all subdomains.
 * Font size mapped to 5 tiers based on keyword frequency.
 * Clicking navigates to #publications with that keyword as search.
 * @param {Array} subdomains - trends.subdomains array
 * @returns {HTMLElement}
 */
function buildTagCloud(subdomains) {
  // Collect keyword frequencies
  const freq = {};
  subdomains.forEach(sd => {
    (sd.top_keywords || []).forEach(kw => {
      freq[kw] = (freq[kw] || 0) + 1;
    });
  });

  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return document.createElement('div');

  const maxFreq = entries[0][1];
  const minFreq = entries[entries.length - 1][1];
  const range = maxFreq - minFreq || 1;

  const section = document.createElement('section');
  section.className = 'tag-cloud';

  const heading = document.createElement('h2');
  heading.className = 'tag-cloud__title';
  heading.textContent = 'Trending Keywords';
  section.appendChild(heading);

  const cloud = document.createElement('div');
  cloud.className = 'tag-cloud__container';

  entries.forEach(([keyword, count]) => {
    const tier = Math.min(4, Math.floor(((count - minFreq) / range) * 4.99));
    const a = document.createElement('a');
    a.href = '#publications?q=' + encodeURIComponent(keyword);
    a.className = 'tag-cloud__tag tag-cloud__tag--t' + tier;
    a.textContent = keyword;
    a.title = keyword + ' (' + count + ')';
    cloud.appendChild(a);
  });

  section.appendChild(cloud);
  return section;
}

/**
 * ER-03: Builds personalized landing section from browse history.
 * Shows "Your Focus Areas" (most-tagged topics) and "Continue Reading"
 * (last 5 viewed items) if user has history.
 * @param {Object} allData
 * @returns {HTMLElement|null}
 */
function buildPersonalizedSection(allData) {
  const watchlist = getWatchlist();
  const recentViews = getRecentViews();
  const notes = getAllNotes();

  // Determine if user has any browse history
  const hasHistory = watchlist.length > 0 || recentViews.length > 0 || Object.keys(notes).length > 0;
  if (!hasHistory) return null;

  const container = document.createElement('div');
  container.className = 'pulse__personalized';

  // --- Your Focus Areas: aggregate tags from watchlisted + noted items ---
  const tagFreq = {};
  const allItems = Object.values(allData).flat();
  const trackedIds = new Set([
    ...watchlist.map(w => w.id),
    ...Object.keys(notes),
    ...recentViews.map(r => r.id),
  ]);

  allItems.forEach(item => {
    if (trackedIds.has(item.id) && item.tags) {
      item.tags.forEach(tag => {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
      });
    }
  });

  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (topTags.length > 0) {
    const focusSection = document.createElement('div');
    focusSection.className = 'pulse__focus-areas';
    const h2 = document.createElement('h2');
    h2.textContent = 'Your Focus Areas';
    focusSection.appendChild(h2);

    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'focus-tags';
    topTags.forEach(([tag]) => {
      const a = document.createElement('a');
      a.href = '#publications?q=' + encodeURIComponent(tag);
      a.className = 'tag';
      a.textContent = tag;
      tagsDiv.appendChild(a);
    });
    focusSection.appendChild(tagsDiv);
    container.appendChild(focusSection);
  }

  // --- Continue Reading: last 5 viewed items ---
  if (recentViews.length > 0) {
    const continueSection = document.createElement('div');
    continueSection.className = 'pulse__continue-reading';
    const h2 = document.createElement('h2');
    h2.textContent = 'Continue Reading';
    continueSection.appendChild(h2);

    const list = document.createElement('ul');
    list.className = 'continue-list';

    const TYPE_ICONS = {
      publication: '\uD83D\uDCDD',
      software: '\uD83D\uDD27',
      conference: '\uD83D\uDCC5',
      opportunity: '\uD83D\uDCE1',
      seminar: '\uD83C\uDF93',
      dataset: '\uD83D\uDCCA',
    };

    recentViews.slice(0, 5).forEach(item => {
      const li = document.createElement('li');
      li.className = 'continue-list__item';

      const icon = document.createElement('span');
      icon.className = 'continue-list__icon';
      icon.textContent = TYPE_ICONS[item.type] || '\uD83D\uDCDD';
      li.appendChild(icon);

      const title = document.createElement('span');
      title.className = 'continue-list__title';
      title.textContent = item.title;
      li.appendChild(title);

      const time = document.createElement('span');
      time.className = 'continue-list__time';
      time.textContent = relativeTime(item.timestamp);
      li.appendChild(time);

      list.appendChild(li);
    });

    continueSection.appendChild(list);
    container.appendChild(continueSection);
  }

  return container;
}

/**
 * ER-07: Enhanced weekly brief with rich detail sections and archive navigation.
 * Includes: trend headline, opportunity deadlines, solver updates, conference
 * deadlines, and prev/next week navigation if archives exist.
 */

// Brief archive state for prev/next navigation
let briefArchiveFiles = null;
let currentBriefIndex = -1;

function buildBriefDOM(brief, container) {
  const briefEl = document.createElement('div');
  briefEl.className = 'brief';

  const header = document.createElement('div');
  header.className = 'brief__header';
  const h2 = document.createElement('h2');
  h2.className = 'brief__title';
  h2.textContent = 'This Week in OR';
  header.appendChild(h2);

  // Right side of header: date + nav buttons
  const headerRight = document.createElement('div');
  headerRight.style.cssText = 'display:flex;align-items:center;gap:0.5rem';
  if (brief.week_of) {
    const dateEl = document.createElement('span');
    dateEl.className = 'brief__date';
    dateEl.textContent = formatDate(brief.week_of);
    headerRight.appendChild(dateEl);
  }

  // ER-07: Nav buttons for prev/next brief archive
  const nav = document.createElement('div');
  nav.className = 'brief__nav';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'brief__nav-btn';
  prevBtn.id = 'briefPrev';
  prevBtn.textContent = '\u2190 Prev';
  prevBtn.title = 'Previous week';
  prevBtn.disabled = true; // Will be enabled if archives exist
  const nextBtn = document.createElement('button');
  nextBtn.className = 'brief__nav-btn';
  nextBtn.id = 'briefNext';
  nextBtn.textContent = 'Next \u2192';
  nextBtn.title = 'Next week';
  nextBtn.disabled = true;
  nav.appendChild(prevBtn);
  nav.appendChild(nextBtn);
  headerRight.appendChild(nav);
  header.appendChild(headerRight);
  briefEl.appendChild(header);

  const body = document.createElement('div');
  body.className = 'brief__body';

  const sections = brief.sections || {};

  // --- Trends section with detail ---
  if (sections.trends) {
    const tData = sections.trends;
    const section = document.createElement('div');
    section.className = 'brief__section';
    const iconEl = document.createElement('span');
    iconEl.className = 'brief__section-icon';
    iconEl.textContent = '\uD83D\uDCC8';
    const div = document.createElement('div');
    div.style.flex = '1';
    const strong = document.createElement('strong');
    strong.textContent = 'Trends';
    const p = document.createElement('p');
    p.textContent = tData.headline || 'No data available.';
    div.appendChild(strong);
    div.appendChild(p);

    // Detail: accelerating topics
    if (tData.accelerating && tData.accelerating.length > 0) {
      const details = document.createElement('div');
      details.className = 'brief__details';
      const group = document.createElement('div');
      group.className = 'brief__detail-group';
      const gh = document.createElement('h4');
      gh.textContent = 'Accelerating Topics';
      group.appendChild(gh);
      tData.accelerating.slice(0, 5).forEach(t => {
        const row = document.createElement('div');
        row.className = 'brief__detail-item';
        const name = document.createElement('span');
        name.textContent = t.tag;
        const badge = document.createElement('span');
        badge.className = 'brief__detail-badge';
        badge.textContent = t.velocity || (t.count + ' papers');
        row.appendChild(name);
        row.appendChild(badge);
        group.appendChild(row);
      });
      details.appendChild(group);
      div.appendChild(details);
    }

    // R4-14: Trend Narrative Summaries
    if (tData.trend_narratives && tData.trend_narratives.length > 0) {
      const narrativeSection = document.createElement('div');
      narrativeSection.className = 'brief__narratives';
      const nh = document.createElement('h4');
      nh.textContent = 'Subdomain Narratives';
      narrativeSection.appendChild(nh);
      tData.trend_narratives.slice(0, 8).forEach(n => {
        const item = document.createElement('div');
        item.className = 'brief__narrative-item';
        const tag = document.createElement('strong');
        tag.className = 'brief__narrative-tag';
        tag.textContent = n.tag;
        item.appendChild(tag);
        const text = document.createElement('p');
        text.className = 'brief__narrative-text';
        text.textContent = n.narrative;
        item.appendChild(text);
        narrativeSection.appendChild(item);
      });
      div.appendChild(narrativeSection);
    }

    section.appendChild(iconEl);
    section.appendChild(div);
    body.appendChild(section);
  }

  // --- Opportunities section with deadlines ---
  if (sections.opportunities) {
    const oData = sections.opportunities;
    const section = document.createElement('div');
    section.className = 'brief__section';
    const iconEl = document.createElement('span');
    iconEl.className = 'brief__section-icon';
    iconEl.textContent = '\uD83D\uDCE1';
    const div = document.createElement('div');
    div.style.flex = '1';
    const strong = document.createElement('strong');
    strong.textContent = 'Radar';
    const p = document.createElement('p');
    p.textContent = oData.headline || 'No data available.';
    div.appendChild(strong);
    div.appendChild(p);

    // Detail: closing soon deadlines
    if (oData.closing_soon && oData.closing_soon.length > 0) {
      const details = document.createElement('div');
      details.className = 'brief__details';
      const group = document.createElement('div');
      group.className = 'brief__detail-group';
      const gh = document.createElement('h4');
      gh.textContent = 'Closing Soon';
      group.appendChild(gh);
      oData.closing_soon.forEach(o => {
        const row = document.createElement('div');
        row.className = 'brief__detail-item';
        const name = document.createElement('span');
        name.textContent = o.title;
        const dl = document.createElement('span');
        dl.className = 'brief__detail-deadline';
        dl.textContent = o.deadline ? formatDate(o.deadline) : '';
        row.appendChild(name);
        row.appendChild(dl);
        group.appendChild(row);
      });
      details.appendChild(group);
      div.appendChild(details);
    }

    // Funding highlights
    if (oData.funding_highlights && oData.funding_highlights.length > 0) {
      const details = div.querySelector('.brief__details') || document.createElement('div');
      if (!details.className) details.className = 'brief__details';
      const group = document.createElement('div');
      group.className = 'brief__detail-group';
      const gh = document.createElement('h4');
      gh.textContent = 'Funding Highlights';
      group.appendChild(gh);
      oData.funding_highlights.slice(0, 3).forEach(f => {
        const row = document.createElement('div');
        row.className = 'brief__detail-item';
        const name = document.createElement('span');
        name.textContent = f.title;
        const badge = document.createElement('span');
        badge.className = 'brief__detail-badge';
        badge.textContent = f.amount || '';
        row.appendChild(name);
        row.appendChild(badge);
        group.appendChild(row);
      });
      details.appendChild(group);
      if (!div.querySelector('.brief__details')) div.appendChild(details);
    }

    section.appendChild(iconEl);
    section.appendChild(div);
    body.appendChild(section);
  }

  // --- Solvers section with updates ---
  if (sections.solvers) {
    const sData = sections.solvers;
    const section = document.createElement('div');
    section.className = 'brief__section';
    const iconEl = document.createElement('span');
    iconEl.className = 'brief__section-icon';
    iconEl.textContent = '\uD83D\uDD27';
    const div = document.createElement('div');
    div.style.flex = '1';
    const strong = document.createElement('strong');
    strong.textContent = 'Tools';
    const p = document.createElement('p');
    p.textContent = sData.headline || 'No data available.';
    div.appendChild(strong);
    div.appendChild(p);

    if (sData.updates && sData.updates.length > 0) {
      const details = document.createElement('div');
      details.className = 'brief__details';
      const group = document.createElement('div');
      group.className = 'brief__detail-group';
      const gh = document.createElement('h4');
      gh.textContent = 'Solver Updates';
      group.appendChild(gh);
      sData.updates.forEach(u => {
        const row = document.createElement('div');
        row.className = 'brief__detail-item';
        const name = document.createElement('span');
        name.textContent = u.solver;
        const badge = document.createElement('span');
        badge.className = 'brief__detail-badge';
        badge.textContent = u.new_version ? 'v' + u.new_version : (u.date || '');
        row.appendChild(name);
        row.appendChild(badge);
        group.appendChild(row);
      });
      details.appendChild(group);
      div.appendChild(details);
    }

    section.appendChild(iconEl);
    section.appendChild(div);
    body.appendChild(section);
  }

  // --- Conferences section with deadlines ---
  if (sections.conferences) {
    const cData = sections.conferences;
    const section = document.createElement('div');
    section.className = 'brief__section';
    const iconEl = document.createElement('span');
    iconEl.className = 'brief__section-icon';
    iconEl.textContent = '\uD83D\uDCC5';
    const div = document.createElement('div');
    div.style.flex = '1';
    const strong = document.createElement('strong');
    strong.textContent = 'Conferences';
    const p = document.createElement('p');
    p.textContent = cData.headline || 'No data available.';
    div.appendChild(strong);
    div.appendChild(p);

    if (cData.upcoming_deadlines && cData.upcoming_deadlines.length > 0) {
      const details = document.createElement('div');
      details.className = 'brief__details';
      const group = document.createElement('div');
      group.className = 'brief__detail-group';
      const gh = document.createElement('h4');
      gh.textContent = 'Upcoming Deadlines';
      group.appendChild(gh);
      cData.upcoming_deadlines.forEach(c => {
        const row = document.createElement('div');
        row.className = 'brief__detail-item';
        const name = document.createElement('span');
        name.textContent = c.name || c.title || '';
        const dl = document.createElement('span');
        dl.className = 'brief__detail-deadline';
        dl.textContent = c.deadline ? formatDate(c.deadline) : (c.cfp_deadline ? formatDate(c.cfp_deadline) : '');
        row.appendChild(name);
        row.appendChild(dl);
        group.appendChild(row);
      });
      details.appendChild(group);
      div.appendChild(details);
    }

    section.appendChild(iconEl);
    section.appendChild(div);
    body.appendChild(section);
  }

  briefEl.appendChild(body);
  container.appendChild(briefEl);

  // ER-07: Wire prev/next brief navigation
  initBriefNavigation(container, prevBtn, nextBtn);
}

/**
 * ER-07: Discovers brief archive files and wires prev/next navigation.
 * Looks for brief-YYYY-MM-DD.json files in data/ directory.
 */
async function initBriefNavigation(container, prevBtn, nextBtn) {
  // Discover available brief files by probing date-stamped files
  if (briefArchiveFiles === null) {
    briefArchiveFiles = [];
    // Try the last 8 weeks of brief files
    const today = new Date();
    for (let i = 0; i < 56; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      briefArchiveFiles.push(dateStr);
    }
    // Probe which files actually exist (check first few to find pattern)
    const validFiles = [];
    for (const dateStr of briefArchiveFiles) {
      try {
        const resp = await fetch(`./data/brief-${dateStr}.json`, { method: 'HEAD' });
        if (resp.ok) validFiles.push(dateStr);
      } catch { /* skip */ }
    }
    briefArchiveFiles = validFiles.sort().reverse(); // newest first
    currentBriefIndex = 0; // current brief is the newest
  }

  if (briefArchiveFiles.length <= 1) return; // No navigation needed

  // Enable buttons based on position
  function updateNav() {
    prevBtn.disabled = currentBriefIndex >= briefArchiveFiles.length - 1;
    nextBtn.disabled = currentBriefIndex <= 0;
  }
  updateNav();

  prevBtn.addEventListener('click', async () => {
    if (currentBriefIndex >= briefArchiveFiles.length - 1) return;
    currentBriefIndex++;
    const dateStr = briefArchiveFiles[currentBriefIndex];
    try {
      const resp = await fetch(`./data/brief-${dateStr}.json`);
      if (resp.ok) {
        const brief = await resp.json();
        container.textContent = '';
        buildBriefDOM(brief, container);
      }
    } catch { /* skip */ }
  });

  nextBtn.addEventListener('click', async () => {
    if (currentBriefIndex <= 0) return;
    currentBriefIndex--;
    const dateStr = briefArchiveFiles[currentBriefIndex];
    try {
      const resp = await fetch(`./data/brief-${dateStr}.json`);
      if (resp.ok) {
        const brief = await resp.json();
        container.textContent = '';
        buildBriefDOM(brief, container);
      }
    } catch { /* skip */ }
  });
}

function buildBriefPlaceholderDOM(container) {
  const briefEl = document.createElement('div');
  briefEl.className = 'brief brief--placeholder';

  const header = document.createElement('div');
  header.className = 'brief__header';
  const h2 = document.createElement('h2');
  h2.className = 'brief__title';
  h2.textContent = 'This Week in OR';
  header.appendChild(h2);
  briefEl.appendChild(header);

  const p = document.createElement('p');
  p.className = 'brief__empty';
  p.textContent = 'The weekly brief will appear here once trend data is generated by the pipeline. It summarizes the most important developments across publications, opportunities, and tools.';
  briefEl.appendChild(p);

  container.appendChild(briefEl);
}
