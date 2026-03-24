/**
 * Toolkit module — Solver Observatory, benchmarks, and software directory.
 *
 * Sub-routes: #toolkit/solvers, #toolkit/benchmarks, #toolkit/software
 *
 * Security: All data rendered comes from local static JSON files
 * (data/*.json), not from user input or external sources.
 */

import { relativeTime, formatDate } from '../utils/date.js';

const SUB_TABS = [
  { key: '', label: 'Overview', icon: '\uD83D\uDEE0' },
  { key: 'solvers', label: 'Solvers', icon: '\u2699' },
  { key: 'benchmarks', label: 'Benchmarks', icon: '\uD83D\uDCCA' },
  { key: 'software', label: 'Software', icon: '\uD83D\uDCE6' },
];

/**
 * Main render function for the Toolkit view.
 * @param {HTMLElement} container
 * @param {Object} allData
 * @param {string} [sub] - Sub-route
 */
export function render(container, allData, sub) {
  const activeSub = sub || '';
  const software = allData.software || [];
  const solvers = allData.solvers || null;
  const benchmarks = allData.benchmarks || null;

  container.textContent = '';

  const view = document.createElement('div');
  view.className = 'toolkit-view';

  // Header
  const header = document.createElement('div');
  header.className = 'toolkit-view__header';
  const h1 = document.createElement('h1');
  h1.className = 'toolkit-view__title';
  h1.textContent = 'Toolkit';
  const subP = document.createElement('p');
  subP.className = 'toolkit-view__subtitle';
  subP.textContent = 'OR solvers, benchmarks, and software tools';
  header.appendChild(h1);
  header.appendChild(subP);
  view.appendChild(header);

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'toolkit-view__tabs';
  SUB_TABS.forEach(t => {
    const a = document.createElement('a');
    a.href = t.key ? `#toolkit/${t.key}` : '#toolkit';
    a.className = `toolkit-tab ${activeSub === t.key ? 'toolkit-tab--active' : ''}`;
    a.textContent = `${t.icon} ${t.label}`;
    tabs.appendChild(a);
  });
  view.appendChild(tabs);

  // Content
  const contentDiv = document.createElement('div');
  contentDiv.className = 'toolkit-view__content';

  switch (activeSub) {
    case 'solvers':
      buildSolvers(solvers, contentDiv);
      break;
    case 'benchmarks':
      buildBenchmarks(benchmarks, contentDiv);
      break;
    case 'software':
      buildSoftwareDirectory(software, contentDiv);
      break;
    default:
      buildOverview(allData, contentDiv);
      break;
  }

  view.appendChild(contentDiv);
  container.appendChild(view);
}

function buildOverview(allData, container) {
  const software = allData.software || [];
  const solvers = allData.solvers;
  const benchmarks = allData.benchmarks;

  const overview = document.createElement('div');
  overview.className = 'toolkit-overview';

  // Solver section
  const solverSection = buildSectionCard(
    'Solver Observatory',
    '#toolkit/solvers',
    solvers
      ? `${solvers.solvers ? solvers.solvers.length : 0} solvers tracked. Compare features, licenses, and activity.`
      : 'Solver data will appear here once the pipeline generates solvers.json.'
  );
  overview.appendChild(solverSection);

  // Benchmark section
  const benchmarkSection = buildSectionCard(
    'Benchmark Hub',
    '#toolkit/benchmarks',
    benchmarks
      ? `${benchmarks.categories ? benchmarks.categories.length : 0} benchmark categories covering standard OR problem types.`
      : 'Benchmark data will appear here once benchmarks.json is created.'
  );
  overview.appendChild(benchmarkSection);

  // Recent releases
  const recentSection = document.createElement('div');
  recentSection.className = 'toolkit-section';
  const recentHeader = document.createElement('div');
  recentHeader.className = 'toolkit-section__header';
  const h2 = document.createElement('h2');
  h2.textContent = 'Recent Releases';
  recentHeader.appendChild(h2);
  const link = document.createElement('a');
  link.href = '#toolkit/software';
  link.className = 'toolkit-section__link';
  link.textContent = 'View all \u2192';
  recentHeader.appendChild(link);
  recentSection.appendChild(recentHeader);

  const recent = [...software]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 5);

  if (recent.length > 0) {
    const releases = document.createElement('div');
    releases.className = 'toolkit-releases';
    recent.forEach(s => {
      const rel = document.createElement('div');
      rel.className = 'toolkit-release';
      const info = document.createElement('div');
      info.className = 'toolkit-release__info';
      const name = document.createElement('strong');
      name.textContent = s.name;
      info.appendChild(name);
      const badge = document.createElement('span');
      badge.className = 'version-badge';
      badge.textContent = `v${s.version}`;
      info.appendChild(badge);
      rel.appendChild(info);
      const dateEl = document.createElement('span');
      dateEl.className = 'toolkit-release__date';
      dateEl.textContent = relativeTime(s.date);
      rel.appendChild(dateEl);
      releases.appendChild(rel);
    });
    recentSection.appendChild(releases);
  } else {
    const p = document.createElement('p');
    p.className = 'toolkit-section__desc';
    p.textContent = 'No recent releases found.';
    recentSection.appendChild(p);
  }

  overview.appendChild(recentSection);
  container.appendChild(overview);
}

function buildSectionCard(title, href, desc) {
  const section = document.createElement('div');
  section.className = 'toolkit-section';
  const header = document.createElement('div');
  header.className = 'toolkit-section__header';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  header.appendChild(h2);
  const link = document.createElement('a');
  link.href = href;
  link.className = 'toolkit-section__link';
  link.textContent = 'View all \u2192';
  header.appendChild(link);
  section.appendChild(header);
  const p = document.createElement('p');
  p.className = 'toolkit-section__desc';
  p.textContent = desc;
  section.appendChild(p);
  return section;
}

function buildSolvers(solversData, container) {
  if (!solversData || !solversData.solvers || solversData.solvers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-state__icon';
    icon.textContent = '\u2699';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'Solver Observatory';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Solver comparison data will appear here once data/solvers.json is generated. Run python pipeline/fetch_solvers.py to populate this view.';
    empty.appendChild(icon);
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'solver-table-wrap';

  const table = document.createElement('table');
  table.className = 'solver-table';

  // thead
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Solver', 'Version', 'License', 'Problem Types', 'Languages', 'Links'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // tbody
  const tbody = document.createElement('tbody');
  solversData.solvers.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'solver-row';

    // Name
    const tdName = document.createElement('td');
    tdName.className = 'solver-row__name';
    const nameStrong = document.createElement('strong');
    nameStrong.textContent = s.name;
    tdName.appendChild(nameStrong);
    if (s.vendor) {
      const vendor = document.createElement('span');
      vendor.className = 'solver-row__vendor';
      vendor.textContent = s.vendor;
      tdName.appendChild(vendor);
    }
    tr.appendChild(tdName);

    // Version
    const tdVer = document.createElement('td');
    tdVer.className = 'solver-row__version';
    const badge = document.createElement('span');
    badge.className = 'version-badge';
    badge.textContent = `v${s.current_version}`;
    tdVer.appendChild(badge);
    if (s.release_date) {
      const dateSpan = document.createElement('span');
      dateSpan.className = 'solver-row__date';
      dateSpan.textContent = formatDate(s.release_date);
      tdVer.appendChild(dateSpan);
    }
    tr.appendChild(tdVer);

    // License
    const tdLic = document.createElement('td');
    const licSpan = document.createElement('span');
    if (s.open_source) {
      licSpan.className = 'solver-license solver-license--open';
      licSpan.textContent = s.license?.type || 'Open';
    } else {
      licSpan.className = 'solver-license solver-license--comm';
      licSpan.textContent = s.license?.academic_free ? 'Comm. (Free\u2020)' : 'Commercial';
    }
    tdLic.appendChild(licSpan);
    tr.appendChild(tdLic);

    // Problem types
    const tdProb = document.createElement('td');
    tdProb.className = 'solver-row__problems';
    (s.problem_types || []).forEach(p => {
      const sp = document.createElement('span');
      sp.className = 'solver-problem';
      sp.textContent = p;
      tdProb.appendChild(sp);
    });
    tr.appendChild(tdProb);

    // Languages
    const tdLang = document.createElement('td');
    tdLang.className = 'solver-row__langs';
    const langs = (s.language_bindings || []).slice(0, 5).join(', ');
    const more = (s.language_bindings || []).length > 5 ? ` +${s.language_bindings.length - 5}` : '';
    tdLang.textContent = langs + more;
    tr.appendChild(tdLang);

    // Links
    const tdLinks = document.createElement('td');
    tdLinks.className = 'solver-row__links';
    if (s.website) {
      const a = document.createElement('a');
      a.href = s.website;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Web';
      tdLinks.appendChild(a);
    }
    if (s.github) {
      const a = document.createElement('a');
      a.href = `https://github.com/${s.github}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'GH';
      tdLinks.appendChild(a);
    }
    tr.appendChild(tdLinks);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);

  // Legend
  if (solversData.problem_type_legend) {
    const legend = document.createElement('div');
    legend.className = 'solver-legend';
    const note = document.createElement('p');
    note.textContent = '\u2020 Academic license available';
    legend.appendChild(note);

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Problem type abbreviations';
    details.appendChild(summary);
    const grid = document.createElement('div');
    grid.className = 'solver-legend__grid';
    Object.entries(solversData.problem_type_legend).forEach(([k, v]) => {
      const span = document.createElement('span');
      const b = document.createElement('strong');
      b.textContent = k;
      span.appendChild(b);
      span.appendChild(document.createTextNode(`: ${v}`));
      grid.appendChild(span);
    });
    details.appendChild(grid);
    legend.appendChild(details);
    wrap.appendChild(legend);
  }

  container.appendChild(wrap);
}

function buildBenchmarks(benchmarkData, container) {
  if (!benchmarkData || !benchmarkData.categories || benchmarkData.categories.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-state__icon';
    icon.textContent = '\uD83D\uDCCA';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'Benchmark Hub';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Benchmark directory will appear here once data/benchmarks.json is created. This is a manually curated collection of standard OR benchmark datasets.';
    empty.appendChild(icon);
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  const dir = document.createElement('div');
  dir.className = 'benchmark-directory';

  benchmarkData.categories.forEach(cat => {
    const catDiv = document.createElement('div');
    catDiv.className = 'benchmark-category';

    const catHeader = document.createElement('div');
    catHeader.className = 'benchmark-category__header';
    const h2 = document.createElement('h2');
    h2.textContent = cat.name;
    catHeader.appendChild(h2);
    const count = document.createElement('span');
    count.className = 'benchmark-category__count';
    count.textContent = `${cat.benchmarks.length} benchmark${cat.benchmarks.length !== 1 ? 's' : ''}`;
    catHeader.appendChild(count);
    catDiv.appendChild(catHeader);

    if (cat.description) {
      const desc = document.createElement('p');
      desc.className = 'benchmark-category__desc';
      desc.textContent = cat.description;
      catDiv.appendChild(desc);
    }

    const list = document.createElement('div');
    list.className = 'benchmark-list';

    cat.benchmarks.forEach(b => {
      const item = document.createElement('div');
      item.className = 'benchmark-item';

      const bHeader = document.createElement('div');
      bHeader.className = 'benchmark-item__header';
      const h3 = document.createElement('h3');
      h3.textContent = b.name;
      bHeader.appendChild(h3);
      if (b.instances) {
        const instCount = document.createElement('span');
        instCount.className = 'benchmark-item__count';
        instCount.textContent = `${b.instances} instances`;
        bHeader.appendChild(instCount);
      }
      item.appendChild(bHeader);

      if (b.full_name && b.full_name !== b.name) {
        const fn = document.createElement('p');
        fn.className = 'benchmark-item__fullname';
        fn.textContent = b.full_name;
        item.appendChild(fn);
      }

      if (b.description) {
        const desc = document.createElement('p');
        desc.className = 'benchmark-item__desc';
        desc.textContent = b.description;
        item.appendChild(desc);
      }

      const meta = document.createElement('div');
      meta.className = 'benchmark-item__meta';
      if (b.format) { const s = document.createElement('span'); s.textContent = `Format: ${b.format}`; meta.appendChild(s); }
      if (b.introduced_by) { const s = document.createElement('span'); s.textContent = `By: ${b.introduced_by}`; meta.appendChild(s); }
      if (b.maintained_by) { const s = document.createElement('span'); s.textContent = `Maintained: ${b.maintained_by}`; meta.appendChild(s); }
      item.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'benchmark-item__actions';
      const linkDefs = [
        [b.url, '\u2197 Website'],
        [b.download, '\u2B07 Download'],
        [b.introduced_paper_url, '\uD83D\uDCC4 Paper'],
        [b.best_known_solutions, '\uD83C\uDFC6 BKS'],
      ];
      linkDefs.forEach(([href, label]) => {
        if (!href) return;
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'card__action';
        a.textContent = label;
        actions.appendChild(a);
      });
      item.appendChild(actions);

      list.appendChild(item);
    });

    catDiv.appendChild(list);
    dir.appendChild(catDiv);
  });

  container.appendChild(dir);
}

function buildSoftwareDirectory(software, container) {
  if (software.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-state__icon';
    icon.textContent = '\uD83D\uDCE6';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'No Software Releases Found';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Software releases will appear once the pipeline fetches data.';
    empty.appendChild(icon);
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  const sorted = [...software].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const dir = document.createElement('div');
  dir.className = 'software-directory';

  sorted.forEach(s => {
    const item = document.createElement('div');
    item.className = 'software-item';

    const header = document.createElement('div');
    header.className = 'software-item__header';
    const h3 = document.createElement('h3');
    h3.textContent = s.name;
    header.appendChild(h3);
    const badge = document.createElement('span');
    badge.className = 'version-badge';
    badge.textContent = `v${s.version}`;
    header.appendChild(badge);
    if (s.date) {
      const dateEl = document.createElement('span');
      dateEl.className = 'software-item__date';
      dateEl.textContent = relativeTime(s.date);
      header.appendChild(dateEl);
    }
    item.appendChild(header);

    if (s.changelog) {
      const cl = document.createElement('p');
      cl.className = 'software-item__changelog';
      cl.textContent = s.changelog.length > 200 ? s.changelog.slice(0, 200) + '\u2026' : s.changelog;
      item.appendChild(cl);
    }

    if (s.tags && s.tags.length > 0) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'software-item__tags';
      s.tags.forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = t;
        tagsDiv.appendChild(span);
      });
      item.appendChild(tagsDiv);
    }

    const actions = document.createElement('div');
    actions.className = 'software-item__actions';
    if (s.url) {
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'card__action';
      a.textContent = '\u2197 GitHub';
      actions.appendChild(a);
    }
    const detailBtn = document.createElement('button');
    detailBtn.className = 'card__detail-btn card__action';
    detailBtn.dataset.id = s.id;
    detailBtn.textContent = 'Details';
    actions.appendChild(detailBtn);
    item.appendChild(actions);

    dir.appendChild(item);
  });

  container.appendChild(dir);
}
