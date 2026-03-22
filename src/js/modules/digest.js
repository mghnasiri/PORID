/**
 * Digest module — loads and displays past digest JSON files.
 *
 * Attempts to fetch digest-YYYY-MM-DD.json for the last 14 days
 * and renders available digests as expandable day summaries.
 * Falls back to a placeholder when no digests are found.
 */

import { formatDate } from '../utils/date.js';
import { showModal } from '../components/modal.js';

const LOOKBACK_DAYS = 14;

/**
 * Generate date strings for the last N days.
 * @param {number} days
 * @returns {string[]} Array of 'YYYY-MM-DD' strings, newest first.
 */
function recentDates(days) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Attempt to fetch a digest JSON file. Returns null on 404 or error.
 * @param {string} dateStr
 * @returns {Promise<Object|null>}
 */
async function fetchDigest(dateStr) {
  try {
    const resp = await fetch(`./data/digest-${dateStr}.json`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Load all available digests from the last N days.
 * @returns {Promise<Object[]>}
 */
async function loadDigests() {
  const dates = recentDates(LOOKBACK_DAYS);
  const results = await Promise.all(dates.map(fetchDigest));
  return results.filter(Boolean);
}

/**
 * Build a digest day card using DOM methods.
 * @param {Object} digest
 * @returns {HTMLElement}
 */
function buildDigestCard(digest) {
  const card = document.createElement('div');
  card.className = 'digest-day';

  // Header
  const header = document.createElement('div');
  header.className = 'digest-day__header';

  const dateEl = document.createElement('h3');
  dateEl.className = 'digest-day__date';
  dateEl.textContent = formatDate(digest.date);

  const statsEl = document.createElement('span');
  statsEl.className = 'digest-day__stats';
  const s = digest.stats || {};
  statsEl.textContent = `${s.total || 0} items`;

  header.appendChild(dateEl);
  header.appendChild(statsEl);
  card.appendChild(header);

  // Sections
  const sections = [
    { key: 'publications', icon: '\uD83D\uDCDA', label: 'Publications' },
    { key: 'software', icon: '\uD83D\uDCE6', label: 'Software Updates' },
    { key: 'conferences', icon: '\uD83C\uDF93', label: 'Upcoming Deadlines' },
    { key: 'opportunities', icon: '\uD83D\uDCBC', label: 'Opportunities' },
  ];

  const body = document.createElement('div');
  body.className = 'digest-day__body';

  sections.forEach(({ key, icon, label }) => {
    const items = digest[key] || [];
    if (items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'digest-section';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'digest-section__header';
    sectionHeader.textContent = `${icon} ${label} (${items.length})`;
    section.appendChild(sectionHeader);

    const list = document.createElement('div');
    list.className = 'digest-section__list';

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'digest-item';
      row.addEventListener('click', () => showModal(item));

      const title = document.createElement('span');
      title.className = 'digest-item__title';
      title.textContent = item.title || item.name || 'Untitled';

      const meta = document.createElement('span');
      meta.className = 'digest-item__meta';
      if (item.source) {
        meta.textContent = item.source;
      } else if (item.version) {
        meta.textContent = `v${item.version}`;
      } else if (item.cfp_deadline) {
        meta.textContent = `CFP: ${item.cfp_deadline}`;
      } else if (item.deadline) {
        meta.textContent = `Deadline: ${item.deadline}`;
      }

      row.appendChild(title);
      row.appendChild(meta);
      list.appendChild(row);
    });

    section.appendChild(list);
    body.appendChild(section);
  });

  card.appendChild(body);
  return card;
}

/**
 * Renders the digest view.
 * @param {HTMLElement} container
 */
export async function render(container) {
  container.textContent = '';

  // Loading state
  const loading = document.createElement('div');
  loading.className = 'digest-placeholder';
  const loadingTitle = document.createElement('h2');
  loadingTitle.className = 'digest-placeholder__title';
  loadingTitle.textContent = 'Daily Digest';
  const loadingText = document.createElement('p');
  loadingText.className = 'digest-placeholder__subtitle';
  loadingText.textContent = 'Loading past digests...';
  loading.appendChild(loadingTitle);
  loading.appendChild(loadingText);
  container.appendChild(loading);

  // Fetch digests
  const digests = await loadDigests();

  container.textContent = '';

  if (digests.length === 0) {
    // No digests found — show placeholder
    const wrapper = document.createElement('div');
    wrapper.className = 'digest-placeholder';

    const header = document.createElement('div');
    header.className = 'digest-placeholder__header';

    const h2 = document.createElement('h2');
    h2.className = 'digest-placeholder__title';
    h2.textContent = 'Daily Digest';

    const subtitle = document.createElement('p');
    subtitle.className = 'digest-placeholder__subtitle';
    subtitle.textContent = 'No digests available yet. Digests are generated daily when the data pipeline runs.';

    header.appendChild(h2);
    header.appendChild(subtitle);
    wrapper.appendChild(header);

    // Preview cards
    const preview = document.createElement('div');
    preview.className = 'digest-preview';

    const previewSections = [
      { icon: '\uD83D\uDCDA', title: 'New Publications', desc: 'Papers matching your interests' },
      { icon: '\uD83D\uDCE6', title: 'Software Updates', desc: 'Solver and tool releases' },
      { icon: '\uD83C\uDF93', title: 'Upcoming Deadlines', desc: 'CFP deadlines within 30 days' },
      { icon: '\uD83D\uDCBC', title: 'New Opportunities', desc: 'Academic and industry positions' },
    ];

    previewSections.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'digest-preview__card';

      const icon = document.createElement('span');
      icon.className = 'digest-preview__icon';
      icon.textContent = s.icon;

      const body = document.createElement('div');
      body.className = 'digest-preview__body';

      const title = document.createElement('div');
      title.className = 'digest-preview__card-title';
      title.textContent = s.title;

      const desc = document.createElement('div');
      desc.className = 'digest-preview__card-desc';
      desc.textContent = s.desc;

      body.appendChild(title);
      body.appendChild(desc);
      card.appendChild(icon);
      card.appendChild(body);
      preview.appendChild(card);
    });

    wrapper.appendChild(preview);

    const note = document.createElement('div');
    note.className = 'digest-placeholder__note';
    note.textContent = 'Run the pipeline (python pipeline/run_pipeline.py && python pipeline/build_digest.py) to generate your first digest.';
    wrapper.appendChild(note);

    container.appendChild(wrapper);
    return;
  }

  // Render found digests
  const wrapper = document.createElement('div');
  wrapper.className = 'digest-list';

  const h2 = document.createElement('h2');
  h2.className = 'digest-list__title';
  h2.textContent = 'Past Digests';
  wrapper.appendChild(h2);

  const subtitle = document.createElement('p');
  subtitle.className = 'digest-list__subtitle';
  subtitle.textContent = `${digests.length} digest${digests.length !== 1 ? 's' : ''} from the last ${LOOKBACK_DAYS} days`;
  wrapper.appendChild(subtitle);

  digests.forEach((digest) => {
    wrapper.appendChild(buildDigestCard(digest));
  });

  container.appendChild(wrapper);
}
