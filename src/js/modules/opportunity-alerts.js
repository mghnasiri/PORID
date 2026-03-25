/**
 * Opportunity Alert Templates (NF-05)
 *
 * Lets users define simple alert rules (type, geography, subfield).
 * On page load, new opportunities are checked against rules.
 * Matching count is shown as a badge on the Opportunities tab.
 *
 * Security: All data comes from local static JSON and localStorage.
 */

const ALERTS_KEY = 'porid-opportunity-alerts';
const SEEN_KEY = 'porid-opportunity-alerts-seen';

// ---------------------------------------------------------------------------
// Alert Rule CRUD
// ---------------------------------------------------------------------------

/**
 * Get all saved alert rules.
 * @returns {Array<{id: string, type: string, geography: string, subfield: string}>}
 */
export function getAlertRules() {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save a new alert rule.
 * @param {{type: string, geography: string, subfield: string}} rule
 */
export function addAlertRule(rule) {
  const rules = getAlertRules();
  rules.push({
    id: 'alert-' + Date.now(),
    type: rule.type || '',
    geography: rule.geography || '',
    subfield: rule.subfield || '',
  });
  localStorage.setItem(ALERTS_KEY, JSON.stringify(rules));
}

/**
 * Delete an alert rule by id.
 * @param {string} id
 */
export function deleteAlertRule(id) {
  const rules = getAlertRules().filter((r) => r.id !== id);
  localStorage.setItem(ALERTS_KEY, JSON.stringify(rules));
}

// ---------------------------------------------------------------------------
// Matching Logic
// ---------------------------------------------------------------------------

/**
 * Get previously-seen opportunity IDs (to detect new ones).
 * @returns {Set<string>}
 */
function getSeenIds() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/**
 * Mark current opportunity IDs as seen.
 * @param {string[]} ids
 */
function markAsSeen(ids) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
}

/**
 * Check if an opportunity matches a single rule.
 * Empty rule fields are treated as "any" (no constraint).
 */
function matchesRule(item, rule) {
  // Type match: check subtype field (funding, position, award) or tags
  if (rule.type) {
    const typeMatch = (item.subtype || '').toLowerCase() === rule.type.toLowerCase()
      || (item.tags || []).some((t) => t.toLowerCase() === rule.type.toLowerCase());
    if (!typeMatch) return false;
  }

  // Geography match: check location field (case-insensitive partial match)
  if (rule.geography) {
    const geo = rule.geography.toLowerCase();
    const loc = (item.location || '').toLowerCase();
    if (!loc.includes(geo)) return false;
  }

  // Subfield match: check tags (case-insensitive partial match)
  if (rule.subfield) {
    const sub = rule.subfield.toLowerCase();
    const tagMatch = (item.tags || []).some((t) => t.toLowerCase().includes(sub));
    if (!tagMatch) return false;
  }

  return true;
}

/**
 * Check opportunities against all alert rules.
 * Returns matching items (only new ones not previously seen).
 * @param {Object[]} opportunities - All opportunity items.
 * @returns {Object[]} Matching new opportunities.
 */
export function checkOpportunityAlerts(opportunities) {
  const rules = getAlertRules();
  if (rules.length === 0) return [];

  const seenIds = getSeenIds();
  const currentIds = opportunities.map((o) => o.id);

  // Find new items (not in previous seen set)
  const newItems = seenIds.size === 0
    ? [] // First load: don't alert on all existing items
    : opportunities.filter((o) => !seenIds.has(o.id));

  // Update seen set to current
  markAsSeen(currentIds);

  if (newItems.length === 0) return [];

  // Check new items against rules
  const matches = newItems.filter((item) =>
    rules.some((rule) => matchesRule(item, rule))
  );

  return matches;
}

/**
 * Get the count of matching new opportunities (cached per session).
 * @param {Object[]} opportunities
 * @returns {number}
 */
export function getAlertMatchCount(opportunities) {
  const matches = checkOpportunityAlerts(opportunities);
  return matches.length;
}

// ---------------------------------------------------------------------------
// Alert Rule Builder UI (rendered into the Opportunities view)
// ---------------------------------------------------------------------------

/**
 * Renders the alert rule builder panel HTML.
 * @returns {string}
 */
export function renderAlertBuilder() {
  const rules = getAlertRules();

  const ruleRows = rules.map((r) =>
    `<div class="alert-rule" data-rule-id="${r.id}">` +
      `<span class="alert-rule__text">` +
        `${r.type ? `<span class="alert-rule__tag">${r.type}</span>` : ''}` +
        `${r.geography ? `<span class="alert-rule__tag">${r.geography}</span>` : ''}` +
        `${r.subfield ? `<span class="alert-rule__tag">${r.subfield}</span>` : ''}` +
        `${!r.type && !r.geography && !r.subfield ? '<em>Match all</em>' : ''}` +
      `</span>` +
      `<button class="alert-rule__delete" data-delete-rule="${r.id}" title="Delete rule">&times;</button>` +
    `</div>`
  ).join('');

  return `
    <div class="alert-builder">
      <div class="alert-builder__header">
        <h4 class="alert-builder__title">&#9888; Alert Rules</h4>
        <button class="alert-builder__toggle" id="alertBuilderToggle" aria-label="Toggle alert builder">
          ${rules.length > 0 ? `${rules.length} rule${rules.length !== 1 ? 's' : ''}` : 'Set up'}
        </button>
      </div>
      <div class="alert-builder__body" id="alertBuilderBody" style="display:none;">
        ${ruleRows ? `<div class="alert-rules-list">${ruleRows}</div>` : ''}
        <div class="alert-builder__form">
          <select class="alert-builder__select" id="alertType" aria-label="Opportunity type">
            <option value="">Any type</option>
            <option value="funding">Funding</option>
            <option value="postdoc">Postdoc</option>
            <option value="faculty">Faculty</option>
            <option value="phd">PhD</option>
            <option value="industry">Industry</option>
          </select>
          <input type="text" class="alert-builder__input" id="alertGeo" placeholder="Geography (e.g. USA, Europe)" aria-label="Geography filter">
          <input type="text" class="alert-builder__input" id="alertSubfield" placeholder="Subfield tag (e.g. ml-for-or)" aria-label="Subfield filter">
          <button class="alert-builder__add" id="alertAddRule">+ Add Rule</button>
        </div>
      </div>
    </div>
  `;
}
