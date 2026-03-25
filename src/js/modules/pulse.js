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

import { daysUntil, formatDate } from '../utils/date.js';
import { renderRadarChart } from '../components/radar-chart.js';

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

function buildBriefDOM(brief, container) {
  const briefEl = document.createElement('div');
  briefEl.className = 'brief';

  const header = document.createElement('div');
  header.className = 'brief__header';
  const h2 = document.createElement('h2');
  h2.className = 'brief__title';
  h2.textContent = 'This Week in OR';
  header.appendChild(h2);
  if (brief.week_of) {
    const dateEl = document.createElement('span');
    dateEl.className = 'brief__date';
    dateEl.textContent = formatDate(brief.week_of);
    header.appendChild(dateEl);
  }
  briefEl.appendChild(header);

  const body = document.createElement('div');
  body.className = 'brief__body';

  const sections = brief.sections || {};
  const sectionDefs = [
    { key: 'trends', icon: '\uD83D\uDCC8', label: 'Trends' },
    { key: 'opportunities', icon: '\uD83D\uDCE1', label: 'Radar' },
    { key: 'solvers', icon: '\uD83D\uDD27', label: 'Tools' },
    { key: 'conferences', icon: '\uD83D\uDCC5', label: 'Conferences' },
  ];

  sectionDefs.forEach(def => {
    const data = sections[def.key];
    if (!data) return;
    const section = document.createElement('div');
    section.className = 'brief__section';
    const iconEl = document.createElement('span');
    iconEl.className = 'brief__section-icon';
    iconEl.textContent = def.icon;
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = def.label;
    const p = document.createElement('p');
    p.textContent = data.headline || 'No data available.';
    div.appendChild(strong);
    div.appendChild(p);
    section.appendChild(iconEl);
    section.appendChild(div);
    body.appendChild(section);
  });

  briefEl.appendChild(body);
  container.appendChild(briefEl);
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
