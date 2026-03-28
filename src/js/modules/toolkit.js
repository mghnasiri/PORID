/**
 * Toolkit module — Solver Observatory, benchmarks, and software directory.
 *
 * Sub-routes: #toolkit/solvers, #toolkit/benchmarks, #toolkit/software
 *
 * Security: All data rendered comes from local static JSON files
 * (data/*.json), not from user input or external sources.
 */

import { relativeTime, formatDate } from '../utils/date.js';
import { DecisionHelper } from '../components/decision-helper.js';
import { showLastUpdated } from '../utils/data-loader.js';

// Modeling tools that should NOT appear in the solver comparison table
const MODELING_TOOL_IDS = ['pyomo', 'jump', 'cvxpy', 'ampl', 'gams'];

const SUB_TABS = [
  { key: '', label: 'Overview', icon: '\uD83D\uDEE0' },
  { key: 'solvers', label: 'Solvers', icon: '\u2699' },
  { key: 'benchmarks', label: 'Benchmarks', icon: '\uD83D\uDCCA' },
  { key: 'software', label: 'Software', icon: '\uD83D\uDCE6' },
  { key: 'tools', label: 'Modeling Tools', icon: '\uD83D\uDCDD' },
  { key: 'licensing', label: 'Licensing', icon: '\uD83D\uDCB0' },
];

/**
 * Main render function for the Toolkit view.
 *
 * Supports two calling patterns:
 *   1. Primary tabs (new): render(container, data, 'solvers', detailId)
 *      — No internal header/tabs rendered; top-level nav handles tab switching.
 *   2. Legacy route: render(container, data, sub)
 *      — Renders full toolkit view with internal sub-tabs (backward compat).
 *
 * @param {HTMLElement} container
 * @param {Object} allData
 * @param {string} [sub] - Sub-route or primary tab key
 * @param {string} [detail] - Detail ID (e.g., solver ID for detail page)
 */
export function render(container, allData, sub, detail) {
  const activeSub = sub || '';
  const software = allData.software || [];
  const solvers = allData.solvers || null;
  const benchmarks = allData.benchmarks || null;

  // Determine if we're called as a primary tab (no internal tabs needed)
  const PRIMARY_TABS = ['solvers', 'tools', 'benchmarks', 'licensing'];
  const isPrimaryTab = PRIMARY_TABS.includes(activeSub);

  container.textContent = '';

  const view = document.createElement('div');
  view.className = 'toolkit-view';

  if (!isPrimaryTab) {
    // Legacy mode: show internal header + sub-tabs
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
  }

  // Content
  const contentDiv = document.createElement('div');
  contentDiv.className = 'toolkit-view__content';

  // Check for solver detail sub-route: #solvers/{id} or #solvers/{id}
  const hashParts = (window.location.hash.replace('#', '') || '').split('/');
  const solverDetailId = detail || (hashParts[0] === 'solvers' && hashParts[1]) || (hashParts[1] === 'solvers' && hashParts[2]);
  if (activeSub === 'solvers' && solverDetailId) {
    import('../views/solver-detail.js').then(mod => {
      mod.render(contentDiv, solverDetailId, allData);
    });
    view.appendChild(contentDiv);
    container.appendChild(view);
    return;
  }

  switch (activeSub) {
    case 'solvers':
      buildSolvers(solvers, contentDiv, allData.decisionRules, allData);
      break;
    case 'benchmarks':
      buildBenchmarks(benchmarks, contentDiv);
      break;
    case 'software':
      buildSoftwareDirectory(software, contentDiv);
      break;
    case 'tools':
      buildModelingTools(allData.modelingTools, allData.compatibilityMatrix, contentDiv);
      break;
    case 'licensing':
      buildLicensingGuide(allData, contentDiv);
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

  // G40: Quick Answer hero
  const qaSection = document.createElement('section');
  qaSection.className = 'quick-answer';
  const qaH1 = document.createElement('h2');
  qaH1.textContent = 'What are you optimizing?';
  qaSection.appendChild(qaH1);
  const qaP = document.createElement('p');
  qaP.textContent = 'Click your problem type for an instant solver recommendation.';
  qaSection.appendChild(qaP);

  const qaCards = document.createElement('div');
  qaCards.className = 'qa-cards';

  const qaData = [
    { href: '#solvers?problem_type=mip', title: 'Linear / Mixed-Integer', desc: 'LP, MIP, ILP' },
    { href: '#solvers?problem_type=minlp', title: 'Nonlinear', desc: 'NLP, MINLP, QP' },
    { href: '#solvers?problem_type=cp', title: 'Constraint Programming', desc: 'Scheduling, Assignment' },
    { href: '#solvers?problem_type=vrp', title: 'Vehicle Routing', desc: 'TSP, VRP, CVRP' },
    { href: '#solvers?problem_type=sdp', title: 'Convex / Conic', desc: 'SDP, SOCP' },
    { href: '#solvers?budget=free', title: 'I need it free', desc: 'Open-source solvers only' },
  ];
  qaData.forEach(d => {
    const a = document.createElement('a');
    a.href = d.href;
    a.className = 'qa-card' + (d.title.includes('free') ? ' qa-highlight' : '');
    const h3 = document.createElement('h3');
    h3.textContent = d.title;
    a.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = d.desc;
    a.appendChild(p);
    qaCards.appendChild(a);
  });
  qaSection.appendChild(qaCards);
  overview.appendChild(qaSection);

  // Solver section
  const solverSection = buildSectionCard(
    'Solver Observatory',
    '#solvers',
    solvers
      ? `${solvers.solvers ? solvers.solvers.length : 0} solvers tracked. Compare features, licenses, and activity.`
      : 'Solver data will appear here once the pipeline generates solvers.json.'
  );
  overview.appendChild(solverSection);

  // Benchmark section
  const benchmarkSection = buildSectionCard(
    'Benchmark Hub',
    '#benchmarks',
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
  link.href = '#feed/software';
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

/** VD-08: compute release recency tier for a solver */
function releaseActivityTier(releaseDate) {
  if (!releaseDate) return { tier: 'unknown', label: 'Unknown', color: 'gray' };
  const now = new Date();
  const rel = new Date(releaseDate);
  const months = (now - rel) / (1000 * 60 * 60 * 24 * 30);
  if (months <= 3) return { tier: 'active', label: 'Active (< 3 mo)', color: 'green' };
  if (months <= 6) return { tier: 'moderate', label: 'Moderate (3-6 mo)', color: 'yellow' };
  return { tier: 'stale', label: 'Stale (> 6 mo)', color: 'red' };
}

/** VD-02: Canonical problem type columns for the heatmap */
const HEATMAP_PROBLEM_TYPES = ['LP', 'MIP', 'QP', 'SOCP', 'SDP', 'MINLP', 'CP', 'VRP'];

// ── Starter Paths data + builder ──
const STARTER_PATHS = {
  'python-beginner': {
    title: 'Python Beginner Path',
    solver: { id: 'cbc', name: 'CBC', why: 'Comes bundled with PuLP \u2014 zero setup. Good enough for learning and small problems.' },
    solver_upgrade: { id: 'highs', name: 'HiGHS', why: 'When you outgrow CBC, HiGHS is the best free upgrade. Same PuLP interface, much faster.' },
    modeling_tool: { id: 'pulp', name: 'PuLP', why: 'Simplest Python modeling library. You will write your first LP in 30 minutes.' },
    benchmark: 'Start with small custom instances. When ready, try MIPLIB 2017 easy instances.',
    first_steps: [
      'pip install pulp',
      'Copy the production planning example from the Modeling Tools page',
      'Run it \u2014 CBC is already included, no solver install needed',
      'Modify constraints and re-solve to build intuition',
      'When ready for harder problems, pip install highspy and switch solver in one line'
    ],
    time_to_first_model: '30 minutes'
  },
  'free-only': {
    title: 'Free / Open Source Path',
    solver: { id: 'highs', name: 'HiGHS', why: 'Best open-source LP/MIP solver. MIT licensed. No restrictions.' },
    solver_alt: { id: 'scip', name: 'SCIP', why: 'Best open-source option for MINLP and research. Apache 2.0 license.' },
    modeling_tool: { id: 'pyomo', name: 'Pyomo', why: 'Most solver-agnostic. Switch between HiGHS, SCIP, CBC, GLPK without code changes.' },
    benchmark: 'MIPLIB 2017 for MIP, CVRPLIB for routing, TSPLIB for TSP.',
    first_steps: [
      'pip install pyomo highspy',
      'Write your model in Pyomo with HiGHS as solver',
      'If you need MINLP: pip install pyscipopt',
      'For constraint programming: pip install ortools (CP-SAT is free)',
      'All of these are production-usable with no license restrictions'
    ],
    time_to_first_model: '1 hour'
  },
  'phd-mip': {
    title: 'PhD MIP Research Path',
    solver: { id: 'gurobi', name: 'Gurobi', why: 'Fastest MIP solver. Free academic license with no variable limits. Apply at gurobi.com/academia.' },
    solver_fallback: { id: 'highs', name: 'HiGHS', why: 'Your fallback when the academic license expires. Write solver-agnostic code from day one.' },
    modeling_tool: { id: 'pyomo', name: 'Pyomo', why: 'Solver-agnostic modeling lets you benchmark Gurobi vs CPLEX vs HiGHS without rewriting.' },
    modeling_alt: { id: 'jump', name: 'JuMP (Julia)', why: 'If your group uses Julia, JuMP is excellent and equally solver-agnostic.' },
    benchmark: 'MIPLIB 2017 is the standard benchmark for MIP research. Use it for computational experiments.',
    first_steps: [
      'Apply for Gurobi academic license (takes 1-2 days)',
      'pip install pyomo gurobipy',
      'Write your model in Pyomo (NOT gurobipy directly \u2014 keep solver-agnostic)',
      'Test on MIPLIB easy set first, then graduate to harder instances',
      'Before graduation: verify your code runs with HiGHS as a drop-in replacement'
    ],
    time_to_first_model: '1 hour (after license approval)'
  },
  'scheduling': {
    title: 'Scheduling & Constraint Programming Path',
    solver: { id: 'or-tools', name: 'OR-Tools CP-SAT', why: "Google's CP-SAT solver is state-of-the-art for scheduling, assignment, and constraint satisfaction. Free." },
    solver_alt: { id: 'hexaly', name: 'Hexaly', why: 'For very large scheduling problems where CP-SAT is slow. Commercial but powerful heuristic approach.' },
    modeling_tool: { id: 'or-tools', name: 'OR-Tools (direct API)', why: 'CP-SAT has its own Python API \u2014 no separate modeling tool needed.' },
    benchmark: 'PSPLIB for project scheduling, OR-Library for assignment problems.',
    first_steps: [
      'pip install ortools',
      'Start with the job-shop scheduling example in OR-Tools documentation',
      'CP-SAT uses a different paradigm than LP/MIP \u2014 you define variables, domains, and constraints',
      'For nurse scheduling, vehicle routing, or bin packing: OR-Tools has dedicated APIs',
      'If CP-SAT is too slow on your instance size, evaluate Hexaly (commercial)'
    ],
    time_to_first_model: '45 minutes'
  },
  'production': {
    title: 'Production-Ready Path',
    solver: { id: 'gurobi', name: 'Gurobi', why: 'Industry standard for production MIP. Best support, best performance, proven at scale.' },
    solver_alt: { id: 'cplex', name: 'CPLEX', why: 'Alternative if your organization already has an IBM relationship.' },
    modeling_tool: { id: 'pyomo', name: 'Pyomo', why: 'Solver-agnostic modeling means you can switch solvers without rewriting your application.' },
    benchmark: 'Benchmark on your actual production data, not standard benchmarks.',
    first_steps: [
      'Get a Gurobi trial license or CPLEX trial from IBM',
      'Build your model in Pyomo \u2014 NOT in the solver\'s native API',
      'Test with HiGHS first (free) to validate your formulation',
      'Then switch to Gurobi/CPLEX for production performance',
      'Plan for: licensing cost per machine, cloud deployment licensing, solver version pinning'
    ],
    time_to_first_model: '2-4 hours (including procurement)'
  },
  'julia': {
    title: 'Julia Path',
    solver: { id: 'highs', name: 'HiGHS', why: 'Best free solver for Julia via JuMP. One-line install.' },
    solver_upgrade: { id: 'gurobi', name: 'Gurobi', why: 'When you need maximum performance. JuMP switches solvers in one line.' },
    modeling_tool: { id: 'jump', name: 'JuMP', why: 'The only serious modeling tool for Julia. Beautiful syntax, broad solver support, excellent documentation.' },
    benchmark: 'Same as Python: MIPLIB for MIP, TSPLIB for TSP.',
    first_steps: [
      'using Pkg; Pkg.add(["JuMP", "HiGHS"])',
      'JuMP syntax is very close to mathematical notation \u2014 model = Model(HiGHS.Optimizer)',
      'Switch to Gurobi later: Pkg.add("Gurobi"); model = Model(Gurobi.Optimizer)',
      'Julia is faster than Python for model building (not solving) \u2014 matters for large models',
      'JuMP ecosystem includes Convex.jl (like CVXPY) and Constraint Solver packages'
    ],
    time_to_first_model: '20 minutes'
  }
};

function buildStarterPaths(container) {
  const section = document.createElement('section');
  section.className = 'starter-paths';

  const h2 = document.createElement('h2');
  h2.textContent = 'Not sure where to start?';
  section.appendChild(h2);

  const grid = document.createElement('div');
  grid.className = 'path-cards';

  const pathEntries = [
    ['python-beginner', "I'm a Python beginner", '\u2192 PuLP + CBC (free, 30 min to first model)'],
    ['free-only', 'I need everything free', '\u2192 HiGHS or SCIP + Pyomo'],
    ['phd-mip', 'PhD student, doing MIP research', '\u2192 Gurobi (academic) + Pyomo + MIPLIB'],
    ['scheduling', "I'm solving scheduling problems", '\u2192 OR-Tools CP-SAT or Hexaly'],
    ['production', 'I need production-ready', '\u2192 Gurobi or CPLEX + solver-agnostic modeler'],
    ['julia', 'I use Julia', '\u2192 JuMP + HiGHS (or Gurobi)'],
  ];

  pathEntries.forEach(([key, title, result]) => {
    const btn = document.createElement('button');
    btn.className = 'path-card';
    btn.dataset.path = key;
    const t = document.createElement('span');
    t.className = 'path-title';
    t.textContent = title;
    const r = document.createElement('span');
    r.className = 'path-result';
    r.textContent = result;
    btn.appendChild(t);
    btn.appendChild(r);
    grid.appendChild(btn);
  });

  section.appendChild(grid);

  const detailPanel = document.createElement('div');
  detailPanel.id = 'path-detail';
  detailPanel.className = 'path-detail-panel';
  detailPanel.style.display = 'none';
  section.appendChild(detailPanel);

  // Wire click handlers
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.path-card');
    if (!card) return;
    grid.querySelectorAll('.path-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    renderPathDetail(card.dataset.path, detailPanel);
  });

  container.appendChild(section);
}

function renderPathDetail(pathId, panel) {
  const path = STARTER_PATHS[pathId];
  if (!path) return;

  panel.style.display = 'block';
  panel.textContent = '';

  const expanded = document.createElement('div');
  expanded.className = 'path-expanded';

  const h3 = document.createElement('h3');
  h3.textContent = path.title;
  expanded.appendChild(h3);

  const stack = document.createElement('div');
  stack.className = 'path-stack';

  // Helper to add a stack item
  function addStackItem(label, name, id, why) {
    const item = document.createElement('div');
    item.className = 'stack-item';
    const lbl = document.createElement('span');
    lbl.className = 'stack-label';
    lbl.textContent = label;
    item.appendChild(lbl);
    if (id) {
      const link = document.createElement('a');
      link.className = 'stack-link';
      link.href = `#solvers/${id}`;
      link.textContent = name;
      item.appendChild(link);
    }
    const whyP = document.createElement('p');
    whyP.className = 'stack-why';
    whyP.textContent = why;
    item.appendChild(whyP);
    stack.appendChild(item);
  }

  addStackItem('Recommended Solver', path.solver.name, path.solver.id, path.solver.why);
  if (path.solver_upgrade) addStackItem('Upgrade Path', path.solver_upgrade.name, path.solver_upgrade.id, path.solver_upgrade.why);
  if (path.solver_alt) addStackItem('Alternative', path.solver_alt.name, path.solver_alt.id, path.solver_alt.why);
  if (path.solver_fallback) addStackItem('Fallback (when license expires)', path.solver_fallback.name, path.solver_fallback.id, path.solver_fallback.why);
  addStackItem('Modeling Tool', path.modeling_tool.name, null, path.modeling_tool.why);
  if (path.modeling_alt) addStackItem('Alternative Tool', path.modeling_alt.name, null, path.modeling_alt.why);
  addStackItem('Benchmarks', '', null, path.benchmark);

  expanded.appendChild(stack);

  // Steps
  const stepsDiv = document.createElement('div');
  stepsDiv.className = 'path-steps';
  const h4 = document.createElement('h4');
  h4.textContent = `Get started (${path.time_to_first_model} to first model)`;
  stepsDiv.appendChild(h4);
  const ol = document.createElement('ol');
  path.first_steps.forEach(step => {
    const li = document.createElement('li');
    li.textContent = step;
    ol.appendChild(li);
  });
  stepsDiv.appendChild(ol);
  expanded.appendChild(stepsDiv);

  panel.appendChild(expanded);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildSolvers(solversData, container, decisionRules, allData) {
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

  // Breadcrumb
  const bc = document.createElement('nav');
  bc.className = 'breadcrumb';
  bc.setAttribute('aria-label', 'Breadcrumb');
  const bcHome = document.createElement('a');
  bcHome.href = '#solvers';
  bcHome.textContent = 'PORID';
  bc.appendChild(bcHome);
  bc.appendChild(document.createTextNode(' \u203A '));
  const bcCurrent = document.createElement('span');
  bcCurrent.className = 'breadcrumb-current';
  bcCurrent.textContent = 'Solvers';
  bc.appendChild(bcCurrent);
  container.appendChild(bc);

  // ── Hero chooser: "What are you optimizing?" ──
  const hero = document.createElement('section');
  hero.className = 'hero-chooser';
  hero.innerHTML = `
    <h1>What are you optimizing?</h1>
    <p class="hero-sub">Choose your problem type for an instant solver recommendation. Or use the filters below.</p>
    <div class="problem-cards">
      <a href="#solvers?problem_type=mip" class="pcard"><span class="pcard-label">Linear / MIP</span><span class="pcard-desc">LP, MIP, ILP</span></a>
      <a href="#solvers?problem_type=minlp" class="pcard"><span class="pcard-label">Nonlinear</span><span class="pcard-desc">NLP, MINLP, QP</span></a>
      <a href="#solvers?problem_type=cp" class="pcard"><span class="pcard-label">Constraint Programming</span><span class="pcard-desc">Scheduling, Assignment</span></a>
      <a href="#solvers?problem_type=vrp" class="pcard"><span class="pcard-label">Vehicle Routing</span><span class="pcard-desc">TSP, VRP, CVRP</span></a>
      <a href="#solvers?problem_type=sdp" class="pcard"><span class="pcard-label">Convex / Conic</span><span class="pcard-desc">SDP, SOCP</span></a>
      <a href="#solvers?budget=free" class="pcard pcard-free"><span class="pcard-label">Free &amp; Open Source</span><span class="pcard-desc">No license required</span></a>
    </div>
  `;
  container.appendChild(hero);

  // Data freshness badge
  showLastUpdated(container);

  // ── Starter Paths: "Not sure where to start?" ──
  buildStarterPaths(container);

  // Decision Helper (scoring-based recommendation wizard)
  if (decisionRules && decisionRules.scores) {
    const dhMount = document.createElement('div');
    dhMount.id = 'decision-helper-mount';
    container.appendChild(dhMount);
    const dh = new DecisionHelper(dhMount, decisionRules, solversData.solvers);
    dh.render();
  }

  // Separate modeling tools from actual solvers for table/heatmap/charts
  const allSolvers = solversData.solvers;
  const solversForTable = allSolvers.filter(s => !MODELING_TOOL_IDS.includes(s.id));

  let tableBody = null;

  /* ── VD-05: Comparison bar (hidden until 2-4 solvers checked) ── */
  const compareBar = document.createElement('div');
  compareBar.className = 'solver-compare-bar';
  compareBar.style.display = 'none';
  const compareInfo = document.createElement('span');
  compareInfo.className = 'solver-compare-bar__info';
  compareBar.appendChild(compareInfo);
  const compareBtn = document.createElement('button');
  compareBtn.className = 'solver-compare-bar__btn';
  compareBtn.textContent = 'Compare Selected';
  compareBar.appendChild(compareBtn);
  container.appendChild(compareBar);

  const selectedSolverIds = new Set();

  function updateCompareBar() {
    const count = selectedSolverIds.size;
    if (count >= 2 && count <= 4) {
      compareBar.style.display = 'flex';
      compareInfo.textContent = `${count} solvers selected`;
    } else {
      compareBar.style.display = 'none';
    }
  }

  /* ── VD-05: Comparison panel ── */
  const comparePanel = document.createElement('div');
  comparePanel.className = 'solver-compare-panel';
  comparePanel.style.display = 'none';
  container.appendChild(comparePanel);

  function openComparePanel() {
    const selected = solversForTable.filter(s => selectedSolverIds.has(s.id));
    if (selected.length < 2) return;
    comparePanel.textContent = '';
    comparePanel.style.display = 'block';

    const panelHeader = document.createElement('div');
    panelHeader.className = 'solver-compare-panel__header';
    const panelTitle = document.createElement('h3');
    panelTitle.textContent = 'Side-by-Side Comparison';
    panelHeader.appendChild(panelTitle);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'solver-compare-panel__close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => { comparePanel.style.display = 'none'; });
    panelHeader.appendChild(closeBtn);
    comparePanel.appendChild(panelHeader);

    const cTable = document.createElement('table');
    cTable.className = 'solver-compare-table';
    const cThead = document.createElement('thead');
    const cHeaderRow = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.textContent = 'Feature';
    cHeaderRow.appendChild(cornerTh);
    selected.forEach(s => {
      const th = document.createElement('th');
      th.textContent = s.name;
      cHeaderRow.appendChild(th);
    });
    cThead.appendChild(cHeaderRow);
    cTable.appendChild(cThead);

    const cTbody = document.createElement('tbody');
    const featureRows = [
      { label: 'Version', fn: s => `v${s.current_version}` },
      { label: 'Release Date', fn: s => s.release_date ? formatDate(s.release_date) : 'N/A' },
      { label: 'License', fn: s => {
        if (s.open_source) return s.license?.type || 'Open Source';
        return s.license?.academic_free ? `${s.license.type} (Acad. Free)` : s.license?.type || 'Commercial';
      }},
      { label: 'Problem Types', fn: s => (s.problem_types || []).join(', ') || 'N/A' },
      { label: 'Languages', fn: s => (s.language_bindings || []).join(', ') || 'N/A' },
      { label: 'GitHub Stars', fn: s => s.github_stars != null && s.github_stars >= 0 ? s.github_stars.toLocaleString() : 'N/A' },
      { label: 'PyPI Downloads/mo', fn: s => s.pypi_monthly_downloads != null && s.pypi_monthly_downloads >= 0 ? s.pypi_monthly_downloads.toLocaleString() : 'N/A' },
      { label: 'Activity', fn: s => releaseActivityTier(s.release_date).label },
    ];
    featureRows.forEach(({ label, fn }) => {
      const row = document.createElement('tr');
      const th = document.createElement('td');
      th.className = 'solver-compare-table__label';
      th.textContent = label;
      row.appendChild(th);
      selected.forEach(s => {
        const td = document.createElement('td');
        td.textContent = fn(s);
        row.appendChild(td);
      });
      cTbody.appendChild(row);
    });
    cTable.appendChild(cTbody);
    comparePanel.appendChild(cTable);
  }

  compareBtn.addEventListener('click', openComparePanel);

  const wrap = document.createElement('div');
  wrap.className = 'solver-table-wrap';

  const table = document.createElement('table');
  table.className = 'solver-table';

  // thead — added Compare checkbox column and Activity column (VD-05, VD-08)
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thCheck = document.createElement('th');
  thCheck.className = 'solver-th-check';
  thCheck.title = 'Select solvers to compare';
  headerRow.appendChild(thCheck);
  ['Solver', 'Version', 'Activity', 'License', 'Problem Types', 'Languages', 'Links'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // tbody
  const tbody = document.createElement('tbody');
  tableBody = tbody;
  solversForTable.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'solver-row';
    tr.dataset.solverId = s.id;

    // VD-05: Checkbox cell
    const tdCheck = document.createElement('td');
    tdCheck.className = 'solver-row__check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'solver-compare-cb';
    checkbox.title = `Select ${s.name} for comparison`;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (selectedSolverIds.size >= 4) { checkbox.checked = false; return; }
        selectedSolverIds.add(s.id);
      } else {
        selectedSolverIds.delete(s.id);
      }
      updateCompareBar();
    });
    tdCheck.appendChild(checkbox);
    tr.appendChild(tdCheck);

    // Name
    const tdName = document.createElement('td');
    tdName.className = 'solver-row__name';
    const nameLink = document.createElement('a');
    nameLink.href = `#solvers/${s.id}`;
    nameLink.className = 'solver-name-link';
    const nameStrong = document.createElement('strong');
    nameStrong.textContent = s.name;
    nameLink.appendChild(nameStrong);
    tdName.appendChild(nameLink);
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

    // VD-08: Activity indicator
    const tdActivity = document.createElement('td');
    tdActivity.className = 'solver-row__activity';
    const activity = releaseActivityTier(s.release_date);
    const actBar = document.createElement('span');
    actBar.className = `solver-activity-bar solver-activity-bar--${activity.color}`;
    actBar.title = activity.label;
    tdActivity.appendChild(actBar);
    const actLabel = document.createElement('span');
    actLabel.className = 'solver-activity-label';
    actLabel.textContent = activity.tier === 'active' ? 'Active' : activity.tier === 'moderate' ? 'Moderate' : activity.tier === 'stale' ? 'Stale' : '?';
    tdActivity.appendChild(actLabel);
    // H47: Health warning for old projects
    if (s.release_date) {
      const daysSince = Math.floor((new Date() - new Date(s.release_date)) / 86400000);
      if (daysSince > 730) {
        const warn = document.createElement('span');
        warn.className = 'health-warning health-warning--critical';
        warn.textContent = 'Unmaintained';
        warn.title = `No release in ${Math.floor(daysSince / 365)}+ years`;
        tdActivity.appendChild(warn);
      } else if (daysSince > 365) {
        const warn = document.createElement('span');
        warn.className = 'health-warning health-warning--warning';
        warn.textContent = 'Slow';
        warn.title = 'No release in over a year';
        tdActivity.appendChild(warn);
      }
    }
    tr.appendChild(tdActivity);

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

    // R4-13: Solver Changelog Timeline — expandable row for recent_changes
    if (s.recent_changes) {
      const changelogTr = document.createElement('tr');
      changelogTr.className = 'solver-changelog-row';
      changelogTr.dataset.solverId = s.id;
      const changelogTd = document.createElement('td');
      changelogTd.colSpan = 8;
      changelogTd.className = 'solver-changelog-cell';

      const details = document.createElement('details');
      details.className = 'solver-changelog';
      const summary = document.createElement('summary');
      summary.className = 'solver-changelog__summary';
      summary.textContent = 'Changelog';
      details.appendChild(summary);

      const timeline = document.createElement('div');
      timeline.className = 'solver-changelog__timeline';

      const entry = document.createElement('div');
      entry.className = 'solver-changelog__entry';
      const versionBadge = document.createElement('span');
      versionBadge.className = 'solver-changelog__version';
      versionBadge.textContent = `v${s.current_version}`;
      entry.appendChild(versionBadge);
      if (s.release_date) {
        const dateSpan = document.createElement('span');
        dateSpan.className = 'solver-changelog__date';
        dateSpan.textContent = formatDate(s.release_date);
        entry.appendChild(dateSpan);
      }
      const changeText = document.createElement('span');
      changeText.className = 'solver-changelog__text';
      changeText.textContent = s.recent_changes;
      entry.appendChild(changeText);

      timeline.appendChild(entry);
      details.appendChild(timeline);
      changelogTd.appendChild(details);
      changelogTr.appendChild(changelogTd);
      tbody.appendChild(changelogTr);
    }
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

  // VD-03: Solver Release Timeline (swimlane view, last 2 years)
  buildSolverTimeline(solversForTable, container);

  // VD-02: Coverage Heatmap
  buildCoverageHeatmap(solversForTable, container);

  buildCostPerformanceChart(solversForTable, container);
  buildPerformanceCalculator(container);
}

/**
 * VD-02: Build a coverage heatmap grid -- rows = solvers, columns = problem types.
 * Cells are colored green (supported) or gray (unsupported). Column headers are
 * sortable: clicking a header reorders solvers so those supporting that type appear first.
 */
function buildCoverageHeatmap(solvers, container) {
  const section = document.createElement('div');
  section.className = 'solver-heatmap-section';

  const heading = document.createElement('h3');
  heading.className = 'solver-heatmap__title';
  heading.textContent = 'Problem Type Coverage';
  section.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'solver-heatmap__desc';
  desc.textContent = 'Click a column header to sort solvers by support for that problem type.';
  section.appendChild(desc);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'solver-heatmap-wrap';

  let sortCol = null;
  let sortAsc = false;

  function renderHeatmap() {
    tableWrap.textContent = '';

    let sorted = [...solvers];
    if (sortCol) {
      sorted.sort((a, b) => {
        const aHas = (a.problem_types || []).includes(sortCol) ? 1 : 0;
        const bHas = (b.problem_types || []).includes(sortCol) ? 1 : 0;
        return sortAsc ? aHas - bHas : bHas - aHas;
      });
    }

    const table = document.createElement('table');
    table.className = 'solver-heatmap';

    const thead = document.createElement('thead');
    const hRow = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.textContent = 'Solver';
    hRow.appendChild(cornerTh);
    HEATMAP_PROBLEM_TYPES.forEach(pt => {
      const th = document.createElement('th');
      th.className = 'solver-heatmap__col-header';
      th.textContent = pt;
      th.title = `Sort by ${pt} support`;
      if (sortCol === pt) th.classList.add('solver-heatmap__col-header--active');
      th.addEventListener('click', () => {
        if (sortCol === pt) { sortAsc = !sortAsc; } else { sortCol = pt; sortAsc = false; }
        renderHeatmap();
      });
      hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    sorted.forEach(s => {
      const row = document.createElement('tr');
      const tdName = document.createElement('td');
      tdName.className = 'solver-heatmap__solver-name';
      tdName.textContent = s.name;
      row.appendChild(tdName);
      HEATMAP_PROBLEM_TYPES.forEach(pt => {
        const td = document.createElement('td');
        const types = s.problem_types || [];
        const TYPE_ALIASES = {
          'VRP': ['VRP', 'Routing'],
          'CP': ['CP', 'Scheduling', 'CIP'],
          'MINLP': ['MINLP', 'NLP'],
        };
        const aliases = TYPE_ALIASES[pt] || [pt];
        const supported = aliases.some(a => types.includes(a));
        td.className = supported ? 'solver-heatmap__cell solver-heatmap__cell--yes' : 'solver-heatmap__cell solver-heatmap__cell--no';
        td.title = supported ? `${s.name}: supports ${pt}` : `${s.name}: no ${pt}`;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  renderHeatmap();
  section.appendChild(tableWrap);
  container.appendChild(section);
}

function buildCostPerformanceChart(solvers, container) {
  const section = document.createElement('section');
  section.className = 'solver-section';
  const h2 = document.createElement('h2');
  h2.textContent = 'Performance vs. Cost';
  section.appendChild(h2);
  const subtitle = document.createElement('p');
  subtitle.className = 'chart-subtitle';
  subtitle.textContent = 'Higher is better performance. Left is cheaper. Green = open source.';
  section.appendChild(subtitle);

  const width = 700, height = 400, padding = 60;
  const data = solvers.filter(s => s.benchmark_tier || s.open_source !== undefined).map(s => {
    const tier = (s.benchmark_tier || '').includes('Tier 1') ? 3 : (s.benchmark_tier || '').includes('Tier 2') ? 2 : 1;
    let cost = 0;
    if (!s.open_source) cost = s.id === 'gurobi' ? 12000 : s.id === 'cplex' ? 10000 : s.id === 'mosek' ? 2500 : s.id === 'baron' ? 5000 : s.id === 'hexaly' ? 10000 : s.id === 'xpress' ? 8000 : 5000;
    return { name: s.name.split(' ')[0], id: s.id, cost, tier, open_source: s.open_source };
  }).filter(d => !['pyomo','jump','cvxpy','pulp','scipy','ampl','gams'].includes(d.id));

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'cost-perf-chart');
  svg.style.width = '100%';
  svg.style.maxWidth = '700px';

  // Axes
  const xAxis = document.createElementNS(svgNS, 'line');
  xAxis.setAttribute('x1', padding); xAxis.setAttribute('y1', height - padding);
  xAxis.setAttribute('x2', width - padding); xAxis.setAttribute('y2', height - padding);
  xAxis.setAttribute('stroke', '#8892B0'); xAxis.setAttribute('stroke-opacity', '0.3');
  svg.appendChild(xAxis);

  const yAxis = document.createElementNS(svgNS, 'line');
  yAxis.setAttribute('x1', padding); yAxis.setAttribute('y1', padding);
  yAxis.setAttribute('x2', padding); yAxis.setAttribute('y2', height - padding);
  yAxis.setAttribute('stroke', '#8892B0'); yAxis.setAttribute('stroke-opacity', '0.3');
  svg.appendChild(yAxis);

  // Labels
  const xLabel = document.createElementNS(svgNS, 'text');
  xLabel.setAttribute('x', width / 2); xLabel.setAttribute('y', height - 10);
  xLabel.setAttribute('text-anchor', 'middle'); xLabel.setAttribute('fill', '#8892B0');
  xLabel.setAttribute('font-size', '12');
  xLabel.textContent = 'Annual License Cost →';
  svg.appendChild(xLabel);

  // Y ticks
  ['Tier 3', 'Tier 2', 'Tier 1'].forEach((label, i) => {
    const t = document.createElementNS(svgNS, 'text');
    const y = height - padding - ((i + 1) / 3) * (height - 2 * padding);
    t.setAttribute('x', padding - 10); t.setAttribute('y', y + 4);
    t.setAttribute('text-anchor', 'end'); t.setAttribute('fill', '#8892B0');
    t.setAttribute('font-size', '11');
    t.textContent = label;
    svg.appendChild(t);
  });

  // X ticks
  ['$0', '~$5K', '~$10K', '$15K+'].forEach((label, i) => {
    const t = document.createElementNS(svgNS, 'text');
    const x = padding + (i / 3) * (width - 2 * padding);
    t.setAttribute('x', x); t.setAttribute('y', height - padding + 18);
    t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', '#8892B0');
    t.setAttribute('font-size', '11');
    t.textContent = label;
    svg.appendChild(t);
  });

  // Data points
  data.forEach(d => {
    const cx = padding + (d.cost / 15000) * (width - 2 * padding);
    const cy = height - padding - (d.tier / 3) * (height - 2 * padding);
    const color = d.open_source ? '#50c878' : '#C5A059';

    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
    circle.setAttribute('r', '8'); circle.setAttribute('fill', color);
    circle.setAttribute('fill-opacity', '0.7');
    circle.setAttribute('stroke', color); circle.setAttribute('stroke-width', '1.5');
    circle.style.cursor = 'pointer';
    circle.addEventListener('click', () => { window.location.hash = `toolkit/solvers/${d.id}`; });
    svg.appendChild(circle);

    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', cx); text.setAttribute('y', cy - 12);
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', '#CCD6F6');
    text.setAttribute('font-size', '10');
    text.textContent = d.name;
    svg.appendChild(text);
  });

  // Legend
  [{ color: '#50c878', label: 'Open Source', y: 20 }, { color: '#C5A059', label: 'Commercial', y: 38 }].forEach(l => {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', width - 130); c.setAttribute('cy', l.y);
    c.setAttribute('r', '5'); c.setAttribute('fill', l.color);
    svg.appendChild(c);
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', width - 120); t.setAttribute('y', l.y + 4);
    t.setAttribute('fill', '#8892B0'); t.setAttribute('font-size', '11');
    t.textContent = l.label;
    svg.appendChild(t);
  });

  section.appendChild(svg);
  const caveat = document.createElement('p');
  caveat.className = 'chart-caveat';
  caveat.textContent = 'Performance tiers based on Mittelmann benchmarks (LP/MIP). Costs are estimates — verify with vendors.';
  section.appendChild(caveat);
  container.appendChild(section);
}

function buildPerformanceCalculator(container) {
  const section = document.createElement('section');
  section.className = 'solver-section';
  const h2 = document.createElement('h2');
  h2.textContent = 'Performance Gap Estimator';
  section.appendChild(h2);
  const caveat = document.createElement('p');
  caveat.className = 'chart-caveat';
  caveat.textContent = 'Rough estimates based on published benchmarks. Actual performance depends on problem structure.';
  section.appendChild(caveat);

  const inputs = document.createElement('div');
  inputs.className = 'calc-inputs';

  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'Problem Type ';
  const typeSelect = document.createElement('select');
  typeSelect.id = 'calc-type';
  [['lp', 'LP'], ['mip', 'MIP']].forEach(([v, l]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    typeSelect.appendChild(o);
  });
  typeSelect.value = 'mip';
  typeLabel.appendChild(typeSelect);
  inputs.appendChild(typeLabel);

  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = 'Problem Size ';
  const sizeSelect = document.createElement('select');
  sizeSelect.id = 'calc-size';
  [['small', 'Small (< 1K vars)'], ['medium', 'Medium (1K-100K)'], ['large', 'Large (100K-1M)'], ['xlarge', 'Very Large (> 1M)']].forEach(([v, l]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    sizeSelect.appendChild(o);
  });
  sizeSelect.value = 'large';
  sizeLabel.appendChild(sizeSelect);
  inputs.appendChild(sizeLabel);

  section.appendChild(inputs);

  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'calc-results';
  section.appendChild(resultsDiv);

  const speedData = {
    lp: { small: {gurobi:1,cplex:1.1,highs:1.3,scip:3,cbc:4,glpk:8}, medium: {gurobi:1,cplex:1.1,highs:1.5,scip:4,cbc:6,glpk:15}, large: {gurobi:1,cplex:1.2,highs:2,scip:6,cbc:10,glpk:30}, xlarge: {gurobi:1,cplex:1.2,highs:3,scip:10,cbc:20} },
    mip: { small: {gurobi:1,cplex:1.1,highs:2,scip:2.5,cbc:5,glpk:20}, medium: {gurobi:1,cplex:1.2,highs:3,scip:4,cbc:10}, large: {gurobi:1,cplex:1.3,highs:5,scip:8,cbc:20}, xlarge: {gurobi:1,cplex:1.5,highs:10,scip:15} }
  };

  function updateCalc() {
    const type = typeSelect.value;
    const size = sizeSelect.value;
    const data = speedData[type]?.[size] || {};
    const entries = Object.entries(data).sort((a, b) => a[1] - b[1]);

    resultsDiv.textContent = '';
    const table = document.createElement('table');
    table.className = 'calc-table';
    const thead = document.createElement('thead');
    const hRow = document.createElement('tr');
    ['Solver', 'Relative Speed', 'Cost', ''].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    entries.forEach(([id, mult]) => {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      const a = document.createElement('a');
      a.href = `#solvers/${id}`;
      a.textContent = id.charAt(0).toUpperCase() + id.slice(1);
      tdName.appendChild(a);
      tr.appendChild(tdName);

      const tdSpeed = document.createElement('td');
      tdSpeed.textContent = mult === 1 ? 'Fastest (baseline)' : `~${mult}x slower`;
      tr.appendChild(tdSpeed);

      const tdCost = document.createElement('td');
      tdCost.textContent = ['gurobi', 'cplex', 'xpress'].includes(id) ? 'Commercial' : 'Free';
      tr.appendChild(tdCost);

      const tdBar = document.createElement('td');
      const bar = document.createElement('div');
      bar.className = 'speed-bar';
      bar.style.width = Math.min(100, (1 / mult) * 100) + '%';
      tdBar.appendChild(bar);
      tr.appendChild(tdBar);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    resultsDiv.appendChild(table);

    const source = document.createElement('p');
    source.className = 'chart-caveat';
    source.textContent = 'Source: Estimates from Mittelmann benchmarks and published solver comparisons. Median ratios — individual instances vary.';
    resultsDiv.appendChild(source);
  }

  typeSelect.addEventListener('change', updateCalc);
  sizeSelect.addEventListener('change', updateCalc);
  updateCalc();

  container.appendChild(section);
}

/**
 * VD-03: Solver Release Timeline
 * Horizontal swimlane timeline showing release dates over last 2 years.
 * Each solver gets a row; dots are positioned by date.
 * Green = open source, gold = commercial.
 */
function buildSolverTimeline(solvers, container) {
  if (!solvers || solvers.length === 0) return;

  const now = new Date();
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const timelineStart = twoYearsAgo.getTime();
  const timelineEnd = now.getTime();
  const timelineRange = timelineEnd - timelineStart;

  // Filter solvers that have a release_date within the 2-year window
  const solversWithDates = solvers.filter(s => {
    if (!s.release_date) return false;
    const d = new Date(s.release_date).getTime();
    return d >= timelineStart && d <= timelineEnd;
  });

  if (solversWithDates.length === 0) return;

  // Sort by release date (most recent first)
  solversWithDates.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));

  const section = document.createElement('div');
  section.className = 'solver-timeline';

  const heading = document.createElement('h3');
  heading.className = 'solver-timeline__title';
  heading.textContent = 'Release Timeline (Last 2 Years)';
  section.appendChild(heading);

  // Axis labels
  const axis = document.createElement('div');
  axis.className = 'solver-timeline__axis';

  // Generate quarterly tick marks
  const tickDate = new Date(twoYearsAgo);
  tickDate.setDate(1);
  tickDate.setMonth(Math.ceil(tickDate.getMonth() / 3) * 3); // Align to quarter
  while (tickDate <= now) {
    const pct = ((tickDate.getTime() - timelineStart) / timelineRange) * 100;
    if (pct >= 0 && pct <= 100) {
      const tick = document.createElement('span');
      tick.className = 'solver-timeline__tick';
      tick.style.left = pct + '%';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      tick.textContent = months[tickDate.getMonth()] + ' ' +
                         String(tickDate.getFullYear()).slice(2);
      axis.appendChild(tick);
    }
    tickDate.setMonth(tickDate.getMonth() + 3);
  }
  section.appendChild(axis);

  // Swimlanes
  const lanes = document.createElement('div');
  lanes.className = 'solver-timeline__lanes';

  solversWithDates.forEach(s => {
    const lane = document.createElement('div');
    lane.className = 'solver-timeline__lane';

    const label = document.createElement('span');
    label.className = 'solver-timeline__label';
    label.textContent = s.name.length > 20 ? s.name.slice(0, 18) + '\u2026' : s.name;
    lane.appendChild(label);

    const track = document.createElement('div');
    track.className = 'solver-timeline__track';

    const releaseTime = new Date(s.release_date).getTime();
    const pct = ((releaseTime - timelineStart) / timelineRange) * 100;

    const dot = document.createElement('span');
    dot.className = s.open_source
      ? 'solver-timeline__dot solver-timeline__dot--open'
      : 'solver-timeline__dot solver-timeline__dot--comm';
    dot.style.left = Math.min(Math.max(pct, 1), 99) + '%';
    dot.title = s.name + ' v' + s.current_version +
                ' (' + s.release_date + ')';

    // Tooltip on hover
    const tip = document.createElement('span');
    tip.className = 'solver-timeline__tip';
    tip.textContent = 'v' + s.current_version + ' \u2022 ' + s.release_date;
    dot.appendChild(tip);

    track.appendChild(dot);
    lane.appendChild(track);
    lanes.appendChild(lane);
  });

  section.appendChild(lanes);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'solver-timeline__legend';
  const openLeg = document.createElement('span');
  openLeg.className = 'solver-timeline__legend-item';
  openLeg.innerHTML = '<span class="solver-timeline__dot solver-timeline__dot--open" style="position:static;display:inline-block"></span> Open Source';
  legend.appendChild(openLeg);
  const commLeg = document.createElement('span');
  commLeg.className = 'solver-timeline__legend-item';
  commLeg.innerHTML = '<span class="solver-timeline__dot solver-timeline__dot--comm" style="position:static;display:inline-block"></span> Commercial';
  legend.appendChild(commLeg);
  section.appendChild(legend);

  container.appendChild(section);
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

  // Breadcrumb
  const bc = document.createElement('nav');
  bc.className = 'breadcrumb';
  bc.setAttribute('aria-label', 'Breadcrumb');
  const bcHome = document.createElement('a');
  bcHome.href = '#solvers';
  bcHome.textContent = 'PORID';
  bc.appendChild(bcHome);
  bc.appendChild(document.createTextNode(' \u203A '));
  const bcCurrent = document.createElement('span');
  bcCurrent.className = 'breadcrumb-current';
  bcCurrent.textContent = 'Benchmarks';
  bc.appendChild(bcCurrent);
  container.appendChild(bc);

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

  // Community Benchmarks
  const commSection = document.createElement('section');
  commSection.className = 'solver-section';
  const commH2 = document.createElement('h2');
  commH2.textContent = 'Community & Informal Benchmarks';
  commSection.appendChild(commH2);
  const commP = document.createElement('p');
  commP.textContent = 'Beyond standard benchmark suites, the community publishes comparison studies:';
  commSection.appendChild(commP);

  const commBenches = [
    { name: 'Mittelmann Decision Tree', desc: 'Continuously updated independent benchmark — the gold standard for solver comparisons.', url: 'https://plato.asu.edu/bench.html' },
    { name: 'OR Stack Exchange Comparisons', desc: 'Community-maintained threads comparing solver performance on specific problem classes.', url: 'https://or.stackexchange.com/questions/tagged/solver' },
    { name: 'MINLPLib', desc: 'Library of mixed-integer nonlinear programming instances with solver performance data.', url: 'https://www.minlplib.org/' },
  ];
  commBenches.forEach(cb => {
    const card = document.createElement('div');
    card.className = 'licensing-detail-card';
    const h3 = document.createElement('h3');
    h3.textContent = cb.name;
    card.appendChild(h3);
    const desc = document.createElement('p');
    desc.textContent = cb.desc;
    card.appendChild(desc);
    const link = document.createElement('a');
    link.href = cb.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = cb.url.replace('https://', '').split('/')[0] + ' ↗';
    card.appendChild(link);
    commSection.appendChild(card);
  });
  container.appendChild(commSection);
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


/**
 * Modeling Tools sub-view — shows Pyomo, PuLP, JuMP, CVXPY, etc.
 * with compatibility matrix and quick-start code.
 */
function buildModelingTools(toolsData, compatMatrix, container) {
  if (!toolsData || !toolsData.tools || toolsData.tools.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-state__icon';
    icon.textContent = '\uD83D\uDCDD';
    const h2 = document.createElement('h2');
    h2.className = 'empty-state__title';
    h2.textContent = 'Modeling Tools';
    const p = document.createElement('p');
    p.className = 'empty-state__text';
    p.textContent = 'Modeling tools data will appear here once data/modeling_tools.json is available.';
    empty.appendChild(icon);
    empty.appendChild(h2);
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  const tools = toolsData.tools;

  // Breadcrumb
  const bc = document.createElement('nav');
  bc.className = 'breadcrumb';
  bc.setAttribute('aria-label', 'Breadcrumb');
  const bcHome = document.createElement('a');
  bcHome.href = '#solvers';
  bcHome.textContent = 'PORID';
  bc.appendChild(bcHome);
  bc.appendChild(document.createTextNode(' \u203A '));
  const bcCurrent = document.createElement('span');
  bcCurrent.className = 'breadcrumb-current';
  bcCurrent.textContent = 'Modeling Tools';
  bc.appendChild(bcCurrent);
  container.appendChild(bc);

  // Header
  const header = document.createElement('div');
  header.className = 'mt-header';
  const h2 = document.createElement('h2');
  h2.textContent = 'OR Modeling Tools';
  header.appendChild(h2);
  const desc = document.createElement('p');
  desc.className = 'mt-desc';
  desc.textContent = `${tools.length} modeling tools compared. Each entry includes learning curve, solver compatibility, and quick-start code.`;
  header.appendChild(desc);
  container.appendChild(header);
  showLastUpdated(container);

  // F32: Tool recommendation helper
  const helperSection = document.createElement('div');
  helperSection.className = 'tool-helper';
  const helperH2 = document.createElement('h2');
  helperH2.textContent = 'Which modeling tool should I use?';
  helperSection.appendChild(helperH2);

  const helperFlow = document.createElement('div');
  helperFlow.className = 'tool-helper-flow';

  // Language select
  const langGroup = document.createElement('div');
  langGroup.className = 'dh-filter-group';
  const langLabel = document.createElement('label');
  langLabel.textContent = 'Language';
  const langSelect = document.createElement('select');
  langSelect.id = 'tool-lang';
  [['', 'Select...'], ['python', 'Python'], ['julia', 'Julia'], ['any', 'Any']].forEach(([v, l]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    langSelect.appendChild(o);
  });
  langGroup.appendChild(langLabel);
  langGroup.appendChild(langSelect);
  helperFlow.appendChild(langGroup);

  // Complexity select
  const compGroup = document.createElement('div');
  compGroup.className = 'dh-filter-group';
  const compLabel = document.createElement('label');
  compLabel.textContent = 'Complexity';
  const compSelect = document.createElement('select');
  compSelect.id = 'tool-complexity';
  [['', 'Select...'], ['simple', 'Simple LP/MIP'], ['moderate', 'Moderate (callbacks)'], ['complex', 'Complex (MINLP, stochastic)'], ['convex', 'Convex (SDP, SOCP)']].forEach(([v, l]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    compSelect.appendChild(o);
  });
  compGroup.appendChild(compLabel);
  compGroup.appendChild(compSelect);
  helperFlow.appendChild(compGroup);

  helperSection.appendChild(helperFlow);

  const toolRec = document.createElement('div');
  toolRec.id = 'tool-recommendation';
  toolRec.className = 'tool-rec';
  helperSection.appendChild(toolRec);

  function updateToolRec() {
    const lang = langSelect.value;
    const comp = compSelect.value;
    toolRec.textContent = '';
    if (!lang && !comp) return;

    let tool, reason;
    if (lang === 'python') {
      if (comp === 'convex') { tool = 'CVXPY'; reason = 'Purpose-built for convex optimization. Automatic convexity verification.'; }
      else if (comp === 'complex') { tool = 'Pyomo'; reason = 'Full-featured algebraic modeling. Handles MINLP, stochastic, decomposition.'; }
      else if (comp === 'simple') { tool = 'PuLP'; reason = 'Simplest Python modeler. 30 minutes to first model. Includes CBC free.'; }
      else { tool = 'PuLP'; reason = 'Good default for Python. Simple API, switch solvers in one line.'; }
    } else if (lang === 'julia') {
      tool = 'JuMP'; reason = 'The standard for Julia optimization. Excellent design, broad solver support.';
    } else {
      if (comp === 'convex') { tool = 'CVXPY (Python)'; reason = 'Best convex optimization tooling available.'; }
      else if (comp === 'complex') { tool = 'Pyomo or JuMP'; reason = 'Both handle complex models. Choose based on language preference.'; }
      else { tool = 'PuLP (Python)'; reason = 'Lowest barrier to entry. Start here if unsure.'; }
    }

    const card = document.createElement('div');
    card.className = 'tool-rec-card';
    const recH3 = document.createElement('h3');
    recH3.textContent = '\u2192 ' + tool;
    card.appendChild(recH3);
    const recP = document.createElement('p');
    recP.textContent = reason;
    card.appendChild(recP);
    toolRec.appendChild(card);
  }

  langSelect.addEventListener('change', updateToolRec);
  compSelect.addEventListener('change', updateToolRec);

  container.appendChild(helperSection);

  // F33: Code comparison
  const codeSection = document.createElement('section');
  codeSection.className = 'solver-section';
  const codeH2 = document.createElement('h2');
  codeH2.textContent = 'Same Problem, Five Tools';
  codeSection.appendChild(codeH2);
  const codeSubtitle = document.createElement('p');
  codeSubtitle.textContent = 'A simple production planning LP in each tool. Compare syntax.';
  codeSection.appendChild(codeSubtitle);

  const codeExamples = {
    PuLP: 'from pulp import *\n\nprob = LpProblem("production", LpMinimize)\nx1 = LpVariable("tables", 0)\nx2 = LpVariable("chairs", 0)\n\nprob += 2*x1 + 3*x2           # Minimize cost\nprob += x1 + x2 >= 100        # Meet demand\nprob += 2*x1 + x2 <= 240      # Wood limit\n\nprob.solve()\nprint(f"Tables: {x1.value()}, Chairs: {x2.value()}")',
    Pyomo: 'import pyomo.environ as pyo\n\nm = pyo.ConcreteModel()\nm.x1 = pyo.Var(within=pyo.NonNegativeReals)\nm.x2 = pyo.Var(within=pyo.NonNegativeReals)\n\nm.cost = pyo.Objective(expr=2*m.x1 + 3*m.x2)\nm.demand = pyo.Constraint(expr=m.x1 + m.x2 >= 100)\nm.wood = pyo.Constraint(expr=2*m.x1 + m.x2 <= 240)\n\npyo.SolverFactory("highs").solve(m)\nprint(f"Tables: {m.x1()}, Chairs: {m.x2()}")',
    GurobiPy: 'import gurobipy as gp\nfrom gurobipy import GRB\n\nm = gp.Model()\nx1 = m.addVar(name="tables")\nx2 = m.addVar(name="chairs")\n\nm.setObjective(2*x1 + 3*x2, GRB.MINIMIZE)\nm.addConstr(x1 + x2 >= 100)\nm.addConstr(2*x1 + x2 <= 240)\n\nm.optimize()\nprint(f"Tables: {x1.X}, Chairs: {x2.X}")',
    CVXPY: 'import cvxpy as cp\n\nx1 = cp.Variable(nonneg=True)\nx2 = cp.Variable(nonneg=True)\n\nobjective = cp.Minimize(2*x1 + 3*x2)\nconstraints = [x1 + x2 >= 100, 2*x1 + x2 <= 240]\n\nprob = cp.Problem(objective, constraints)\nprob.solve()\nprint(f"Tables: {x1.value}, Chairs: {x2.value}")',
    'JuMP (Julia)': 'using JuMP, HiGHS\n\nmodel = Model(HiGHS.Optimizer)\n@variable(model, x1 >= 0)\n@variable(model, x2 >= 0)\n\n@objective(model, Min, 2x1 + 3x2)\n@constraint(model, x1 + x2 >= 100)\n@constraint(model, 2x1 + x2 <= 240)\n\noptimize!(model)\nprintln("Tables: $(value(x1)), Chairs: $(value(x2))")',
  };

  const codeTabs = document.createElement('div');
  codeTabs.className = 'code-tabs';
  const codeDisplay = document.createElement('pre');
  codeDisplay.className = 'code-display';
  const codeContent = document.createElement('code');
  codeDisplay.appendChild(codeContent);

  let activeTab = 'PuLP';
  function showCode(name) {
    activeTab = name;
    codeContent.textContent = codeExamples[name] || '';
    codeTabs.querySelectorAll('.code-tab').forEach(b => b.classList.toggle('code-tab--active', b.textContent === name));
  }

  Object.keys(codeExamples).forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'code-tab' + (name === activeTab ? ' code-tab--active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => showCode(name));
    codeTabs.appendChild(btn);
  });

  codeSection.appendChild(codeTabs);
  codeSection.appendChild(codeDisplay);
  showCode('PuLP');

  container.appendChild(codeSection);

  // F36: Time to First Model
  const ttfmSection = document.createElement('section');
  ttfmSection.className = 'solver-section';
  const ttfmH2 = document.createElement('h2');
  ttfmH2.textContent = 'Time to First Model';
  ttfmSection.appendChild(ttfmH2);
  const ttfmP = document.createElement('p');
  ttfmP.textContent = 'How quickly can you go from zero to a solved optimization problem?';
  ttfmSection.appendChild(ttfmP);

  const ttfmData = [
    { name: 'PuLP', time: '30 min', pct: 20 },
    { name: 'CVXPY', time: '30 min', pct: 20 },
    { name: 'scipy.optimize', time: '15 min', pct: 10 },
    { name: 'GurobiPy', time: '1 hour', pct: 40 },
    { name: 'JuMP', time: '1-2 hours', pct: 55 },
    { name: 'OR-Tools', time: '1-2 hours', pct: 55 },
    { name: 'Pyomo', time: '2-4 hours', pct: 90 },
  ].sort((a, b) => a.pct - b.pct);

  const barsDiv = document.createElement('div');
  barsDiv.className = 'ttfm-bars';
  ttfmData.forEach(d => {
    const row = document.createElement('div');
    row.className = 'ttfm-row';
    const name = document.createElement('span');
    name.className = 'ttfm-name';
    name.textContent = d.name;
    row.appendChild(name);
    const bar = document.createElement('div');
    bar.className = 'ttfm-bar';
    bar.style.width = d.pct + '%';
    const timeSpan = document.createElement('span');
    timeSpan.textContent = d.time;
    bar.appendChild(timeSpan);
    row.appendChild(bar);
    barsDiv.appendChild(row);
  });
  ttfmSection.appendChild(barsDiv);
  const ttfmCaveat = document.createElement('p');
  ttfmCaveat.className = 'chart-caveat';
  ttfmCaveat.textContent = 'Assumes programming experience but no optimization background. Includes install time.';
  ttfmSection.appendChild(ttfmCaveat);
  container.appendChild(ttfmSection);

  // Tool cards
  const grid = document.createElement('div');
  grid.className = 'mt-grid';

  tools.forEach(tool => {
    const card = document.createElement('div');
    card.className = 'mt-card card';

    // Title row
    const titleRow = document.createElement('div');
    titleRow.className = 'mt-card__header';
    const name = document.createElement('h3');
    name.className = 'mt-card__name';
    name.textContent = tool.name;
    titleRow.appendChild(name);
    const lang = document.createElement('span');
    lang.className = 'dh-tag';
    lang.textContent = tool.language;
    titleRow.appendChild(lang);
    const curve = document.createElement('span');
    curve.className = `dh-tag dh-tag-${tool.learning_curve || 'medium'}`;
    curve.textContent = `${tool.learning_curve || 'medium'} learning curve`;
    titleRow.appendChild(curve);
    card.appendChild(titleRow);

    // Description
    const descP = document.createElement('p');
    descP.className = 'mt-card__desc';
    descP.textContent = tool.description;
    card.appendChild(descP);

    // Meta: version, license, time to first model
    const meta = document.createElement('div');
    meta.className = 'mt-card__meta';
    if (tool.current_version) {
      const v = document.createElement('span');
      v.className = 'dh-tag';
      v.textContent = `v${tool.current_version}`;
      meta.appendChild(v);
    }
    if (tool.license) {
      const lic = document.createElement('span');
      lic.className = 'dh-tag';
      lic.textContent = tool.license;
      meta.appendChild(lic);
    }
    if (tool.time_to_first_model) {
      const ttfm = document.createElement('span');
      ttfm.className = 'dh-tag';
      ttfm.textContent = `First model: ${tool.time_to_first_model}`;
      meta.appendChild(ttfm);
    }
    card.appendChild(meta);

    // Best for / Not for
    if (tool.best_for && tool.best_for.length > 0) {
      const bestFor = document.createElement('div');
      bestFor.className = 'mt-card__list';
      const bfLabel = document.createElement('strong');
      bfLabel.textContent = 'Best for: ';
      bestFor.appendChild(bfLabel);
      const bfText = document.createTextNode(tool.best_for.join(', '));
      bestFor.appendChild(bfText);
      card.appendChild(bestFor);
    }

    if (tool.not_for && tool.not_for.length > 0) {
      const notFor = document.createElement('div');
      notFor.className = 'mt-card__list mt-card__list--not';
      const nfLabel = document.createElement('strong');
      nfLabel.textContent = 'Not for: ';
      notFor.appendChild(nfLabel);
      const nfText = document.createTextNode(tool.not_for.join(', '));
      notFor.appendChild(nfText);
      card.appendChild(notFor);
    }

    // Compatible solvers
    if (tool.solver_support && tool.solver_support.length > 0) {
      const solverDiv = document.createElement('div');
      solverDiv.className = 'mt-card__solvers';
      const solLabel = document.createElement('strong');
      solLabel.textContent = 'Solvers: ';
      solverDiv.appendChild(solLabel);
      tool.solver_support.forEach(s => {
        const tag = document.createElement('span');
        tag.className = 'dh-tag dh-tag-pt';
        tag.textContent = s;
        solverDiv.appendChild(tag);
      });
      card.appendChild(solverDiv);
    }

    // Quick start (collapsible)
    if (tool.quick_start) {
      const details = document.createElement('details');
      details.className = 'dh-quickstart';
      const summary = document.createElement('summary');
      summary.textContent = 'Quick Start';
      details.appendChild(summary);
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = tool.quick_start;
      pre.appendChild(code);
      details.appendChild(pre);
      card.appendChild(details);
    }

    // Links
    const links = document.createElement('div');
    links.className = 'mt-card__links';
    if (tool.website) {
      const a = document.createElement('a');
      a.href = tool.website;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Website';
      a.className = 'mt-link';
      links.appendChild(a);
    }
    if (tool.docs_url) {
      const a = document.createElement('a');
      a.href = tool.docs_url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Docs';
      a.className = 'mt-link';
      links.appendChild(a);
    }
    if (tool.github_repo) {
      const a = document.createElement('a');
      a.href = `https://github.com/${tool.github_repo}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'GitHub';
      a.className = 'mt-link';
      links.appendChild(a);
    }
    card.appendChild(links);

    grid.appendChild(card);
  });

  container.appendChild(grid);

  // Compatibility Matrix
  if (compatMatrix && compatMatrix.matrix) {
    buildCompatibilityMatrix(compatMatrix, container);
  }
}


/**
 * Render the solver-tool compatibility matrix as an HTML table.
 */
function buildCompatibilityMatrix(matrix, container) {
  const section = document.createElement('div');
  section.className = 'compat-section';

  const h2 = document.createElement('h2');
  h2.textContent = 'What works with what?';
  section.appendChild(h2);

  const desc = document.createElement('p');
  desc.className = 'compat-desc';
  desc.textContent = 'Which modeling tools connect to which solvers. Green = supported, gray = not supported.';
  section.appendChild(desc);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-responsive';

  const table = document.createElement('table');
  table.className = 'compat-table';

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const emptyTh = document.createElement('th');
  emptyTh.textContent = 'Tool \\ Solver';
  headerRow.appendChild(emptyTh);
  matrix.solvers.forEach(s => {
    const th = document.createElement('th');
    th.textContent = s;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');
  matrix.modeling_tools.forEach(tool => {
    const row = document.createElement('tr');
    const toolTh = document.createElement('th');
    toolTh.textContent = tool;
    row.appendChild(toolTh);

    const toolMatrix = matrix.matrix[tool] || {};
    matrix.solvers.forEach(solver => {
      const td = document.createElement('td');
      const val = toolMatrix[solver];
      if (val === true) {
        td.textContent = '\u2705';
        td.title = 'Supported';
        td.className = 'compat-yes';
      } else if (val === 'limited') {
        td.textContent = '\u26A0';
        td.title = 'Limited/experimental';
        td.className = 'compat-limited';
      } else {
        td.textContent = '\u2014';
        td.title = 'Not supported';
        td.className = 'compat-no';
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);

  // Notes
  if (matrix.notes) {
    const notesList = document.createElement('ul');
    notesList.className = 'compat-notes';
    Object.entries(matrix.notes).forEach(([tool, note]) => {
      const li = document.createElement('li');
      const b = document.createElement('strong');
      b.textContent = tool + ': ';
      li.appendChild(b);
      li.appendChild(document.createTextNode(note));
      notesList.appendChild(li);
    });
    section.appendChild(notesList);
  }

  container.appendChild(section);
}

function buildLicensingGuide(allData, container) {
  const solversData = allData.solvers;
  const manual = allData.solversManual;
  const solvers = solversData?.solvers || [];
  const manualSolvers = manual?.solvers || [];

  // Merge data
  const merged = solvers.map(s => {
    const m = manualSolvers.find(ms => ms.id === s.id);
    return m ? { ...s, ...m } : s;
  }).filter(s => !['pyomo', 'jump', 'cvxpy', 'pulp', 'scipy', 'ampl', 'gams'].includes(s.id));

  const page = document.createElement('div');
  page.className = 'licensing-guide';

  // Breadcrumb
  const bc = document.createElement('nav');
  bc.className = 'breadcrumb';
  bc.setAttribute('aria-label', 'Breadcrumb');
  const bcHome = document.createElement('a');
  bcHome.href = '#solvers';
  bcHome.textContent = 'PORID';
  bc.appendChild(bcHome);
  bc.appendChild(document.createTextNode(' \u203A '));
  const bcCurrent = document.createElement('span');
  bcCurrent.className = 'breadcrumb-current';
  bcCurrent.textContent = 'Licensing';
  bc.appendChild(bcCurrent);
  page.appendChild(bc);

  // Header
  const h1 = document.createElement('h1');
  h1.className = 'licensing-guide__title';
  h1.textContent = 'OR Solver Licensing Guide';
  page.appendChild(h1);
  const subtitle = document.createElement('p');
  subtitle.className = 'licensing-guide__subtitle';
  subtitle.textContent = 'How much will this solver cost you? One page, all the answers.';
  page.appendChild(subtitle);
  showLastUpdated(page);

  // Summary table
  const tableSection = document.createElement('section');
  tableSection.className = 'solver-section';
  const tableH2 = document.createElement('h2');
  tableH2.textContent = 'Licensing at a Glance';
  tableSection.appendChild(tableH2);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'solver-table-wrap';
  const table = document.createElement('table');
  table.className = 'licensing-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Solver', 'Type', 'Annual Cost', 'Academic Free?', 'Open Source?'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  merged.forEach(s => {
    const tr = document.createElement('tr');

    // Name
    const tdName = document.createElement('td');
    const nameLink = document.createElement('a');
    nameLink.href = `#solvers/${s.id}`;
    nameLink.textContent = s.name;
    tdName.appendChild(nameLink);
    tr.appendChild(tdName);

    // Type
    const tdType = document.createElement('td');
    const typeBadge = document.createElement('span');
    typeBadge.className = s.open_source ? 'solver-license solver-license--open' : 'solver-license solver-license--comm';
    typeBadge.textContent = s.open_source ? 'Open' : 'Commercial';
    tdType.appendChild(typeBadge);
    tr.appendChild(tdType);

    // Annual cost
    const tdCost = document.createElement('td');
    tdCost.textContent = s.tco_estimate?.license_annual_display || (s.open_source ? 'Free' : 'Contact vendor');
    tr.appendChild(tdCost);

    // Academic
    const tdAcad = document.createElement('td');
    tdAcad.textContent = (s.academic_free || s.license?.academic_free) ? 'Yes' : 'No';
    tr.appendChild(tdAcad);

    // Open source
    const tdOS = document.createElement('td');
    tdOS.textContent = s.open_source ? 'Yes' : 'No';
    tr.appendChild(tdOS);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  tableSection.appendChild(tableWrap);
  page.appendChild(tableSection);

  // Commercial solver details
  const commercialSection = document.createElement('section');
  commercialSection.className = 'solver-section';
  const commH2 = document.createElement('h2');
  commH2.textContent = 'Commercial Solver Details';
  commercialSection.appendChild(commH2);

  merged.filter(s => !s.open_source).forEach(s => {
    const card = document.createElement('div');
    card.className = 'licensing-detail-card';
    const h3 = document.createElement('h3');
    h3.textContent = s.name;
    card.appendChild(h3);

    if (s.commercial_pricing_note) {
      const p = document.createElement('p');
      p.className = 'ld-pricing';
      const lbl = document.createElement('strong');
      lbl.textContent = 'Pricing: ';
      p.appendChild(lbl);
      p.appendChild(document.createTextNode(s.commercial_pricing_note));
      card.appendChild(p);
    }
    if (s.academic_details || s.license?.academic_note) {
      const p = document.createElement('p');
      const lbl = document.createElement('strong');
      lbl.textContent = 'Academic: ';
      p.appendChild(lbl);
      p.appendChild(document.createTextNode(s.academic_details || s.license?.academic_note));
      card.appendChild(p);
    }
    if (s.licensing_gotcha) {
      const gotcha = document.createElement('div');
      gotcha.className = 'ld-gotcha';
      gotcha.textContent = '\u26A0 ' + s.licensing_gotcha;
      card.appendChild(gotcha);
    }
    if (s.tco_estimate?.hidden_costs?.length) {
      const ul = document.createElement('ul');
      ul.className = 'ld-hidden-costs';
      s.tco_estimate.hidden_costs.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    commercialSection.appendChild(card);
  });
  page.appendChild(commercialSection);

  // Open source section
  const ossSection = document.createElement('section');
  ossSection.className = 'solver-section';
  const ossH2 = document.createElement('h2');
  ossH2.textContent = 'Open Source Solvers';
  ossSection.appendChild(ossH2);
  const ossP = document.createElement('p');
  ossP.textContent = 'These solvers are free to use with no licensing restrictions:';
  ossSection.appendChild(ossP);

  merged.filter(s => s.open_source).forEach(s => {
    const card = document.createElement('div');
    card.className = 'licensing-detail-card ld-open';
    const h3 = document.createElement('h3');
    h3.textContent = s.name;
    const code = document.createElement('code');
    code.textContent = s.license_spdx || s.license?.type || 'Open';
    h3.appendChild(document.createTextNode(' '));
    h3.appendChild(code);
    card.appendChild(h3);
    const desc = document.createElement('p');
    desc.textContent = (s.description || '').split('.')[0] + '.';
    card.appendChild(desc);
    if (s.licensing_gotcha) {
      const gotcha = document.createElement('div');
      gotcha.className = 'ld-gotcha';
      gotcha.textContent = '\u26A0 ' + s.licensing_gotcha;
      card.appendChild(gotcha);
    }
    ossSection.appendChild(card);
  });
  page.appendChild(ossSection);

  // Academic License Checklists (E31)
  const acadSection = document.createElement('section');
  acadSection.className = 'solver-section';
  const acadH2 = document.createElement('h2');
  acadH2.textContent = 'Academic License Step-by-Step';
  acadSection.appendChild(acadH2);
  const acadIntro = document.createElement('p');
  acadIntro.textContent = 'Most commercial solvers offer free academic licenses. Here\'s how to get them:';
  acadSection.appendChild(acadIntro);

  const checklists = [
    {
      name: 'Gurobi Academic License',
      steps: ['Go to gurobi.com/academia', 'Create account with .edu email', 'Request "Named-User Academic" license', 'Get license key (usually same day)', 'Run grbgetkey YOUR_KEY'],
      gotchas: ['License tied to institutional network \u2014 VPN needed off-campus', 'Expires when you leave the institution', 'Cannot be used for consulting or industry-funded projects']
    },
    {
      name: 'IBM CPLEX Academic License',
      steps: ['Go to ibm.com/academic (IBM Academic Initiative)', 'Register with institutional email', 'Navigate to Software \u2192 search for CPLEX', 'Download CPLEX Optimization Studio', 'Process can take 1-3 weeks'],
      gotchas: ['Slower approval than Gurobi', 'IBM Academic Initiative interface changes frequently', 'May need to re-register each academic year']
    },
    {
      name: 'MOSEK Academic License',
      steps: ['Go to mosek.com/products/academic-licenses', 'Fill in request form with institutional email', 'Usually approved within 1-2 business days', 'Place license file in home directory'],
      gotchas: ['Personal academic license \u2014 one user only', 'Check if institution has site license first']
    }
  ];

  checklists.forEach(cl => {
    const details = document.createElement('details');
    details.className = 'academic-checklist';
    const summary = document.createElement('summary');
    const strong = document.createElement('strong');
    strong.textContent = cl.name;
    summary.appendChild(strong);
    details.appendChild(summary);

    const ol = document.createElement('ol');
    cl.steps.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      ol.appendChild(li);
    });
    details.appendChild(ol);

    if (cl.gotchas.length) {
      const gotchaDiv = document.createElement('div');
      gotchaDiv.className = 'checklist-gotcha';
      const gotchaH = document.createElement('strong');
      gotchaH.textContent = 'Gotchas:';
      gotchaDiv.appendChild(gotchaH);
      const ul = document.createElement('ul');
      cl.gotchas.forEach(g => {
        const li = document.createElement('li');
        li.textContent = g;
        ul.appendChild(li);
      });
      gotchaDiv.appendChild(ul);
      details.appendChild(gotchaDiv);
    }
    acadSection.appendChild(details);
  });

  // Tip for graduating students
  const tip = document.createElement('div');
  tip.className = 'academic-tip';
  const tipStrong = document.createElement('strong');
  tipStrong.textContent = 'Tip for graduating students: ';
  tip.appendChild(tipStrong);
  tip.appendChild(document.createTextNode('Before you lose access, export your model files and test them with open-source solvers (HiGHS, SCIP). Know your migration path before your license expires.'));
  acadSection.appendChild(tip);

  page.appendChild(acadSection);
  container.appendChild(page);
}
