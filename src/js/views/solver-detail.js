/**
 * Solver Detail Page — renders at #solvers/{id}
 * All data from static JSON files. Uses safe DOM methods exclusively.
 */

export function render(container, solverId, allData) {
  const solversData = allData.solvers;
  if (!solversData) {
    container.textContent = 'Solver data not loaded.';
    return;
  }
  const solvers = solversData.solvers || solversData;
  // Try pipeline data first, fall back to manual enriched data
  let solver = solvers.find(s => s.id === solverId);

  // Merge manual data if available
  const manualSolvers = allData.solversManual?.solvers || [];
  const manual = manualSolvers.find(s => s.id === solverId);
  if (manual) {
    solver = { ...solver, ...manual, problem_types: manual.problem_types || solver?.problem_types };
  }

  if (!solver) {
    const notFound = document.createElement('div');
    notFound.className = 'solver-detail-404';
    const msg = document.createElement('p');
    msg.textContent = `Solver "${solverId}" not found.`;
    notFound.appendChild(msg);
    const backLink = document.createElement('a');
    backLink.href = '#solvers';
    backLink.textContent = '\u2190 Back to solvers';
    notFound.appendChild(backLink);
    container.appendChild(notFound);
    return;
  }

  const page = document.createElement('div');
  page.className = 'solver-detail';

  // Banner for modeling tools (not actual solvers)
  const MODELING_TOOL_IDS = ['pyomo', 'jump', 'cvxpy', 'ampl', 'gams'];
  if (MODELING_TOOL_IDS.includes(solverId)) {
    const banner = document.createElement('div');
    banner.className = 'tool-not-solver-banner';
    const strong = document.createElement('strong');
    strong.textContent = 'Note: ';
    banner.appendChild(strong);
    banner.appendChild(document.createTextNode(solver.name + ' is a modeling framework, not a solver. It formulates optimization problems and passes them to solvers like Gurobi, HiGHS, or SCIP. '));
    const link = document.createElement('a');
    link.href = '#tools';
    link.textContent = 'View on the Modeling Tools page \u2192';
    banner.appendChild(link);
    page.appendChild(banner);
  }

  // Breadcrumb
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'breadcrumb';
  breadcrumb.setAttribute('aria-label', 'Breadcrumb');
  const bc1 = document.createElement('a');
  bc1.href = '#solvers';
  bc1.textContent = 'PORID';
  breadcrumb.appendChild(bc1);
  breadcrumb.appendChild(document.createTextNode(' \u203A '));
  const bc2 = document.createElement('a');
  bc2.href = '#solvers';
  bc2.textContent = 'Solvers';
  breadcrumb.appendChild(bc2);
  breadcrumb.appendChild(document.createTextNode(' \u203A '));
  const bc3 = document.createElement('span');
  bc3.className = 'breadcrumb-current';
  bc3.textContent = solver.name;
  breadcrumb.appendChild(bc3);
  page.appendChild(breadcrumb);

  // Header
  const header = document.createElement('header');
  header.className = 'solver-detail__header';
  const titleRow = document.createElement('div');
  titleRow.className = 'solver-detail__title-row';
  const h1 = document.createElement('h1');
  h1.textContent = solver.name;
  titleRow.appendChild(h1);
  if (solver.current_version) {
    const vBadge = document.createElement('span');
    vBadge.className = 'version-badge';
    vBadge.textContent = `v${solver.current_version}`;
    titleRow.appendChild(vBadge);
  }
  header.appendChild(titleRow);
  if (solver.vendor) {
    const vendor = document.createElement('p');
    vendor.className = 'solver-detail__vendor';
    vendor.textContent = solver.vendor;
    header.appendChild(vendor);
  }
  if (solver.description) {
    const desc = document.createElement('p');
    desc.className = 'solver-detail__desc';
    desc.textContent = solver.description;
    header.appendChild(desc);
  }

  // Links row
  const links = document.createElement('div');
  links.className = 'solver-detail__links';
  [
    { url: solver.website, label: 'Website \u2197' },
    { url: solver.docs_url, label: 'Docs \u2197' },
    { url: solver.github_repo ? `https://github.com/${solver.github_repo}` : (solver.github ? `https://github.com/${solver.github}` : null), label: 'GitHub \u2197' },
    { url: solver.pypi_package ? `https://pypi.org/project/${solver.pypi_package}` : null, label: 'PyPI \u2197' },
  ].filter(l => l.url).forEach(l => {
    const a = document.createElement('a');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'solver-detail__link';
    a.textContent = l.label;
    links.appendChild(a);
  });
  header.appendChild(links);
  page.appendChild(header);

  // --- Section builder helper ---
  function buildSection(id, title) {
    const section = document.createElement('section');
    section.className = 'solver-section';
    section.id = id;
    const h2 = document.createElement('h2');
    h2.textContent = title;
    section.appendChild(h2);
    return section;
  }

  function addDetailRow(parent, label, value) {
    const row = document.createElement('div');
    row.className = 'solver-detail-row';
    const lbl = document.createElement('span');
    lbl.className = 'solver-detail-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    const val = document.createElement('span');
    val.className = 'solver-detail-value';
    if (typeof value === 'string') {
      val.textContent = value;
    } else if (value instanceof HTMLElement) {
      val.appendChild(value);
    }
    row.appendChild(val);
    parent.appendChild(row);
  }

  // Section: Licensing & Cost
  const licSection = buildSection('licensing', 'Licensing & Cost');
  const licenseType = solver.license_type || solver.license?.type || (solver.open_source ? 'Open Source' : 'Commercial');
  addDetailRow(licSection, 'License Type', licenseType + (solver.license_spdx ? ` (${solver.license_spdx})` : ''));
  addDetailRow(licSection, 'Open Source', solver.open_source ? 'Yes' : 'No');
  if (solver.academic_free || solver.license?.academic_free) {
    addDetailRow(licSection, 'Academic License', solver.academic_details || solver.license?.academic_note || 'Available');
  }
  if (solver.commercial_pricing_note) {
    addDetailRow(licSection, 'Commercial Pricing', solver.commercial_pricing_note);
  }
  if (solver.licensing_gotcha) {
    const gotchaBox = document.createElement('div');
    gotchaBox.className = 'solver-gotcha-box';
    const gotchaTitle = document.createElement('h4');
    gotchaTitle.textContent = '\u26A0 Licensing Gotcha';
    gotchaBox.appendChild(gotchaTitle);
    const gotchaNotice = document.createElement('span');
    gotchaNotice.className = 'source-tag editorial';
    gotchaNotice.textContent = 'Editorial';
    const gotchaP = document.createElement('p');
    gotchaP.textContent = solver.licensing_gotcha;
    gotchaBox.appendChild(gotchaNotice);
    gotchaBox.appendChild(gotchaP);
    licSection.appendChild(gotchaBox);
  }
  page.appendChild(licSection);

  // Section: When to Use
  if ((solver.when_to_use && solver.when_to_use.length) || (solver.when_not_to_use && solver.when_not_to_use.length)) {
    const useSection = buildSection('when-to-use', 'When to Use / Not Use');
    const useGrid = document.createElement('div');
    useGrid.className = 'solver-use-grid';

    if (solver.when_to_use?.length) {
      const yesCol = document.createElement('div');
      yesCol.className = 'solver-use-col solver-use-yes';
      const yesH3 = document.createElement('h3');
      yesH3.textContent = 'Use when';
      yesCol.appendChild(yesH3);
      const yesList = document.createElement('ul');
      solver.when_to_use.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        yesList.appendChild(li);
      });
      yesCol.appendChild(yesList);
      useGrid.appendChild(yesCol);
    }

    if (solver.when_not_to_use?.length) {
      const noCol = document.createElement('div');
      noCol.className = 'solver-use-col solver-use-no';
      const noH3 = document.createElement('h3');
      noH3.textContent = "Don't use when";
      noCol.appendChild(noH3);
      const noList = document.createElement('ul');
      solver.when_not_to_use.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        noList.appendChild(li);
      });
      noCol.appendChild(noList);
      useGrid.appendChild(noCol);
    }

    const editorialP = document.createElement('p');
    editorialP.className = 'editorial-notice';
    const editTag = document.createElement('span');
    editTag.className = 'source-tag editorial';
    editTag.textContent = 'Editorial';
    editorialP.appendChild(editTag);
    editorialP.appendChild(document.createTextNode(' Recommendations based on solver characteristics and professional judgment. Not a substitute for benchmarking on your specific problem.'));
    useSection.insertBefore(editorialP, useGrid);

    useSection.appendChild(useGrid);
    page.appendChild(useSection);
  }

  // Section: Capabilities
  const capSection = buildSection('capabilities', 'Capabilities');
  if (solver.problem_types?.length) {
    const ptRow = document.createElement('div');
    ptRow.className = 'solver-detail-row';
    const ptLabel = document.createElement('span');
    ptLabel.className = 'solver-detail-label';
    ptLabel.textContent = 'Problem Types';
    ptRow.appendChild(ptLabel);
    const ptBadges = document.createElement('div');
    ptBadges.className = 'solver-badge-list';
    solver.problem_types.forEach(t => {
      const badge = document.createElement('span');
      badge.className = 'solver-problem';
      badge.textContent = t;
      ptBadges.appendChild(badge);
    });
    ptRow.appendChild(ptBadges);
    capSection.appendChild(ptRow);
  }
  if (solver.language_bindings?.length) {
    const langRow = document.createElement('div');
    langRow.className = 'solver-detail-row';
    const langLabel = document.createElement('span');
    langLabel.className = 'solver-detail-label';
    langLabel.textContent = 'Language Bindings';
    langRow.appendChild(langLabel);
    const langBadges = document.createElement('div');
    langBadges.className = 'solver-badge-list';
    solver.language_bindings.forEach(l => {
      const badge = document.createElement('span');
      badge.className = 'solver-lang-badge';
      badge.textContent = l;
      langBadges.appendChild(badge);
    });
    langRow.appendChild(langBadges);
    capSection.appendChild(langRow);
  }
  if (solver.compatible_modeling_tools?.length) {
    const toolRow = document.createElement('div');
    toolRow.className = 'solver-detail-row';
    const toolLabel = document.createElement('span');
    toolLabel.className = 'solver-detail-label';
    toolLabel.textContent = 'Compatible Tools';
    toolRow.appendChild(toolLabel);
    const toolBadges = document.createElement('div');
    toolBadges.className = 'solver-badge-list';
    solver.compatible_modeling_tools.forEach(t => {
      const a = document.createElement('a');
      a.href = '#tools';
      a.className = 'solver-tool-badge';
      a.textContent = t;
      toolBadges.appendChild(a);
    });
    toolRow.appendChild(toolBadges);
    capSection.appendChild(toolRow);
  }
  page.appendChild(capSection);

  // Section: Quick Start
  const qs = solver.quick_start;
  if (qs?.install) {
    const qsSection = buildSection('quick-start', 'Quick Start');
    const qsBox = document.createElement('div');
    qsBox.className = 'solver-qs-box';
    const installRow = document.createElement('div');
    installRow.className = 'solver-qs-install';
    const installCode = document.createElement('code');
    installCode.textContent = qs.install;
    installRow.appendChild(installCode);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'solver-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(qs.install);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
    installRow.appendChild(copyBtn);
    qsBox.appendChild(installRow);
    if (qs.code) {
      const codePre = document.createElement('pre');
      codePre.className = 'solver-qs-code';
      const codeEl = document.createElement('code');
      codeEl.textContent = qs.code;
      codePre.appendChild(codeEl);
      qsBox.appendChild(codePre);
    }
    qsSection.appendChild(qsBox);
    page.appendChild(qsSection);
  }

  // Section: Performance & Benchmarks
  const benchSection = buildSection('benchmarks', 'Performance & Benchmarks');
  if (solver.benchmark_tier) {
    addDetailRow(benchSection, 'Benchmark Tier', solver.benchmark_tier);
  }
  if (solver.benchmark_notes || solver.benchmark_note) {
    const benchP = document.createElement('p');
    benchP.className = 'solver-bench-notes';
    benchP.textContent = solver.benchmark_notes || solver.benchmark_note;
    benchSection.appendChild(benchP);
  }
  page.appendChild(benchSection);

  // Section: Ecosystem Health
  const ecoSection = buildSection('ecosystem', 'Ecosystem Health');
  const healthGrid = document.createElement('div');
  healthGrid.className = 'solver-health-grid';
  if (solver.github_stars != null && solver.github_stars >= 0) {
    const stat = createHealthStat(formatNumber(solver.github_stars), 'GitHub Stars');
    healthGrid.appendChild(stat);
  }
  if (solver.pypi_monthly_downloads != null && solver.pypi_monthly_downloads >= 0) {
    const stat = createHealthStat(formatNumber(solver.pypi_monthly_downloads), 'Monthly Downloads');
    healthGrid.appendChild(stat);
  }
  if (solver.current_version) {
    const stat = createHealthStat(solver.current_version, `Latest Version${solver.release_date ? ` (${solver.release_date})` : ''}`);
    healthGrid.appendChild(stat);
  }
  ecoSection.appendChild(healthGrid);
  if (solver.ecosystem_health && typeof solver.ecosystem_health === 'object') {
    if (solver.ecosystem_health.release_frequency) {
      addDetailRow(ecoSection, 'Release Frequency', solver.ecosystem_health.release_frequency);
    }
    if (solver.ecosystem_health.community) {
      addDetailRow(ecoSection, 'Community', solver.ecosystem_health.community);
    }
  } else if (typeof solver.ecosystem_health === 'string') {
    const ecoP = document.createElement('p');
    ecoP.textContent = solver.ecosystem_health;
    ecoSection.appendChild(ecoP);
  }
  page.appendChild(ecoSection);

  // Section: Data Freshness
  const metaDiv = document.createElement('div');
  metaDiv.className = 'solver-detail-meta';
  const verified = document.createElement('p');
  verified.textContent = `Data last verified: ${solver.last_verified || solver.ecosystem_health?.last_verified || 'Unknown'}`;
  metaDiv.appendChild(verified);
  const reportLink = document.createElement('a');
  reportLink.href = `https://github.com/mghnasiri/PORID/issues/new?title=${encodeURIComponent('Data correction: ' + solver.name)}`;
  reportLink.target = '_blank';
  reportLink.rel = 'noopener';
  reportLink.textContent = 'See an error? Report it on GitHub';
  metaDiv.appendChild(reportLink);
  page.appendChild(metaDiv);

  // Sources section
  if (solver.sources && Object.keys(solver.sources).length > 0) {
    const srcSection = document.createElement('section');
    srcSection.className = 'solver-section';
    srcSection.id = 'sources';

    const srcH2 = document.createElement('h2');
    srcH2.textContent = 'Sources';
    srcSection.appendChild(srcH2);

    const srcIntro = document.createElement('p');
    srcIntro.className = 'sources-intro';
    const editSpan = document.createElement('span');
    editSpan.className = 'source-tag editorial';
    editSpan.textContent = 'editorial';
    srcIntro.textContent = 'Every data point is sourced. Items marked ';
    srcIntro.appendChild(editSpan);
    srcIntro.appendChild(document.createTextNode(' reflect professional judgment.'));
    srcSection.appendChild(srcIntro);

    const dl = document.createElement('dl');
    dl.className = 'source-list';

    Object.entries(solver.sources).forEach(([key, src]) => {
      const item = document.createElement('div');
      item.className = 'source-item';

      const dt = document.createElement('dt');
      dt.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      item.appendChild(dt);

      const dd = document.createElement('dd');

      // Type tag
      const typeLabels = {
        'automated': 'Auto-tracked', 'vendor_docs': 'Vendor Docs', 'vendor_page': 'Vendor Page',
        'official_docs': 'Official Docs', 'benchmark_results': 'Benchmark Data',
        'community_estimate': 'Community Estimate', 'editorial': 'Editorial',
        'github': 'GitHub', 'pypi': 'PyPI', 'manual': 'Manual'
      };
      const tag = document.createElement('span');
      tag.className = 'source-tag ' + (src.type || 'manual');
      tag.textContent = typeLabels[src.type] || src.type || 'Manual';
      dd.appendChild(tag);

      // URL link
      if (src.url) {
        const a = document.createElement('a');
        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = src.url;
        a.className = 'source-url';
        dd.appendChild(a);
      }

      // Note
      if (src.note) {
        const note = document.createElement('span');
        note.className = 'source-note';
        note.textContent = src.note;
        dd.appendChild(note);
      }

      // Verified date
      if (src.verified) {
        const ver = document.createElement('span');
        ver.className = 'source-verified';
        ver.textContent = 'Verified: ' + src.verified;
        dd.appendChild(ver);
      }

      item.appendChild(dd);
      dl.appendChild(item);
    });

    srcSection.appendChild(dl);
    page.appendChild(srcSection);
  }

  container.textContent = '';
  container.appendChild(page);
}

function createHealthStat(value, label) {
  const stat = document.createElement('div');
  stat.className = 'solver-health-stat';
  const valEl = document.createElement('span');
  valEl.className = 'solver-health-value';
  valEl.textContent = value;
  stat.appendChild(valEl);
  const lblEl = document.createElement('span');
  lblEl.className = 'solver-health-label';
  lblEl.textContent = label;
  stat.appendChild(lblEl);
  return stat;
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
