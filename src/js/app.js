/**
 * PORID — Main Application Controller
 *
 * Thin orchestrator: loads data, routes hash changes to module render()
 * functions, wires global UI (theme, search modal, card event delegation).
 *
 * Security note: All uses of innerHTML throughout the app render content
 * exclusively from our own local static JSON files (data/*.json), not
 * from user input or external sources. In a production app with
 * user-generated content, use DOMPurify.
 */

// --- New hub view imports ---
import { render as renderPulse } from './modules/pulse.js';
import { render as renderRadar } from './modules/radar.js';
import { render as renderToolkit } from './modules/toolkit.js';

// --- Module imports ---
import { render as renderPublications } from './modules/publications.js';
import { render as renderSoftware } from './modules/software.js';
import { render as renderConferences, getUrgentDeadlineCount } from './modules/conferences.js';
import { render as renderOpportunities } from './modules/opportunities.js';
import { render as renderWatchlist } from './modules/watchlist.js';
import { render as renderDigest } from './modules/digest.js';
import { render as renderTrends } from './modules/trends.js';
import { render as renderDatasets } from './modules/datasets.js';
import { render as renderSeminars } from './modules/seminars.js';
import { render as renderChangelog } from './modules/changelog.js';
import { render as renderFunding } from './modules/funding.js';
import { render as renderAwards } from './modules/awards.js';
import { render as renderResources } from './modules/resources.js';
import { initSearch, wireSearchInput } from './modules/search.js';

// --- Component / utility imports ---
import { renderFilterBar, getActiveFilters } from './components/filters.js';
import { showModal, hideModal } from './components/modal.js';
import { getWatchlist, addToWatchlist, removeFromWatchlist, isWatchlisted, cycleReadStatus } from './utils/storage.js';
import { generateBibTeX, copyToClipboard, generateCSV, downloadFile } from './utils/citation.js';
import { getPreferences, setPreference } from './utils/preferences.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  data: {
    publications: [],
    software: [],
    conferences: [],
    opportunities: [],
    funding: [],
    awards: [],
    resources: [],
    special_issues: [],
  },
  activeTab: 'pulse',
  extraData: {
    trends: null,
    brief: null,
    solvers: null,
    benchmarks: null,
  },
};

const TABS = ['pulse', 'radar', 'toolkit', 'publications', 'software', 'conferences', 'opportunities', 'seminars', 'watchlist', 'digest', 'datasets', 'trends', 'funding', 'awards', 'resources', 'changelog'];

const DATA_FILES = {
  publications: './data/publications.json',
  software: './data/software.json',
  conferences: './data/conferences.json',
  opportunities: './data/opportunities.json',
  datasets: './data/datasets.json',
  seminars: './data/seminars.json',
  awards: './data/awards.json',
  blogs: './data/blogs.json',
  funding: './data/funding.json',
  resources: './data/resources.json',
  special_issues: './data/special_issues.json',
};

// Module render function map
const MODULE_RENDERERS = {
  publications: renderPublications,
  software: renderSoftware,
  conferences: renderConferences,
  opportunities: renderOpportunities,
};

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------

const contentEl = document.getElementById('content');
const filterContainer = document.getElementById('filterBarContainer');
const statNewEl = document.getElementById('statNew');
const statTotalEl = document.getElementById('statTotal');

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

async function loadAllData() {
  const entries = Object.entries(DATA_FILES);
  const results = await Promise.all(
    entries.map(([key, url]) =>
      fetchJSON(url)
        .then((data) => [key, data])
        .catch(() => [key, []])
    )
  );

  for (const [key, data] of results) {
    state.data[key] = data;
  }

  updateStats();
  initSearch(state.data);
  updateDeadlineBadge();

  // Load optional hub data (trends, solvers, benchmarks)
  const optionalFiles = {
    trends: './data/trends.json',
    solvers: './data/solvers.json',
    benchmarks: './data/benchmarks.json',
  };
  const optResults = await Promise.all(
    Object.entries(optionalFiles).map(([key, url]) =>
      fetchJSON(url).then(d => [key, d]).catch(() => [key, null])
    )
  );
  for (const [key, data] of optResults) {
    state.extraData[key] = data;
  }

  // Load latest weekly brief (single request via manifest index)
  try {
    const briefResp = await fetch('./data/brief-latest.json');
    if (briefResp.ok) { state.extraData.brief = await briefResp.json(); }
  } catch { /* brief unavailable */ }

  // Fetch metadata for freshness indicator
  try {
    const meta = await fetchJSON('./data/metadata.json');
    updateFreshnessIndicator(meta);
  } catch {
    updateLastUpdated();
  }

  // Happening this week banner
  showWeekBanner();
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function animateCounter(el, target) {
  const duration = 800;
  const start = parseInt(el.textContent) || 0;
  if (start === target) return;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function updateStats() {
  const allItems = getAllItems();
  const today = new Date().toISOString().slice(0, 10);
  const newToday = allItems.filter(
    (i) => (i.date || '').slice(0, 10) === today
  ).length;

  animateCounter(statNewEl, newToday);
  animateCounter(statTotalEl, allItems.length);
}

function updateLastUpdated() {
  const allItems = getAllItems();
  const dates = allItems.map((i) => i.date).filter(Boolean).sort().reverse();
  const el = document.getElementById('statUpdated');
  if (el && dates.length) {
    const d = new Date(dates[0] + 'T00:00:00');
    el.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function updateFreshnessIndicator(meta) {
  const el = document.getElementById('statUpdated');
  if (!el || !meta || !meta.last_fetch) {
    updateLastUpdated();
    return;
  }

  const fetchTime = new Date(meta.last_fetch);
  const now = new Date();
  const hoursAgo = (now - fetchTime) / (1000 * 60 * 60);

  // Relative time string
  let timeStr;
  if (hoursAgo < 1) {
    const mins = Math.round(hoursAgo * 60);
    timeStr = `${mins}m ago`;
  } else if (hoursAgo < 24) {
    timeStr = `${Math.round(hoursAgo)}h ago`;
  } else {
    const days = Math.round(hoursAgo / 24);
    timeStr = `${days}d ago`;
  }

  el.textContent = timeStr;

  // Color coding based on age
  el.classList.remove('freshness-ok', 'freshness-warn', 'freshness-stale');
  if (hoursAgo > 48) {
    el.classList.add('freshness-stale');
    el.title = 'Data is stale (over 48h ago)';
  } else if (hoursAgo > 24) {
    el.classList.add('freshness-warn');
    el.title = 'Data may be outdated (over 24h ago)';
  } else {
    el.classList.add('freshness-ok');
    el.title = 'Data is fresh';
  }

  // Per-source status in footer
  updateSourceStatus(meta);
}

function updateSourceStatus(meta) {
  const footer = document.querySelector('.footer');
  if (!footer) return;

  // Remove existing source status if any
  const existing = footer.querySelector('.footer__sources');
  if (existing) existing.remove();

  const sources = meta.sources_checked || [];
  const errors = meta.errors || [];

  if (sources.length === 0 && errors.length === 0) return;

  const div = document.createElement('div');
  div.className = 'footer__sources';

  // Build with DOM methods for safety (trusted data, but being thorough)
  const okCount = sources.length - errors.length;
  if (okCount > 0) {
    const okSpan = document.createElement('span');
    okSpan.className = 'footer__sources-ok';
    okSpan.textContent = `${okCount} sources OK`;
    div.appendChild(okSpan);
  }
  if (errors.length > 0) {
    if (div.childNodes.length > 0) {
      div.appendChild(document.createTextNode(' \u00B7 '));
    }
    const errSpan = document.createElement('span');
    errSpan.className = 'footer__sources-err';
    const errNames = errors.map((e) => (typeof e === 'string' ? e : e.source || e.message || 'unknown'));
    errSpan.textContent = `${errors.length} failed: ${errNames.join(', ')}`;
    div.appendChild(errSpan);
  }

  footer.appendChild(div);
}

function getAllItems() {
  return Object.values(state.data).flat();
}

// ---------------------------------------------------------------------------
// Deadline Badge
// ---------------------------------------------------------------------------

function updateDeadlineBadge() {
  const badge = document.getElementById('deadlineBadge');
  if (!badge) return;
  const count = getUrgentDeadlineCount(state.data.conferences || []);
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function getHashTab() {
  const raw = window.location.hash.replace('#', '').split('?')[0].split('/')[0];
  return TABS.includes(raw) ? raw : (getPreferences().defaultTab || 'pulse');
}

function getHashSub() {
  const raw = window.location.hash.replace('#', '').split('?')[0];
  const parts = raw.split('/');
  return parts[1] || '';
}

/**
 * Parse URL hash parameters: #publications?tags=a,b&sort=newest
 */
function getHashParams() {
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  if (qIdx < 0) return {};
  const params = {};
  hash.slice(qIdx + 1).split('&').forEach((pair) => {
    const [k, v] = pair.split('=').map(decodeURIComponent);
    if (k && v) params[k] = v;
  });
  return params;
}

function navigate(tab) {
  window.location.hash = tab;
}

function onHashChange() {
  state.activeTab = getHashTab();
  updateTabUI();
  renderView();
}

function updateTabUI() {
  document.querySelectorAll('.nav__tab').forEach((el) => {
    const isActive = el.dataset.tab === state.activeTab;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

// ---------------------------------------------------------------------------
// Rendering — delegates to modules
// ---------------------------------------------------------------------------

function renderView() {
  const tab = state.activeTab;
  const sub = getHashSub();

  // Remove skeleton grid class so modules can create their own grid
  contentEl.classList.remove('card-grid');

  // Scroll to top on tab change
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // --- Hub views: Pulse, Radar, Toolkit ---
  if (tab === 'pulse') {
    filterContainer.textContent = '';
    renderPulse(contentEl, state.data, {
      trends: state.extraData.trends,
      brief: state.extraData.brief,
    });
    animateCards();
    return;
  }

  if (tab === 'radar') {
    filterContainer.textContent = '';
    renderRadar(contentEl, state.data, sub);
    animateCards();
    return;
  }

  if (tab === 'toolkit') {
    filterContainer.textContent = '';
    const toolkitData = {
      ...state.data,
      solvers: state.extraData.solvers,
      benchmarks: state.extraData.benchmarks,
    };
    renderToolkit(contentEl, toolkitData, sub);
    animateCards();
    return;
  }

  // --- Watchlist: no filter bar, dedicated module ---
  if (tab === 'watchlist') {
    filterContainer.textContent = '';
    renderWatchlist(contentEl);
    animateCards();
    return;
  }

  // --- Digest: no filter bar, dedicated module ---
  if (tab === 'digest') {
    filterContainer.textContent = '';
    renderDigest(contentEl);
    requestAnimationFrame(() => animateCards());
    return;
  }

  // --- Seminars: no filter bar, dedicated module ---
  if (tab === 'seminars') {
    filterContainer.textContent = '';
    renderSeminars(contentEl, state.data.seminars || []);
    requestAnimationFrame(() => animateCards());
    return;
  }

  // --- Resources (Datasets + Blogs): no filter bar, dedicated module ---
  if (tab === 'datasets') {
    filterContainer.textContent = '';
    renderDatasets(contentEl, state.data.datasets || [], state.data.blogs || []);
    requestAnimationFrame(() => animateCards());
    return;
  }

  // --- Trends: no filter bar, dedicated module ---
  if (tab === 'trends') {
    filterContainer.textContent = '';
    renderTrends(contentEl, state.data);
    requestAnimationFrame(() => animateCards());
    return;
  }

  // --- Funding: no filter bar, dedicated module ---
  if (tab === 'funding') {
    filterContainer.textContent = '';
    renderFunding(contentEl, state.data.funding || [], {});
    requestAnimationFrame(() => animateCards());
    return;
  }

  // --- Awards: no filter bar, dedicated module ---
  if (tab === 'awards') {
    filterContainer.textContent = '';
    renderAwards(contentEl, state.data.awards || [], {});
    requestAnimationFrame(() => animateCards());
    return;
  }

  // --- Resources: no filter bar, dedicated module ---
  if (tab === 'resources') {
    filterContainer.textContent = '';
    renderResources(contentEl, state.data.resources || [], {});
    requestAnimationFrame(() => animateCards());
    return;
  }

  // --- Changelog: no filter bar, dedicated module ---
  if (tab === 'changelog') {
    filterContainer.textContent = '';
    renderChangelog(contentEl);
    requestAnimationFrame(() => animateCards());
    return;
  }

  // --- Data modules: publications, software, conferences, opportunities ---
  const data = state.data[tab] || [];

  // Build filter bar options per module
  const filterOpts = {
    tags: extractTags(data),
    showSource: tab === 'publications',
    showDeadlineSort: tab === 'conferences' || tab === 'opportunities',
  };

  // Render filter bar — trusted template from our own code
  const filterBarEl = document.createElement('div');
  filterBarEl.innerHTML = renderFilterBar(filterOpts);
  filterContainer.textContent = '';
  while (filterBarEl.firstChild) {
    filterContainer.appendChild(filterBarEl.firstChild);
  }
  wireFilterEvents();
  applyHashFilters();

  // Read current filter state
  const filters = getActiveFilters();

  // Delegate to module renderer
  const renderer = MODULE_RENDERERS[tab];
  if (renderer) {
    if (tab === 'conferences') {
      renderer(contentEl, data, filters, state.data.awards || [], state.data.special_issues || []);
    } else {
      renderer(contentEl, data, filters);
    }
  }

  animateCards();
}

function extractTags(items) {
  const tagSet = new Set();
  items.forEach((item) => (item.tags || []).forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

// ---------------------------------------------------------------------------
// Filter Event Wiring
// ---------------------------------------------------------------------------

function syncFiltersToHash() {
  const filters = getActiveFilters();
  const tab = state.activeTab;
  const parts = [];
  if (filters.tags && filters.tags.length) parts.push(`tags=${encodeURIComponent(filters.tags.join(','))}`);
  if (filters.source && filters.source !== 'All Sources') parts.push(`source=${encodeURIComponent(filters.source)}`);
  if (filters.sort && filters.sort !== 'newest') parts.push(`sort=${encodeURIComponent(filters.sort)}`);
  if (filters.logic && filters.logic === 'and') parts.push('logic=and');
  if (filters.dateFrom) parts.push(`dateFrom=${encodeURIComponent(filters.dateFrom)}`);
  if (filters.dateTo) parts.push(`dateTo=${encodeURIComponent(filters.dateTo)}`);
  if (filters.readStatus && filters.readStatus !== 'all') parts.push(`readStatus=${encodeURIComponent(filters.readStatus)}`);
  const qs = parts.length ? '?' + parts.join('&') : '';
  history.replaceState(null, '', `#${tab}${qs}`);
}

function applyHashFilters() {
  const params = getHashParams();
  if (params.tags) {
    const tags = params.tags.split(',');
    document.querySelectorAll('.filter-tag').forEach((el) => {
      if (el.dataset.tag === 'all') { el.classList.remove('active'); return; }
      el.classList.toggle('active', tags.includes(el.dataset.tag));
    });
    if (!document.querySelectorAll('.filter-tag.active').length) {
      document.querySelector('.filter-tag[data-tag="all"]')?.classList.add('active');
    }
  } else {
    // If no hash filters, apply focus tags from onboarding preferences
    const prefs = getPreferences();
    if (prefs.focusTags && prefs.focusTags.length > 0) {
      const filterTags = document.querySelectorAll('.filter-tag');
      let anyMatched = false;
      filterTags.forEach((el) => {
        if (el.dataset.tag === 'all') return;
        if (prefs.focusTags.includes(el.dataset.tag)) {
          el.classList.add('active');
          anyMatched = true;
        }
      });
      if (anyMatched) {
        document.querySelector('.filter-tag[data-tag="all"]')?.classList.remove('active');
      }
    }
  }
  if (params.source) {
    const sel = document.getElementById('filterSource');
    if (sel) sel.value = params.source;
  }
  if (params.sort) {
    const sel = document.getElementById('filterSort');
    if (sel) sel.value = params.sort;
  }
  if (params.logic === 'and') {
    const logicEl = document.getElementById('filterLogic');
    if (logicEl) {
      logicEl.textContent = 'AND';
      logicEl.classList.add('active');
    }
  }
  if (params.dateFrom) {
    const el = document.getElementById('filterDateFrom');
    if (el) el.value = params.dateFrom;
  }
  if (params.dateTo) {
    const el = document.getElementById('filterDateTo');
    if (el) el.value = params.dateTo;
  }
  if (params.readStatus) {
    const el = document.getElementById('filterReadStatus');
    if (el) el.value = params.readStatus;
  }
}

function wireFilterEvents() {
  document.querySelectorAll('.filter-tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      const clickedTag = tag.dataset.tag;

      if (clickedTag === 'all') {
        document.querySelectorAll('.filter-tag').forEach((t) => t.classList.remove('active'));
        tag.classList.add('active');
      } else {
        document.querySelector('.filter-tag[data-tag="all"]')?.classList.remove('active');
        tag.classList.toggle('active');

        const anyActive = document.querySelectorAll('.filter-tag.active').length;
        if (!anyActive) {
          document.querySelector('.filter-tag[data-tag="all"]')?.classList.add('active');
        }
      }

      updateClearBtn();
      syncFiltersToHash();
      renderView();
    });
  });

  const sourceSelect = document.getElementById('filterSource');
  const sortSelect = document.getElementById('filterSort');
  const readStatusSelect = document.getElementById('filterReadStatus');
  if (sourceSelect) sourceSelect.addEventListener('change', () => { updateClearBtn(); syncFiltersToHash(); renderView(); });
  if (sortSelect) sortSelect.addEventListener('change', () => { syncFiltersToHash(); renderView(); });
  if (readStatusSelect) readStatusSelect.addEventListener('change', () => { updateClearBtn(); syncFiltersToHash(); renderView(); });

  const dateFrom = document.getElementById('filterDateFrom');
  const dateTo = document.getElementById('filterDateTo');
  if (dateFrom) dateFrom.addEventListener('change', () => { updateClearBtn(); syncFiltersToHash(); renderView(); });
  if (dateTo) dateTo.addEventListener('change', () => { updateClearBtn(); syncFiltersToHash(); renderView(); });

  // AND/OR toggle
  const logicBtn = document.getElementById('filterLogic');
  if (logicBtn) {
    logicBtn.addEventListener('click', () => {
      logicBtn.textContent = logicBtn.textContent.trim() === 'OR' ? 'AND' : 'OR';
      logicBtn.classList.toggle('active', logicBtn.textContent.trim() === 'AND');
      syncFiltersToHash();
      renderView();
    });
  }

  // Clear filters button
  const clearBtn = document.getElementById('filterClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tag').forEach((t) => t.classList.remove('active'));
      document.querySelector('.filter-tag[data-tag="all"]')?.classList.add('active');
      if (sourceSelect) sourceSelect.value = 'All Sources';
      if (sortSelect) sortSelect.value = 'newest';
      if (readStatusSelect) readStatusSelect.value = 'all';
      const logicBtn = document.getElementById('filterLogic');
      if (logicBtn) { logicBtn.textContent = 'OR'; logicBtn.classList.remove('active'); }
      if (dateFrom) dateFrom.value = '';
      if (dateTo) dateTo.value = '';
      updateClearBtn();
      syncFiltersToHash();
      renderView();
    });
  }

  updateClearBtn();
}

function updateClearBtn() {
  const clearBtn = document.getElementById('filterClear');
  if (!clearBtn) return;
  const activeTags = document.querySelectorAll('.filter-tag.active:not([data-tag="all"])');
  const sourceEl = document.getElementById('filterSource');
  const dateFromEl = document.getElementById('filterDateFrom');
  const dateToEl = document.getElementById('filterDateTo');
  const readStatusEl = document.getElementById('filterReadStatus');
  const hasFilters = activeTags.length > 0
    || (sourceEl && sourceEl.value !== 'All Sources')
    || (dateFromEl && dateFromEl.value)
    || (dateToEl && dateToEl.value)
    || (readStatusEl && readStatusEl.value !== 'all');
  clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
}

// ---------------------------------------------------------------------------
// Card Event Delegation (global — survives re-renders)
// ---------------------------------------------------------------------------

function wireCardEvents() {
  contentEl.addEventListener('click', (e) => {
    // Star / watchlist toggle
    const starBtn = e.target.closest('.card__star');
    if (starBtn) {
      const id = starBtn.dataset.id;
      const item = findItemById(id);
      if (!item) return;

      if (isWatchlisted(id)) {
        removeFromWatchlist(id);
      } else {
        addToWatchlist(item);
      }
      renderView();
      return;
    }

    // Cite button — copy BibTeX
    const citeBtn = e.target.closest('.card__cite');
    if (citeBtn) {
      const id = citeBtn.dataset.id;
      const item = findItemById(id);
      if (!item) return;
      const bib = generateBibTeX(item);
      copyToClipboard(bib).then(() => {
        const origText = citeBtn.textContent;
        citeBtn.textContent = 'Copied!';
        citeBtn.classList.add('card__cite-feedback');
        setTimeout(() => {
          citeBtn.textContent = origText;
          citeBtn.classList.remove('card__cite-feedback');
        }, 1500);
      });
      return;
    }

    // Reading status toggle
    const readBtn = e.target.closest('.card__read-status');
    if (readBtn) {
      const id = readBtn.dataset.id;
      const next = cycleReadStatus(id);
      readBtn.dataset.status = next;
      readBtn.title = `Reading status: ${next}`;
      const dot = readBtn.querySelector('.read-dot');
      if (dot) { dot.className = `read-dot read-dot--${next}`; }
      return;
    }

    // Detail button
    const detailBtn = e.target.closest('.card__detail-btn');
    if (detailBtn) {
      const id = detailBtn.dataset.id;
      const item = findItemById(id);
      if (item) showModal(item);
    }
  });
}

function findItemById(id) {
  const all = [...getAllItems(), ...getWatchlist()];
  return all.find((item) => item.id === id) || null;
}

// ---------------------------------------------------------------------------
// Search Modal Wiring
// ---------------------------------------------------------------------------

let closeSearchFn = null;

function wireSearch() {
  const searchModal = document.getElementById('searchModal');
  const searchInput = document.getElementById('searchInput');
  const searchTrigger = document.getElementById('searchTrigger');

  function openSearch() {
    searchModal.classList.add('open');
    searchModal.setAttribute('aria-hidden', 'false');
    searchInput.focus();
  }

  closeSearchFn = function () {
    searchModal.classList.remove('open');
    searchModal.setAttribute('aria-hidden', 'true');
    searchInput.value = '';
    // Clear results
    const results = searchModal.querySelector('.search-modal__results');
    if (results) {
      results.textContent = '';
      const hint = document.createElement('div');
      hint.className = 'search-modal__empty';
      hint.textContent = 'Start typing to search across all modules.';
      results.appendChild(hint);
    }
  };

  searchTrigger.addEventListener('click', openSearch);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchModal.classList.contains('open') ? closeSearchFn() : openSearch();
    }
    if (e.key === 'Escape') {
      closeSearchFn();
      hideModal();
      hideHelpModal();
    }
  });

  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) closeSearchFn();
  });

  // Wire search module's live input handler
  wireSearchInput(closeSearchFn);
}

// ---------------------------------------------------------------------------
// Theme Toggle — 3-way: dark > light > system > dark
// ---------------------------------------------------------------------------

function wireTheme() {
  const toggle = document.getElementById('themeToggle');
  const root = document.documentElement;

  const ICONS = { dark: '\u263D', light: '\u2600', system: '\u25D1' };
  const CYCLE = ['dark', 'light', 'system'];

  function applyTheme(mode) {
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
      root.dataset.theme = mode;
    }
    toggle.textContent = ICONS[mode] || ICONS.dark;
  }

  toggle.addEventListener('click', () => {
    const saved = localStorage.getItem('porid-theme') || 'dark';
    const idx = CYCLE.indexOf(saved);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    localStorage.setItem('porid-theme', next);
    setPreference('theme', next);
    applyTheme(next);
  });

  // On first load: use stored preference, or detect system
  let saved = localStorage.getItem('porid-theme');
  if (!saved) {
    const prefs = getPreferences();
    if (prefs.theme && prefs.theme !== 'system') {
      saved = prefs.theme;
    } else {
      saved = 'system';
      localStorage.setItem('porid-theme', 'system');
    }
  }
  applyTheme(saved);

  // Listen for system preference changes when in system mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('porid-theme') === 'system') {
      applyTheme('system');
    }
  });
}

// ---------------------------------------------------------------------------
// Tab Click Wiring
// ---------------------------------------------------------------------------

function wireTabs() {
  document.querySelectorAll('.nav__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      navigate(tab.dataset.tab);
    });
  });
}

// ---------------------------------------------------------------------------
// Detail Modal Backdrop
// ---------------------------------------------------------------------------

function wireDetailModal() {
  const modal = document.getElementById('detailModal');
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModal();
  });
}

// ---------------------------------------------------------------------------
// Help Modal (keyboard shortcut cheat sheet)
// ---------------------------------------------------------------------------

function wireHelpModal() {
  const modal = document.getElementById('helpModal');
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideHelpModal();
  });

  const closeBtn = modal.querySelector('.help-modal__close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideHelpModal);
  }
}

function showHelpModal() {
  const modal = document.getElementById('helpModal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function hideHelpModal() {
  const modal = document.getElementById('helpModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

// ---------------------------------------------------------------------------
// Toast Notification
// ---------------------------------------------------------------------------

function showToast(message) {
  // Remove any existing toast
  const existing = document.querySelector('.porid-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'porid-toast';
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  // Inline styles so it works without extra CSS rules
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '2rem',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--color-accent, #6366f1)',
    color: '#fff',
    padding: '0.6rem 1.4rem',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '500',
    zIndex: '9999',
    opacity: '0',
    transition: 'opacity 0.25s ease',
    pointerEvents: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  });

  document.body.appendChild(toast);
  // Trigger reflow then fade in
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 1800);
}

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------

/**
 * Finds the card element that is currently focused or hovered.
 * Returns the card's data-id, or null.
 */
function getFocusedOrHoveredCardId() {
  // Check focused element first
  const focused = document.activeElement?.closest('.card[data-id]');
  if (focused) return focused.dataset.id;

  // Check hovered card
  const hovered = contentEl.querySelector('.card:hover');
  if (hovered) return hovered.dataset.id || null;

  return null;
}

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // "?" — show help modal
    if (e.key === '?') {
      e.preventDefault();
      showHelpModal();
      return;
    }

    // "w" — toggle watchlist for focused/hovered card
    if (e.key === 'w') {
      const cardId = getFocusedOrHoveredCardId();
      if (!cardId) return;
      e.preventDefault();

      if (isWatchlisted(cardId)) {
        removeFromWatchlist(cardId);
        showToast('Removed from watchlist');
      } else {
        const item = findItemById(cardId);
        if (item) {
          addToWatchlist(item);
          showToast('Added to watchlist');
        }
      }
      renderView();
      return;
    }

    // Number keys 1-7 to switch tabs
    const num = parseInt(e.key);
    if (num >= 1 && num <= TABS.length) {
      e.preventDefault();
      navigate(TABS[num - 1]);
      return;
    }
  });
}

// ---------------------------------------------------------------------------
// Watchlist Change Listener
// ---------------------------------------------------------------------------

function wireWatchlistListener() {
  window.addEventListener('porid:watchlist-changed', () => {
    renderView();
  });
}

// ---------------------------------------------------------------------------
// Happening This Week Banner
// ---------------------------------------------------------------------------

function showWeekBanner() {
  if (sessionStorage.getItem('porid-week-banner-dismissed')) return;

  const conferences = state.data.conferences || [];
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Check for conferences happening this week by parsing dates like "June 28 - July 1, 2026"
  const thisWeekConfs = conferences.filter((conf) => {
    if (!conf.dates) return false;
    // Try to parse the start date from the dates string
    const dateStr = conf.dates;
    // Match patterns like "June 28 - July 1, 2026" or "October 18-21, 2026"
    const match = dateStr.match(/^(\w+)\s+(\d+)/);
    if (!match) return false;
    const month = match[1];
    const day = parseInt(match[2]);
    // Extract year from end of string
    const yearMatch = dateStr.match(/(\d{4})/);
    if (!yearMatch) return false;
    const year = parseInt(yearMatch[1]);
    const confDate = new Date(`${month} ${day}, ${year}`);
    if (isNaN(confDate.getTime())) return false;
    // Also check end date if range
    const endMatch = dateStr.match(/[-\u2013]\s*(?:(\w+)\s+)?(\d+),?\s*(\d{4})?/);
    let confEnd = confDate;
    if (endMatch) {
      const endMonth = endMatch[1] || month;
      const endDay = parseInt(endMatch[2]);
      const endYear = endMatch[3] ? parseInt(endMatch[3]) : year;
      confEnd = new Date(`${endMonth} ${endDay}, ${endYear}`);
      if (isNaN(confEnd.getTime())) confEnd = confDate;
    }
    // Check if conference overlaps with this week
    return confDate <= weekEnd && confEnd >= weekStart;
  });

  if (thisWeekConfs.length === 0) return;

  const names = thisWeekConfs.map((c) => c.name).join(', ');
  const banner = document.createElement('div');
  banner.className = 'week-banner';

  const text = document.createElement('span');
  text.textContent = `\uD83D\uDCC5 Happening this week: ${names}`;
  banner.appendChild(text);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'week-banner__close';
  closeBtn.textContent = '\u00D7';
  closeBtn.setAttribute('aria-label', 'Dismiss banner');
  closeBtn.addEventListener('click', () => {
    banner.remove();
    sessionStorage.setItem('porid-week-banner-dismissed', 'true');
  });
  banner.appendChild(closeBtn);

  const statsBanner = document.querySelector('.stats-banner');
  if (statsBanner && statsBanner.parentNode) {
    statsBanner.parentNode.insertBefore(banner, statsBanner.nextSibling);
  }
}

// ---------------------------------------------------------------------------
// Filter Export Wiring (event delegation on filterBarContainer)
// ---------------------------------------------------------------------------

function wireFilterExport() {
  filterContainer.addEventListener('change', (e) => {
    const exportSelect = e.target.closest('#filterExport');
    if (!exportSelect) return;
    const format = exportSelect.value;
    if (!format) return;

    const tab = state.activeTab;
    const data = state.data[tab] || [];
    const filters = getActiveFilters();

    // Apply current filters to get visible items
    const { applyFilters } = { applyFilters: (items, f) => {
      let result = [...items];
      if (!f.tags.includes('all') && f.tags.length > 0) {
        const matcher = f.logic === 'and' ? 'every' : 'some';
        result = result.filter((item) => f.tags[matcher]((t) => (item.tags || []).includes(t)));
      }
      if (f.source && f.source !== 'All Sources') {
        result = result.filter((item) => item.source === f.source);
      }
      return result;
    }};

    const filtered = applyFilters(data, filters);
    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === 'bibtex') {
      const bib = filtered.map((item) => generateBibTeX(item)).join('\n\n');
      downloadFile(bib, `porid-${tab}-${dateStr}.bib`, 'application/x-bibtex');
    } else if (format === 'csv') {
      const csv = generateCSV(filtered);
      downloadFile(csv, `porid-${tab}-${dateStr}.csv`, 'text/csv');
    } else if (format === 'json') {
      downloadFile(JSON.stringify(filtered, null, 2), `porid-${tab}-${dateStr}.json`, 'application/json');
    }

    exportSelect.value = '';
  });
}

// ---------------------------------------------------------------------------
// Card Entry Animation
// ---------------------------------------------------------------------------

function animateCards() {
  const cards = contentEl.querySelectorAll('.card, .list-row, .digest-day, .digest-preview__card, .trends-stat-card, .trends-chart, .trends-list, .pulse__card, .pulse__metric, .radar-item, .toolkit-section, .benchmark-item, .software-item, .solver-row');
  cards.forEach((card, i) => {
    card.setAttribute('data-animate', '');
    card.style.animationDelay = `${i * 0.05}s`;
  });
}

// ---------------------------------------------------------------------------
// Skeleton Loading — trusted HTML template
// ---------------------------------------------------------------------------

function showSkeletons(count = 6) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const article = document.createElement('article');
    article.className = 'skeleton';
    const lines = ['title', 'subtitle', 'body', 'body', 'tags'];
    lines.forEach((type) => {
      const line = document.createElement('div');
      line.className = `skeleton__line skeleton__line--${type}`;
      article.appendChild(line);
    });
    fragment.appendChild(article);
  }
  contentEl.textContent = '';
  contentEl.appendChild(fragment);
  contentEl.classList.add('card-grid');
}

// ---------------------------------------------------------------------------
// Hamburger Menu (mobile)
// ---------------------------------------------------------------------------

function wireHamburger() {
  const btn = document.getElementById('navHamburger');
  const tabs = document.querySelector('.nav__tabs');
  if (!btn || !tabs) return;

  btn.addEventListener('click', () => {
    const isOpen = tabs.classList.toggle('nav__tabs--open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Close menu when a tab is clicked
  tabs.addEventListener('click', (e) => {
    if (e.target.classList.contains('nav__tab')) {
      tabs.classList.remove('nav__tabs--open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ---------------------------------------------------------------------------
// Scroll-Triggered Navbar
// ---------------------------------------------------------------------------

function wireNavScroll() {
  const nav = document.querySelector('.nav');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        nav.classList.toggle('nav--scrolled', window.scrollY > 20);
        ticking = false;
      });
      ticking = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Scroll-to-Top Button
// ---------------------------------------------------------------------------

function wireScrollTop() {
  const btn = document.getElementById('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('scroll-top--visible', window.scrollY > 400);
  });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ---------------------------------------------------------------------------
// Keyboard Arrow Nav Between Cards
// ---------------------------------------------------------------------------

function wireCardKeyNav() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const cards = [...contentEl.querySelectorAll('.card[tabindex]')];
    if (!cards.length) return;
    const current = cards.indexOf(document.activeElement);
    if (current === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowRight'
      ? Math.min(current + 1, cards.length - 1)
      : Math.max(current - 1, 0);
    cards[next].focus();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  wireTheme();
  wireTabs();
  wireHamburger();
  wireSearch();
  wireCardEvents();
  wireFilterExport();
  wireDetailModal();
  wireHelpModal();
  wireKeyboardShortcuts();
  wireWatchlistListener();
  wireNavScroll();
  wireScrollTop();
  wireCardKeyNav();

  showSkeletons();
  await loadAllData();

  state.activeTab = getHashTab();
  updateTabUI();
  renderView();

  window.addEventListener('hashchange', onHashChange);

  // First-visit welcome modal with onboarding interest tags
  if (!localStorage.getItem('porid-welcomed')) {
    const welcomeModal = document.getElementById('welcomeModal');
    if (welcomeModal) {
      welcomeModal.style.display = '';

      // Wire onboarding tag toggle
      const tagsContainer = document.getElementById('onboardingTags');
      if (tagsContainer) {
        tagsContainer.addEventListener('click', (e) => {
          const btn = e.target.closest('.onboarding-tag');
          if (btn) btn.classList.toggle('selected');
        });
      }

      document.getElementById('welcomeDismiss').addEventListener('click', () => {
        // Save selected interest tags before closing
        if (tagsContainer) {
          const selected = Array.from(tagsContainer.querySelectorAll('.onboarding-tag.selected'))
            .map((el) => el.dataset.tag);
          if (selected.length > 0) {
            localStorage.setItem('porid-focus-tags', JSON.stringify(selected));
          }
        }
        welcomeModal.style.display = 'none';
        localStorage.setItem('porid-welcomed', 'true');
        // Re-render to apply focus tags
        renderView();
      });
    }
  }

  // Changelog modal wiring
  wireChangelog();
}

// ---------------------------------------------------------------------------
// Changelog
// ---------------------------------------------------------------------------

let changelogData = null;

async function wireChangelog() {
  const link = document.getElementById('changelogLink');
  const modal = document.getElementById('changelogModal');
  const closeBtn = modal ? modal.querySelector('.changelog-modal__close') : null;
  const contentDiv = document.getElementById('changelogContent');
  if (!link || !modal || !contentDiv) return;

  link.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!changelogData) {
      try {
        changelogData = await fetchJSON('./data/changelog.json');
      } catch {
        changelogData = [];
      }
    }
    // Render changelog — trusted local data
    contentDiv.innerHTML = changelogData.map((v) => `
      <div class="changelog-version">
        <div class="changelog-version__header">
          <span class="changelog-version__tag">v${v.version}</span>
          <span class="changelog-version__date">${v.date}</span>
        </div>
        <ul class="changelog-version__list">
          ${v.changes.map((c) => `<li>${c}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  });
}

init();
