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

/**
 * NF-08: Solver Comparison Wizard — progressive filtering UI
 * Extracts unique options from solver data and builds an interactive
 * multi-step filter that highlights matching rows in the table below.
 */
function buildSolverWizard(solversData, container, onFilter) {
  const solvers = solversData.solvers;

  // Collect unique problem types, license categories, and languages
  const problemTypes = [...new Set(solvers.flatMap(s => s.problem_types || []))].sort();
  const languages = [...new Set(
    solvers.flatMap(s => (s.language_bindings || []).filter(l => !['GAMS', 'AMPL'].includes(l)))
  )].sort();

  const state = { problemType: null, license: null, language: null };

  const wizard = document.createElement('div');
  wizard.className = 'solver-wizard';

  const heading = document.createElement('h3');
  heading.className = 'solver-wizard__title';
  heading.textContent = 'Find a Solver';
  wizard.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'solver-wizard__desc';
  desc.textContent = 'Narrow down solvers by answering each question. Click a selection again to deselect it.';
  wizard.appendChild(desc);

  // Result count
  const resultBar = document.createElement('div');
  resultBar.className = 'solver-wizard__result';

  function applyFilter() {
    const matching = solvers.filter(s => {
      if (state.problemType && !(s.problem_types || []).includes(state.problemType)) return false;
      if (state.license === 'open' && !s.open_source) return false;
      if (state.license === 'commercial' && s.open_source) return false;
      if (state.language && !(s.language_bindings || []).includes(state.language)) return false;
      return true;
    });
    const anyActive = state.problemType || state.license || state.language;
    if (anyActive) {
      resultBar.textContent = `${matching.length} solver${matching.length !== 1 ? 's' : ''} match your criteria`;
      resultBar.classList.add('solver-wizard__result--visible');
    } else {
      resultBar.textContent = '';
      resultBar.classList.remove('solver-wizard__result--visible');
    }
    onFilter(matching.map(s => s.id), anyActive);
  }

  function buildStep(label, options, stateKey) {
    const step = document.createElement('div');
    step.className = 'solver-wizard__step';
    const lbl = document.createElement('span');
    lbl.className = 'solver-wizard__label';
    lbl.textContent = label;
    step.appendChild(lbl);
    const pills = document.createElement('div');
    pills.className = 'solver-wizard__pills';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'solver-wizard__pill';
      btn.textContent = opt.label;
      btn.dataset.value = opt.value;
      btn.addEventListener('click', () => {
        if (state[stateKey] === opt.value) {
          state[stateKey] = null;
          btn.classList.remove('solver-wizard__pill--active');
        } else {
          state[stateKey] = opt.value;
          pills.querySelectorAll('.solver-wizard__pill').forEach(b => b.classList.remove('solver-wizard__pill--active'));
          btn.classList.add('solver-wizard__pill--active');
        }
        applyFilter();
      });
      pills.appendChild(btn);
    });
    step.appendChild(pills);
    return step;
  }

  // Step 1: Problem type
  wizard.appendChild(buildStep(
    'What problem type?',
    problemTypes.map(p => ({ label: p, value: p })),
    'problemType'
  ));

  // Step 2: License preference
  wizard.appendChild(buildStep(
    'License preference?',
    [
      { label: 'Commercial (incl. academic free)', value: 'commercial' },
      { label: 'Open Source Only', value: 'open' },
    ],
    'license'
  ));

  // Step 3: Language
  wizard.appendChild(buildStep(
    'Language?',
    languages.map(l => ({ label: l, value: l })),
    'language'
  ));

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.className = 'solver-wizard__reset';
  resetBtn.textContent = 'Clear All Filters';
  resetBtn.addEventListener('click', () => {
    state.problemType = null;
    state.license = null;
    state.language = null;
    wizard.querySelectorAll('.solver-wizard__pill--active').forEach(b => b.classList.remove('solver-wizard__pill--active'));
    applyFilter();
  });
  wizard.appendChild(resetBtn);

  wizard.appendChild(resultBar);
  container.appendChild(wizard);
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

  // Wizard filter callback — will be wired after table is built
  let tableBody = null;

  buildSolverWizard(solversData, container, (matchingIds, isFiltering) => {
    if (!tableBody) return;
    const rows = tableBody.querySelectorAll('.solver-row');
    rows.forEach(row => {
      const id = row.dataset.solverId;
      if (!isFiltering) {
        row.classList.remove('solver-row--dimmed', 'solver-row--highlighted');
        return;
      }
      if (matchingIds.includes(id)) {
        row.classList.add('solver-row--highlighted');
        row.classList.remove('solver-row--dimmed');
      } else {
        row.classList.add('solver-row--dimmed');
        row.classList.remove('solver-row--highlighted');
      }
    });
  });

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
  tableBody = tbody;
  solversData.solvers.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'solver-row';
    tr.dataset.solverId = s.id;

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

/** Category ID to filter-label mapping for benchmark type filters. */
const BENCHMARK_TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'mip', label: 'MIP' },
  { id: 'vrp', label: 'VRP' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'network', label: 'Network' },
  { id: 'sat-cp', label: 'CP' },
  { id: 'facility', label: 'Facility' },
];

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

  // --- Controls: search box + type filter buttons ---
  const controls = document.createElement('div');
  controls.className = 'benchmark-controls';

  const searchBox = document.createElement('input');
  searchBox.type = 'text';
  searchBox.className = 'benchmark-controls__search';
  searchBox.placeholder = 'Search benchmarks by name or description\u2026';
  searchBox.setAttribute('aria-label', 'Search benchmarks');
  controls.appendChild(searchBox);

  const filterRow = document.createElement('div');
  filterRow.className = 'benchmark-controls__filters';
  BENCHMARK_TYPE_FILTERS.forEach(f => {
    const btn = document.createElement('button');
    btn.className = `benchmark-filter-btn${f.id === 'all' ? ' benchmark-filter-btn--active' : ''}`;
    btn.dataset.type = f.id;
    btn.textContent = f.label;
    filterRow.appendChild(btn);
  });
  controls.appendChild(filterRow);
  container.appendChild(controls);

  // --- Directory container ---
  const dir = document.createElement('div');
  dir.className = 'benchmark-directory';

  /** Render visible categories/benchmarks based on current filter + search state. */
  function renderFiltered() {
    dir.textContent = '';
    const activeType = (controls.querySelector('.benchmark-filter-btn--active') || {}).dataset?.type || 'all';
    const query = searchBox.value.trim().toLowerCase();

    benchmarkData.categories.forEach(cat => {
      // Type filter
      if (activeType !== 'all' && cat.id !== activeType) return;

      // Search filter
      let visibleBenchmarks = cat.benchmarks;
      if (query) {
        visibleBenchmarks = cat.benchmarks.filter(b => {
          const haystack = `${b.name} ${b.full_name || ''} ${b.description || ''} ${(b.tags || []).join(' ')}`.toLowerCase();
          return haystack.includes(query);
        });
        if (visibleBenchmarks.length === 0) return;
      }

      const catDiv = document.createElement('div');
      catDiv.className = 'benchmark-category';

      // Collapsible header
      const catHeader = document.createElement('button');
      catHeader.className = 'benchmark-category__header benchmark-category__header--toggle';
      catHeader.setAttribute('aria-expanded', 'true');

      const headerLeft = document.createElement('span');
      headerLeft.className = 'benchmark-category__header-left';
      const chevron = document.createElement('span');
      chevron.className = 'benchmark-category__chevron';
      chevron.textContent = '\u25BC';
      headerLeft.appendChild(chevron);
      const h2 = document.createElement('h2');
      h2.textContent = cat.name;
      headerLeft.appendChild(h2);
      catHeader.appendChild(headerLeft);

      const headerRight = document.createElement('span');
      headerRight.className = 'benchmark-category__header-right';
      const count = document.createElement('span');
      count.className = 'benchmark-category__count';
      const totalInstances = visibleBenchmarks.reduce((s, b) => s + (b.instances || 0), 0);
      count.textContent = `${visibleBenchmarks.length} benchmark${visibleBenchmarks.length !== 1 ? 's' : ''}`;
      headerRight.appendChild(count);
      if (totalInstances > 0) {
        const instBadge = document.createElement('span');
        instBadge.className = 'benchmark-category__instances';
        instBadge.textContent = `${totalInstances.toLocaleString()} instances`;
        headerRight.appendChild(instBadge);
      }
      catHeader.appendChild(headerRight);
      catDiv.appendChild(catHeader);

      if (cat.description) {
        const desc = document.createElement('p');
        desc.className = 'benchmark-category__desc';
        desc.textContent = cat.description;
        catDiv.appendChild(desc);
      }

      const list = document.createElement('div');
      list.className = 'benchmark-list';

      visibleBenchmarks.forEach(b => {
        const item = document.createElement('div');
        item.className = 'benchmark-item';

        const bHeader = document.createElement('div');
        bHeader.className = 'benchmark-item__header';
        const h3 = document.createElement('h3');
        h3.textContent = b.name;
        bHeader.appendChild(h3);

        const badgeGroup = document.createElement('span');
        badgeGroup.className = 'benchmark-item__badges';
        if (b.format) {
          const fmtBadge = document.createElement('span');
          fmtBadge.className = 'benchmark-format-badge';
          fmtBadge.textContent = b.format;
          badgeGroup.appendChild(fmtBadge);
        }
        if (b.instances) {
          const instCount = document.createElement('span');
          instCount.className = 'benchmark-item__count';
          instCount.textContent = `${b.instances} instances`;
          badgeGroup.appendChild(instCount);
        }
        bHeader.appendChild(badgeGroup);
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

      // Collapse/expand toggle
      catHeader.addEventListener('click', () => {
        const expanded = catHeader.getAttribute('aria-expanded') === 'true';
        catHeader.setAttribute('aria-expanded', String(!expanded));
        list.style.display = expanded ? 'none' : '';
        const descEl = catDiv.querySelector('.benchmark-category__desc');
        if (descEl) descEl.style.display = expanded ? 'none' : '';
        chevron.textContent = expanded ? '\u25B6' : '\u25BC';
      });

      dir.appendChild(catDiv);
    });

    if (dir.children.length === 0) {
      const noResults = document.createElement('p');
      noResults.className = 'benchmark-no-results';
      noResults.textContent = 'No benchmarks match your search.';
      dir.appendChild(noResults);
    }
  }

  // Wire filter buttons
  controls.addEventListener('click', (e) => {
    const btn = e.target.closest('.benchmark-filter-btn');
    if (!btn) return;
    controls.querySelectorAll('.benchmark-filter-btn').forEach(b => b.classList.remove('benchmark-filter-btn--active'));
    btn.classList.add('benchmark-filter-btn--active');
    renderFiltered();
  });

  // Wire search input (debounced)
  let searchTimer;
  searchBox.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderFiltered, 200);
  });

  renderFiltered();
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
