# PORID Solvers Tab — Bug Fixes & Design Improvements

**Context:** A full design audit of `https://mghnasiri.github.io/PORID/#solvers` was performed on 2026-03-28. This spec contains the prioritized fixes. Work in the PORID repo (`src/` directory). All changes are to vanilla JS/CSS — no frameworks, no build tools.

---

## P0 — Critical Bugs (fix first, in order)

### 1. Fix solver detail page crash (`solver-detail.js`)

**File:** `src/js/views/solver-detail.js`

**Bug:** Line 226 calls `useSection.insertBefore(editorialP, useGrid)` but `useGrid` has not been appended to `useSection` yet — it's still a detached DOM node. This throws `NotFoundError` and the entire detail page renders blank.

**Console error on live site:**
```
NotFoundError: Failed to execute 'insertBefore' on 'Node':
The node before which the new node is to be inserted is not a child of this node.
    at Module.render (solver-detail.js:226:16)
```

**Fix:** In the "When to Use / Not Use" section (around line 182–229), reorder the DOM operations so `editorialP` is appended before `useGrid`:

```js
// Current broken order:
useSection.insertBefore(editorialP, useGrid);  // ← useGrid not a child yet
useSection.appendChild(useGrid);

// Correct order:
useSection.appendChild(editorialP);
useSection.appendChild(useGrid);
```

**Verify:** Navigate to `#solvers/gurobi` and confirm the detail page renders with all sections: Licensing & Cost, When to Use / Not Use, Capabilities, Quick Start, Performance & Benchmarks, Ecosystem Health, Sources.

---

### 2. Wire up hero problem-type card filtering

**File:** `src/js/modules/toolkit.js` (the `buildSolvers` function, around line 660–675)

**Bug:** The hero section has 6 cards linking to routes like `#solvers?problem_type=mip`, `#solvers?problem_type=cp`, `#solvers?budget=free`. These links navigate but produce zero filtering — all 17 solver rows remain visible.

**Fix:** After the solver comparison table is built, read `URLSearchParams` from the hash and apply filtering:

1. Parse query params from `window.location.hash` (e.g., `#solvers?problem_type=mip` → `problem_type=mip`).
2. For `problem_type` values, map them to the problem-type abbreviations used in `solver.problem_types[]`:
   - `mip` → highlight solvers with "LP" or "MIP"
   - `minlp` → highlight solvers with "NLP" or "MINLP" or "QP"
   - `cp` → highlight solvers with "CP" or "Scheduling" or "Assignment"
   - `vrp` → highlight solvers with "VRP" or "Routing"
   - `sdp` → highlight solvers with "SOCP" or "SDP" or "Conic"
3. For `budget=free` → highlight solvers where `s.open_source === true`.
4. Apply by adding `solver-row--highlighted` to matching rows and `solver-row--dimmed` to non-matching rows. Both classes already exist in CSS.
5. Scroll the table into view after filtering.
6. Add a "Clear filter" button or allow clicking "All" to reset.

**Verify:** Click "Linear / MIP" card → only LP/MIP-capable solvers highlighted, others dimmed. Click "Free & Open Source" → only open-source solvers highlighted.

---

### 3. Fix stats banner counter initialization

**File:** `src/js/app.js`

**Bug:** The stats banner shows `—` for "solvers tracked", "modeling tools", and "benchmark suites". Only "last updated" works. The `animateCounter` function either runs before the extra data (solvers, modeling tools, benchmarks) is loaded, or never runs for the solvers tab.

**Investigate:** Search for `animateCounter` and `statSolvers` in `app.js`. The counters likely fire during initial load but the solver/tool/benchmark JSON hasn't resolved yet. The comment near line 192 says "Re-run stats now that solver/tool/benchmark data is loaded" — verify this code path actually executes.

**Fix:** Ensure `animateCounter` is called AFTER the `Promise.all` for hub data resolves, and that it targets the correct element IDs (`statSolvers`, `statTools`, `statBenchmarks`). The solver count should exclude modeling tool IDs (`pyomo`, `jump`, `cvxpy`, `ampl`, `gams`).

**Verify:** Reload the page. Stats banner should show actual numbers (e.g., "17 solvers tracked", "6 modeling tools", etc.) with the counter animation.

---

## P1 — Functional / Accessibility Fixes

### 4. Replace undefined CSS custom properties

**File:** `src/css/style.css`

**Bug:** `var(--color-border)` and `var(--color-muted)` are used in solver table styles but are NOT defined in `:root`. They resolve to empty strings, causing fallback to browser defaults.

**Fix:** Find and replace these undefined tokens with the actual design tokens:

- `var(--color-border)` → `rgba(197, 160, 89, 0.15)` (matching `--border-subtle` value) or use `var(--color-accent-dim)`
- `var(--color-muted)` → `var(--color-text-muted)`

Affected areas (search for `--color-border` and `--color-muted` in `style.css`):
- `.solver-table th` border-bottom
- `.solver-table td` border-bottom
- `.solver-row__vendor` color
- `.solver-row__langs` color
- `.solver-row__date` color
- Any other references

Also add these aliases to `:root` and `[data-theme="light"]` if you prefer keeping the short names:
```css
--color-border: rgba(197, 160, 89, 0.15);
--color-muted: #8892B0;
```

**Verify:** Solver table borders should be subtle gold-tinted lines, not bright white. Vendor names should be visibly dimmer than solver names.

---

### 5. Fix `--color-text-faint` contrast ratio

**File:** `src/css/style.css`

**Bug:** `--color-text-faint: #4A5568` has a contrast ratio of 2.34:1 against `--color-bg: #0A192F`. WCAG AA requires 4.5:1 for normal text.

**Fix:** Change `--color-text-faint` in both dark and light theme:

```css
/* Dark theme */
--color-text-faint: #718096;  /* ~4.8:1 contrast against #0A192F */

/* Light theme — verify contrast against #F5F3EF */
```

**Verify:** Date labels, secondary text, and muted information should still look "faint" but be legible. Run a contrast check: `#718096` on `#0A192F` should be ≥4.5:1.

---

## P2 — Design Quality Improvements

### 6. Increase solver table font sizes

**File:** `src/css/style.css`

**Current values (too small):**
- `.solver-table` → `font-size: 0.8rem` (12.8px)
- `.solver-table th` → `font-size: 0.65rem` (10.4px)
- `.solver-row__vendor` → `font-size: 0.65rem` (10.4px)
- `.solver-row__links a` → `font-size: 0.65rem` (10.4px)

**Fix:** Use the design system tokens instead of hardcoded values:

```css
.solver-table { font-size: var(--fs-base); }           /* 0.875rem / 14px */
.solver-table th { font-size: var(--fs-sm); }           /* 0.75rem / 12px */
.solver-row__vendor { font-size: var(--fs-xs); }        /* But raise --fs-xs from 0.65rem to 0.7rem */
.solver-row__links a { font-size: var(--fs-xs); }
.solver-row__date { font-size: var(--fs-xs); }
```

Also consider raising `--fs-xs` from `0.65rem` to `0.7rem` globally — 10.4px is below comfortable reading size.

---

### 7. Improve comparison checkbox discoverability

**File:** `src/js/modules/toolkit.js` + `src/css/style.css`

**Bug:** Comparison checkboxes are 14×14px with no visual hint they exist or what they're for.

**Fix:**
1. Add instructional text above the table: "Select 2–4 solvers to compare side by side" (small, muted text).
2. Increase checkbox touch target: wrap in a label or pad the `.solver-row__check` cell to at least 44×44px clickable area.
3. Style the checkbox with accent color when checked.

---

### 8. Refactor hero innerHTML to createElement (consistency)

**File:** `src/js/modules/toolkit.js`, `buildSolvers` function around line 663

**Issue:** The hero section uses `hero.innerHTML = \`...\`` while every other section uses safe DOM construction (`document.createElement` + `textContent`).

**Fix:** Refactor the hero to use `createElement`. This isn't a security issue (content is static) but maintains the file's own stated convention.

---

### 9. Add loading skeleton for solver detail pages

**File:** `src/js/modules/toolkit.js`, around line 88–94

**Issue:** The dynamic `import('../views/solver-detail.js')` leaves `contentDiv` empty during load.

**Fix:** Before the `.then()`, insert a loading skeleton:
```js
contentDiv.innerHTML = '<div class="solver-detail-skeleton"><div class="skeleton-line" style="width:40%"></div><div class="skeleton-line"></div><div class="skeleton-line" style="width:70%"></div></div>';
```
Add corresponding CSS with a shimmer animation.

---

## Testing Checklist

After all fixes:

- [ ] `#solvers` loads with stats banner showing real numbers
- [ ] Hero problem-type cards filter the solver table
- [ ] `#solvers/gurobi` renders the full detail page (all sections)
- [ ] `#solvers/highs` renders (open-source solver, different data shape)
- [ ] `#solvers/or-tools` renders (CP/VRP solver, different problem types)
- [ ] Table borders are subtle gold, not bright white
- [ ] Vendor names are visibly dimmer than solver names
- [ ] No console errors on any page
- [ ] Comparison: select 2 solvers → compare bar appears → "Compare Selected" opens panel
- [ ] Keyboard nav: press `1` to go to Solvers, `J/K` to navigate rows
- [ ] Light mode toggle works without visual breakage
- [ ] High contrast mode works
- [ ] Reduced motion toggle disables animations
