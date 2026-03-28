/**
 * Decision Helper — "Which solver should I use?" wizard.
 *
 * Renders 4 filter dropdowns, scores all solvers using data/decision_rules.json,
 * and displays the top 3 recommendations with match percentages, descriptions,
 * licensing gotchas, and quick-start code snippets.
 *
 * All rendered content comes from static JSON data files (not user input).
 * Dynamic values are escaped via _escapeHtml() before insertion.
 *
 * Usage:
 *   import { DecisionHelper } from './decision-helper.js';
 *   const dh = new DecisionHelper(containerEl, rulesData, solversArray);
 *   dh.render();
 */

export class DecisionHelper {
  /**
   * @param {HTMLElement} container - mount point
   * @param {Object} rulesData - parsed decision_rules.json
   * @param {Array} solversArray - array from solvers.json → .solvers
   */
  constructor(container, rulesData, solversArray) {
    this.container = container;
    this.rules = rulesData;
    this.solvers = solversArray;
    this.filters = {
      problem_type: null,
      budget: null,
      language: null,
      scale: null,
      deployment: null,
    };
  }

  render() {
    // Build DOM safely using createElement + textContent for labels
    const wrapper = document.createElement('div');
    wrapper.className = 'decision-helper';

    const title = document.createElement('h2');
    title.className = 'dh-title';
    title.textContent = 'Which solver should I use?';
    wrapper.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'dh-subtitle';
    subtitle.textContent = 'Select your requirements to get a personalized recommendation';
    wrapper.appendChild(subtitle);

    const filtersDiv = document.createElement('div');
    filtersDiv.className = 'dh-filters';
    ['problem_type', 'budget', 'language', 'scale', 'deployment'].forEach(key => {
      filtersDiv.appendChild(this._buildDropdown(key));
    });
    wrapper.appendChild(filtersDiv);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'dh-reset';
    resetBtn.textContent = 'Clear All Filters';
    resetBtn.addEventListener('click', () => {
      Object.keys(this.filters).forEach(k => this.filters[k] = null);
      wrapper.querySelectorAll('select').forEach(s => s.value = '');
      this._updateResults();
    });
    wrapper.appendChild(resetBtn);

    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'dh-results';
    resultsDiv.id = 'dh-results';
    const prompt = document.createElement('p');
    prompt.className = 'dh-prompt';
    prompt.textContent = 'Select at least one filter above to get started.';
    resultsDiv.appendChild(prompt);
    wrapper.appendChild(resultsDiv);

    this.container.textContent = '';
    this.container.appendChild(wrapper);
    this._bindEvents();
    // G39: Load filters from URL and trigger recommendations
    const hash = window.location.hash.replace('#', '');
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) {
      const urlParams = new URLSearchParams(hash.slice(qIdx + 1));
      let anySet = false;
      for (const [k, v] of urlParams) {
        if (this.filters.hasOwnProperty(k)) {
          this.filters[k] = v;
          const select = wrapper.querySelector(`#dh-${k}`);
          if (select) {
            select.value = v;
            anySet = true;
          }
        }
      }
      // Dispatch change event so the bound handler updates results.
      // Setting .value programmatically does not fire change events.
      if (anySet) {
        const firstSelect = wrapper.querySelector('select[data-filter]');
        if (firstSelect) {
          firstSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }

  // ── Private methods ───────────────────────────────────────────────

  _buildDropdown(filterKey) {
    const filter = this.rules.filters[filterKey];
    if (!filter) return document.createElement('div');

    const group = document.createElement('div');
    group.className = 'dh-filter-group';

    const label = document.createElement('label');
    label.setAttribute('for', `dh-${filterKey}`);
    label.textContent = filter.label;
    group.appendChild(label);

    const select = document.createElement('select');
    select.id = `dh-${filterKey}`;
    select.dataset.filter = filterKey;

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Select...';
    select.appendChild(defaultOpt);

    for (const o of filter.options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      select.appendChild(opt);
    }

    group.appendChild(select);
    return group;
  }

  _bindEvents() {
    this.container.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', (e) => {
        this.filters[e.target.dataset.filter] = e.target.value || null;
        this._updateResults();
        // G39: URL deep-linking
        const params = new URLSearchParams();
        Object.entries(this.filters).forEach(([k, v]) => { if (v) params.set(k, v); });
        const paramStr = params.toString();
        history.replaceState(null, '', `#solvers${paramStr ? '?' + paramStr : ''}`);
      });
    });
  }

  _recommend() {
    const scores = this.rules.scores;
    const activeFilters = Object.entries(this.filters).filter(([, v]) => v);

    if (activeFilters.length === 0) return [];

    return Object.entries(scores)
      .map(([solverId, solverScores]) => {
        let total = 0;
        let maxPossible = 0;
        for (const [key, value] of activeFilters) {
          total += (solverScores[key]?.[value] || 0);
          maxPossible += 10;
        }
        const solver = this.solvers.find(s => s.id === solverId);
        return {
          id: solverId,
          solver,
          score: total,
          percent: maxPossible > 0 ? Math.round((total / maxPossible) * 100) : 0,
        };
      })
      .filter(r => r.score > 0 && r.solver)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  _updateResults() {
    const results = this._recommend();
    const container = document.getElementById('dh-results');
    if (!container) return;

    container.textContent = '';

    if (results.length === 0) {
      const p = document.createElement('p');
      p.className = 'dh-prompt';
      p.textContent = 'Select at least one filter above to get started.';
      container.appendChild(p);
      return;
    }

    results.forEach((r, i) => {
      container.appendChild(this._buildResultCard(r, i));
    });
  }

  _buildResultCard(r, index) {
    const s = r.solver;
    const isTop = index === 0;

    const card = document.createElement('div');
    card.className = `dh-result ${isTop ? 'dh-result-top' : ''}`;

    // Rank badge
    const rank = document.createElement('div');
    rank.className = 'dh-result-rank';
    rank.textContent = isTop ? '★ Best Match' : `#${index + 1}`;
    card.appendChild(rank);

    const body = document.createElement('div');
    body.className = 'dh-result-body';

    // Name + score row
    const h3 = document.createElement('h3');
    h3.className = 'dh-result-name';
    const nameLink = document.createElement('a');
    nameLink.href = `#solvers/${r.id}`;
    nameLink.textContent = s.name;
    h3.appendChild(nameLink);
    const scoreBadge = document.createElement('span');
    scoreBadge.className = 'dh-result-score';
    scoreBadge.textContent = `${r.percent}% match`;
    h3.appendChild(scoreBadge);
    body.appendChild(h3);

    // License + cost badge row
    const costRow = document.createElement('div');
    costRow.className = 'dh-cost-row';
    const isOpen = s.open_source;
    const isAcademic = (s.academic_free || s.license?.academic_free) && !isOpen;
    const costBadge = document.createElement('span');
    if (isOpen) {
      costBadge.className = 'dh-cost-badge dh-cost-free';
      costBadge.textContent = 'Free';
    } else if (isAcademic && (this.filters.budget === 'academic' || this.filters.budget === 'any' || !this.filters.budget)) {
      costBadge.className = 'dh-cost-badge dh-cost-academic';
      costBadge.textContent = 'Free (Academic)';
    } else {
      costBadge.className = 'dh-cost-badge dh-cost-commercial';
      costBadge.textContent = 'Paid';
    }
    costRow.appendChild(costBadge);
    const licenseDetail = document.createElement('span');
    licenseDetail.className = 'dh-cost-detail';
    licenseDetail.textContent = isOpen ? (s.license_spdx || s.license?.type || 'Open Source') : (s.commercial_pricing_note?.split('.')[0] || s.license?.type || 'Commercial');
    costRow.appendChild(licenseDetail);
    body.appendChild(costRow);

    // Justification
    const justP = document.createElement('p');
    justP.className = 'dh-justification';
    justP.textContent = this._generateJustification(s);
    body.appendChild(justP);

    // Problem type tags
    const meta = document.createElement('div');
    meta.className = 'dh-result-meta';
    this._addTag(meta, `v${s.current_version || '?'}`);
    (s.problem_types || []).slice(0, 6).forEach(pt => {
      this._addTag(meta, pt, 'dh-tag-pt');
    });
    body.appendChild(meta);

    // Full licensing gotcha warning
    const gotcha = s.licensing_gotcha || '';
    if (gotcha) {
      const gotchaDiv = document.createElement('div');
      gotchaDiv.className = 'dh-gotcha';
      const gotchaIcon = document.createElement('span');
      gotchaIcon.className = 'dh-gotcha-icon';
      gotchaIcon.textContent = '⚠';
      gotchaDiv.appendChild(gotchaIcon);
      const gotchaText = document.createElement('span');
      gotchaText.textContent = gotcha;
      gotchaDiv.appendChild(gotchaText);
      body.appendChild(gotchaDiv);
    }

    // Quick start (collapsible)
    const quickStart = s.quick_start || {};
    if (quickStart.install) {
      const details = document.createElement('details');
      details.className = 'dh-quickstart';
      const summary = document.createElement('summary');
      summary.textContent = 'Quick Start';
      details.appendChild(summary);
      const installPre = document.createElement('pre');
      const installCode = document.createElement('code');
      installCode.textContent = quickStart.install;
      installPre.appendChild(installCode);
      details.appendChild(installPre);
      if (quickStart.code) {
        const codePre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = quickStart.code;
        codePre.appendChild(codeEl);
        details.appendChild(codePre);
      }
      body.appendChild(details);
    }

    card.appendChild(body);
    return card;
  }

  _generateJustification(solver) {
    const parts = [];
    if (solver.benchmark_tier?.includes('Tier 1')) {
      parts.push('Industry-leading performance');
    } else if (solver.benchmark_tier?.includes('Tier 2')) {
      parts.push('Competitive performance');
    }
    if (solver.open_source) {
      parts.push(`Free and open source (${solver.license_spdx || solver.license_type || solver.license?.type || 'open license'})`);
    } else if ((solver.academic_free || solver.license?.academic_free) && this.filters.budget === 'academic') {
      parts.push('Free academic license available');
    } else {
      parts.push(solver.commercial_pricing_note?.split('.')[0] || 'Commercial license required');
    }
    if (this.filters.language && this.filters.language !== 'any') {
      const langName = this.filters.language.charAt(0).toUpperCase() + this.filters.language.slice(1);
      parts.push(`${langName} support available`);
    }
    return parts.join('. ') + '.';
  }

  _addTag(parent, text, extraClass) {
    const span = document.createElement('span');
    span.className = `dh-tag ${extraClass || ''}`.trim();
    span.textContent = text;
    parent.appendChild(span);
  }
}
