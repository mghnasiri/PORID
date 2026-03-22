/**
 * PORID — Main Application Controller
 *
 * Thin orchestrator: loads data, routes hash changes to module render()
 * functions, wires global UI (theme, search modal, card event delegation).
 *
 * Security: innerHTML usage throughout the app renders content exclusively
 * from our own local static JSON files, not from user input or external
 * sources. In a production app with user-generated content, use DOMPurify.
 */

// --- Module imports ---
import { render as renderPublications } from './modules/publications.js';
import { render as renderSoftware } from './modules/software.js';
import { render as renderConferences } from './modules/conferences.js';
import { render as renderOpportunities } from './modules/opportunities.js';
import { render as renderWatchlist } from './modules/watchlist.js';
import { render as renderDigest } from './modules/digest.js';
import { initSearch, wireSearchInput } from './modules/search.js';

// --- Component / utility imports ---
import { renderFilterBar, getActiveFilters } from './components/filters.js';
import { showModal, hideModal } from './components/modal.js';
import { getWatchlist, addToWatchlist, removeFromWatchlist, isWatchlisted } from './utils/storage.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  data: {
    publications: [],
    software: [],
    conferences: [],
    opportunities: [],
  },
  activeTab: 'publications',
};

const TABS = ['publications', 'software', 'conferences', 'opportunities', 'watchlist', 'digest'];

const DATA_FILES = {
  publications: './data/publications.json',
  software: './data/software.json',
  conferences: './data/conferences.json',
  opportunities: './data/opportunities.json',
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
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function updateStats() {
  const allItems = getAllItems();
  const today = new Date().toISOString().slice(0, 10);
  const newToday = allItems.filter(
    (i) => (i.date || '').slice(0, 10) === today
  ).length;

  statNewEl.textContent = newToday;
  statTotalEl.textContent = allItems.length;
}

function getAllItems() {
  return Object.values(state.data).flat();
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function getHashTab() {
  const hash = window.location.hash.replace('#', '');
  return TABS.includes(hash) ? hash : 'publications';
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

  // --- Watchlist: no filter bar, dedicated module ---
  if (tab === 'watchlist') {
    filterContainer.textContent = '';
    renderWatchlist(contentEl);
    return;
  }

  // --- Digest: no filter bar, dedicated module ---
  if (tab === 'digest') {
    filterContainer.textContent = '';
    renderDigest(contentEl);
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

  // Render filter bar (trusted template)
  filterContainer.innerHTML = renderFilterBar(filterOpts);
  wireFilterEvents();

  // Read current filter state
  const filters = getActiveFilters();

  // Delegate to module renderer
  const renderer = MODULE_RENDERERS[tab];
  if (renderer) {
    renderer(contentEl, data, filters);
  }
}

function extractTags(items) {
  const tagSet = new Set();
  items.forEach((item) => (item.tags || []).forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

// ---------------------------------------------------------------------------
// Filter Event Wiring
// ---------------------------------------------------------------------------

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

      renderView();
    });
  });

  const sourceSelect = document.getElementById('filterSource');
  const sortSelect = document.getElementById('filterSort');
  if (sourceSelect) sourceSelect.addEventListener('change', () => renderView());
  if (sortSelect) sortSelect.addEventListener('change', () => renderView());
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
    }
  });

  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) closeSearchFn();
  });

  // Wire search module's live input handler
  wireSearchInput(closeSearchFn);
}

// ---------------------------------------------------------------------------
// Theme Toggle
// ---------------------------------------------------------------------------

function wireTheme() {
  const toggle = document.getElementById('themeToggle');
  const root = document.documentElement;

  toggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    toggle.textContent = next === 'dark' ? '\u263D' : '\u2600';
    localStorage.setItem('porid-theme', next);
  });

  const saved = localStorage.getItem('porid-theme');
  if (saved) {
    root.dataset.theme = saved;
    toggle.textContent = saved === 'dark' ? '\u263D' : '\u2600';
  }
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
// Watchlist Change Listener
// ---------------------------------------------------------------------------

function wireWatchlistListener() {
  window.addEventListener('porid:watchlist-changed', () => {
    renderView();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  wireTheme();
  wireTabs();
  wireSearch();
  wireCardEvents();
  wireDetailModal();
  wireWatchlistListener();

  await loadAllData();

  state.activeTab = getHashTab();
  updateTabUI();
  renderView();

  window.addEventListener('hashchange', onHashChange);
}

init();
