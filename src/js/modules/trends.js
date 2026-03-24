/**
 * Trends module — renders analytics views: tag bar chart, top sources,
 * recent activity sparkline, and top authors.
 * All built with inline SVG and DOM methods, no external libraries.
 *
 * Security: All data rendered comes from our own local static JSON files,
 * not from user input or external sources.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'in', 'on', 'with', 'and', 'to', 'by',
  'from', 'is', 'are', 'that', 'this', 'we', 'our', 'its', 'or', 'as',
  'at', 'be', 'it', 'not', 'but', 'was', 'has', 'have', 'been', 'can',
  'will', 'their', 'which', 'one', 'two', 'new', 'using', 'based', 'via',
  'under', 'over', 'between', 'through', 'into', 'than', 'more', 'all',
  'each', 'both', 'such', 'also', 'about', 'up', 'do', 'no', 'if', 'how',
  'when', 'where', 'what', 'so', 'only', 'very', 'some', 'any', 'these',
  'those', 'other', 'then', 'there', 'here', 'they', 'them', 'he', 'she',
]);

/**
 * Build a "Hot Topics" word cloud from recent publication titles.
 */
function buildHotTopics(publications) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().slice(0, 10);

  const recent = publications.filter((p) => (p.date || '') >= cutoff);
  if (recent.length === 0) return '';

  // Extract and count words
  const wordCounts = new Map();
  recent.forEach((p) => {
    const title = (p.title || '').toLowerCase();
    const words = title.split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
    words.forEach((w) => wordCounts.set(w, (wordCounts.get(w) || 0) + 1));
  });

  // Top 20 words
  const sorted = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (sorted.length === 0) return '';

  const maxCount = sorted[0][1];
  const minCount = sorted[sorted.length - 1][1];
  const range = maxCount - minCount || 1;

  const pills = sorted.map(([word, count]) => {
    const scale = (count - minCount) / range;
    const fontSize = (0.7 + scale * 1.3).toFixed(2);
    const opacity = (0.5 + scale * 0.5).toFixed(2);
    return `<span class="hot-topic-word" style="font-size:${fontSize}rem;opacity:${opacity}" title="${word}: ${count} mentions">${word}</span>`;
  }).join(' ');

  return `
    <div class="trends-chart">
      <h3 class="trends-chart__title">Hot Topics (Last 7 Days)</h3>
      <div class="hot-topics-cloud">${pills}</div>
    </div>
  `;
}

/**
 * Count occurrences in an array of strings.
 * @returns {Map<string, number>}
 */
function countMap(arr) {
  const m = new Map();
  arr.forEach((v) => {
    if (v) m.set(v, (m.get(v) || 0) + 1);
  });
  return m;
}

/**
 * Sort a Map by value descending, return array of [key, count].
 */
function topEntries(map, limit = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Build an SVG bar chart from label/value pairs.
 */
function buildBarChart(entries, title) {
  if (!entries.length) return '';
  const maxVal = Math.max(...entries.map(([, v]) => v));
  const barHeight = 24;
  const gap = 6;
  const labelWidth = 140;
  const chartWidth = 400;
  const totalHeight = entries.length * (barHeight + gap) + 10;

  const bars = entries.map(([label, count], i) => {
    const y = i * (barHeight + gap) + 5;
    const w = maxVal > 0 ? (count / maxVal) * (chartWidth - labelWidth - 50) : 0;
    return `
      <text x="0" y="${y + barHeight * 0.7}" fill="var(--color-text-muted)" font-size="11" font-family="var(--font-body)">${label}</text>
      <rect x="${labelWidth}" y="${y}" width="${w}" height="${barHeight}" rx="3" fill="var(--color-accent)" opacity="0.7"/>
      <text x="${labelWidth + w + 6}" y="${y + barHeight * 0.7}" fill="var(--color-text-faint)" font-size="11" font-family="var(--font-body)">${count}</text>
    `;
  }).join('');

  return `
    <div class="trends-chart">
      <h3 class="trends-chart__title">${title}</h3>
      <svg width="100%" viewBox="0 0 ${chartWidth} ${totalHeight}" preserveAspectRatio="xMinYMin meet">
        ${bars}
      </svg>
    </div>
  `;
}

/**
 * Build sparkline SVG for publications per day over last 14 days.
 */
function buildSparkline(publications) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayCounts = [];
  const labels = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = publications.filter((p) => (p.date || '').slice(0, 10) === key).length;
    dayCounts.push(count);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }

  const maxVal = Math.max(...dayCounts, 1);
  const w = 400;
  const h = 80;
  const padX = 10;
  const padY = 10;
  const stepX = (w - 2 * padX) / 13;

  const points = dayCounts.map((v, i) => {
    const x = padX + i * stepX;
    const y = h - padY - (v / maxVal) * (h - 2 * padY);
    return `${x},${y}`;
  }).join(' ');

  const dots = dayCounts.map((v, i) => {
    const x = padX + i * stepX;
    const y = h - padY - (v / maxVal) * (h - 2 * padY);
    return `<circle cx="${x}" cy="${y}" r="3" fill="var(--color-accent)"><title>${labels[i]}: ${v}</title></circle>`;
  }).join('');

  return `
    <div class="trends-chart">
      <h3 class="trends-chart__title">Recent Activity (Last 14 Days)</h3>
      <svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMin meet">
        <polyline points="${points}" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linejoin="round"/>
        ${dots}
      </svg>
      <div class="trends-sparkline-labels">
        <span>${labels[0]}</span>
        <span>${labels[labels.length - 1]}</span>
      </div>
    </div>
  `;
}

/**
 * Build a ranked list widget.
 */
function buildRankedList(entries, title, icon) {
  if (!entries.length) return '';
  const rows = entries.map(([label, count], i) => `
    <div class="trends-rank-row">
      <span class="trends-rank-num">${i + 1}</span>
      <span class="trends-rank-label">${label}</span>
      <span class="trends-rank-count">${count}</span>
    </div>
  `).join('');

  return `
    <div class="trends-list">
      <h3 class="trends-chart__title">${icon ? icon + ' ' : ''}${title}</h3>
      ${rows}
    </div>
  `;
}

/**
 * Main render function for the Trends module.
 * @param {HTMLElement} container
 * @param {Object} data - { publications, software, conferences, opportunities }
 *
 * Security note: All data rendered originates from our own local static JSON
 * files (data/*.json), not from user input or external sources. innerHTML
 * usage here is safe within this trusted-data context.
 */
export function render(container, data) {
  const pubs = data.publications || [];

  // Tag distribution
  const tagCounts = countMap(pubs.flatMap((p) => p.tags || []));
  const tagEntries = topEntries(tagCounts, 12);

  // Top sources
  const sourceCounts = countMap(pubs.map((p) => p.source).filter(Boolean));
  const sourceEntries = topEntries(sourceCounts, 8);

  // Top authors (flatten all author arrays)
  const authorCounts = countMap(pubs.flatMap((p) => p.authors || []));
  const authorEntries = topEntries(authorCounts, 10);

  // Summary stats
  const totalPubs = pubs.length;
  const totalSoftware = (data.software || []).length;
  const totalConf = (data.conferences || []).length;
  const totalOpp = (data.opportunities || []).length;

  // Trusted local data — innerHTML is safe here
  container.innerHTML = `
    <div class="trends-container">
      <h2 class="trends-header">Trends &amp; Analytics</h2>

      <div class="trends-stats-row">
        <div class="trends-stat-card">
          <span class="trends-stat-value">${totalPubs}</span>
          <span class="trends-stat-label">Publications</span>
        </div>
        <div class="trends-stat-card">
          <span class="trends-stat-value">${totalSoftware}</span>
          <span class="trends-stat-label">Software</span>
        </div>
        <div class="trends-stat-card">
          <span class="trends-stat-value">${totalConf}</span>
          <span class="trends-stat-label">Conferences</span>
        </div>
        <div class="trends-stat-card">
          <span class="trends-stat-value">${totalOpp}</span>
          <span class="trends-stat-label">Opportunities</span>
        </div>
      </div>

      ${buildSparkline(pubs)}

      ${buildHotTopics(pubs)}

      <div class="trends-grid">
        ${buildBarChart(tagEntries, 'Publications by Tag')}
        ${buildRankedList(sourceEntries, 'Top Sources', '')}
      </div>

      ${buildRankedList(authorEntries, 'Top Authors', '')}
    </div>
  `;
}
