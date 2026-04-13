# Design Critique: PORID — Solvers Tab (`#solvers`)

**Date:** 2026-03-28
**Auditor:** Claude (source code + live site inspection)
**Scope:** `https://mghnasiri.github.io/PORID/#solvers` and `#solvers/{id}` detail pages
**Method:** Accessibility tree analysis, computed style audit, contrast ratio calculations, console error capture, DOM measurements, and CSS rule inspection across the codebase.

---

## Overall Impression

The Solvers tab is an exceptionally well-architected reference tool. The information hierarchy — hero chooser → starter paths → decision helper wizard → comparison table → heatmap → performance/cost chart → gap estimator — mirrors the real decision process an OR practitioner goes through when selecting a solver. The accessibility infrastructure (skip link, aria-live regions, keyboard shortcuts, high-contrast mode, reduced-motion toggle, font scaling) is well above average for any web application.

However, the audit uncovered **one critical runtime bug**, **two functional failures**, and several moderate design issues that undermine the experience.

---

## Critical Bugs (Severity: Red)

### 1. Solver Detail Pages Are Completely Broken

**Finding:** Navigating to any solver detail page (e.g., `#solvers/gurobi`) produces a blank white page. The `solver-detail.js` module throws a `NotFoundError` on every load.

**Console Error (captured live):**
```
NotFoundError: Failed to execute 'insertBefore' on 'Node':
The node before which the new node is to be inserted is not a child of this node.
    at Module.render (solver-detail.js:226:16)
    at toolkit.js:90:11
```

**Root Cause (confirmed via deployed source):** In `solver-detail.js` line 226, the code calls:
```js
useSection.insertBefore(editorialP, useGrid);
```
But `useGrid` has not yet been appended to `useSection` — it's still a detached node. `insertBefore` requires the reference node to be a child of the parent.

**Fix:** Either append `useGrid` to `useSection` before the `insertBefore` call, or use `useSection.appendChild(editorialP)` followed by `useSection.appendChild(useGrid)` in the correct order.

**Impact:** Every solver in the comparison table links to its detail page. All 17 detail pages are non-functional. This breaks the primary navigation flow of the tool.

### 2. Problem-Type Card Links Are Dead

**Finding:** The six hero cards ("Linear / MIP", "Nonlinear", "Constraint Programming", etc.) link to hash routes like `#solvers?problem_type=mip`. Clicking them navigates but produces **zero filtering** — all 17 solver rows remain visible, none are dimmed or highlighted.

**Verified programmatically:** After navigating to `#solvers?problem_type=mip`, the DOM shows 0 `.solver-row--dimmed` and 0 `.solver-row--highlighted` elements.

**Impact:** The hero section promises "instant solver recommendation" but delivers nothing. This is the first interactive element a user encounters.

### 3. Stats Banner Counters Stuck at "—"

**Finding:** The stats banner shows `— solvers tracked`, `— modeling tools`, `— benchmark suites`. Only "last updated" (showing "9h ago") works. The animated counter function either never fires or fires before data is loaded.

**Impact:** The banner is the first content below the nav and sets expectations for data richness. Showing "—" signals the tool is broken.

---

## Moderate Issues (Severity: Yellow)

### 4. `--color-border` and `--color-muted` Are Undefined CSS Custom Properties

**Finding:** The solver table CSS references `var(--color-border)` and `var(--color-muted)`, but neither is defined in the `:root` design tokens. Confirmed empty via `getComputedStyle`:
```
--color-border: ""  (empty)
--color-muted: ""   (empty)
```

The actual token names are `--border-subtle` / `--border-card` and `--color-text-muted` / `--color-text-faint`.

**Impact:** Properties using these undefined tokens fall back to browser defaults. For `border-bottom: 1px solid var(--color-border)` on table cells, this means the border color defaults to `currentColor` (the text color), which is `#CCD6F6` — far too bright for a subtle separator. The vendor text color falling back to `rgb(204, 214, 246)` makes vendor names the same color as solver names, defeating the hierarchy.

### 5. `--color-text-faint` (#4A5568) Fails WCAG AA Contrast

**Finding:** Computed contrast ratio of `--color-text-faint` (#4A5568) against `--color-bg` (#0A192F) is **2.34:1**. WCAG AA requires 4.5:1 for normal text and 3:1 for large text.

This color is used for: date labels in the solver table, "last updated" text, and various secondary information.

**Contrast Ratios (all computed against #0A192F):**

| Token | Color | Ratio | WCAG AA |
|-------|-------|-------|---------|
| `--color-text` | #CCD6F6 | 12.17:1 | Pass |
| `--color-accent` | #C5A059 | 7.16:1 | Pass |
| `--color-text-muted` | #8892B0 | 5.69:1 | Pass |
| `--color-text-faint` | #4A5568 | **2.34:1** | **Fail** |

**Fix:** Lighten `--color-text-faint` to at least `#718096` (approximately 4.5:1) or `#6B7B92` for a closer match to the existing palette.

### 6. Table Typography Below Comfortable Reading Size

**Measured values (computed):**

| Element | Font Size | Notes |
|---------|-----------|-------|
| Table body | 12.8px (0.8rem) | Borderline readable |
| Table headers | **10.4px** (0.65rem) | Below 12px minimum |
| Vendor names | **10.4px** (0.65rem) | Below 12px minimum |
| Link labels (Web, GitHub) | **10.4px** (0.65rem) | Below 12px minimum |

At 10.4px, table headers and vendor names are at the lower limit of readability, especially on high-DPI displays where physical pixels are smaller. The project's own font-scaling buttons (A / A+ / A++) help, but the default state should be comfortable.

### 7. Comparison Checkboxes Are 14×14px — Below Touch Target Minimums

**Finding:** The `solver-compare-cb` checkboxes measure 14×14px (computed). WCAG 2.5.8 recommends a minimum 24×24 CSS pixel target. The containing `td` is 32px wide, but only the checkbox itself is clickable.

No visual affordance or instructional text tells users these checkboxes exist or what they do.

---

## Minor Issues (Severity: Green)

### 8. Hero Section Uses `innerHTML` (Inconsistency)

The `buildSolvers` function in `toolkit.js` (line 663) uses `hero.innerHTML = ...` to inject the problem cards grid. Every other section in the file uses safe `document.createElement` / `textContent` DOM construction. While the content is author-controlled and not a security risk, this inconsistency breaks the pattern documented in the file's own header comment ("Security: All data rendered comes from local static JSON files... not from user input or external sources").

### 9. Page Is 8.6 Viewports Long

**Measured:** `scrollHeight: 5540px` vs `viewportHeight: 644px` = 8.6x scroll. The page contains 18 headings and 3 full tables. Users who want the comparison table must scroll past the hero, starter paths, and decision helper wizard.

Consider adding a "Jump to comparison table" anchor link, or collapsing the decision helper into an expandable section.

### 10. No Loading Skeleton for Async Detail Pages

The solver detail page uses `import('../views/solver-detail.js').then(...)` — a dynamic import that leaves the content area completely empty (`toolkit-view__content` is blank) until the module loads. On slow connections, the user sees a blank screen with no feedback. (Currently moot since the detail pages crash, but will matter once the bug is fixed.)

### 11. Mobile Responsive Rules Exist but Need Verification

The CSS includes 32 mobile-specific rules across `@media (max-width: 768px)`, `(max-width: 600px)`, and `(max-width: 480px)` breakpoints. These cover nav hamburger toggle, table column hiding (Activity and Links columns hidden), and font-size reductions. The rules are structurally sound, but I was unable to fully verify visual rendering at mobile widths during this audit due to browser viewport constraints.

Key mobile CSS behaviors identified from source:
- Nav tabs collapse to hamburger menu at 768px
- Solver table hides Activity + Links columns at 768px
- Hero h1 does not have a mobile font-size override (remains 2.2rem / 35.2px, which may be too large at 375px)
- Problem cards grid uses `minmax(160px, 1fr)` which should reflow to 2 columns on mobile

---

## What Works Exceptionally Well

**Information Architecture:** The progression from problem-type selection → opinionated recommendations → parametric wizard → full comparison table → visual charts is exactly how an OR researcher thinks about this problem. The "Not sure where to start?" starter paths with personas ("I'm a Python beginner", "PhD student, doing MIP research") are particularly effective at reducing decision paralysis.

**Data Integrity Infrastructure:** Every solver detail page (once the bug is fixed) includes sourced data points, editorial disclaimers, "Licensing Gotcha" callouts, "When to Use / Not to Use" guidance, and data freshness timestamps. The "Report data correction" links to GitHub Issues show academic-grade commitment to accuracy.

**Accessibility:** Skip-to-content link, aria-live status region, complete keyboard navigation (J/K for items, 1-5 for tabs, ⌘K for search, ? for help), high-contrast mode, reduced-motion toggle, and three font-size presets. The problem-type heatmap uses aria-labels like "Gurobi Optimizer: supports LP" and "Gurobi Optimizer: no SDP" — properly descriptive for screen readers.

**Design System Coherence:** The midnight blue (#0A192F) + gold (#C5A059) palette with Cormorant Garamond titles and Inter body text creates a distinctive, professional identity that matches the MathematicalModeling sub-site.

**Feature Density Without Framework Bloat:** 17 solvers, 3 interactive tables, a scatter-plot chart, a parametric recommendation wizard, comparison checkboxes, release timeline, keyboard shortcuts — all in vanilla JS with no build tools. The total DOM is only 1,263 elements, which is remarkably lean.

---

## Priority Recommendations

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P0** | Fix `solver-detail.js` insertBefore crash (line 226) | 5 min | Unblocks all 17 detail pages |
| **P0** | Wire up hero card `?problem_type=` filtering | 1-2 hr | Makes hero section functional |
| **P1** | Fix stats banner counter initialization | 30 min | Fixes first-impression data display |
| **P1** | Replace `--color-border` / `--color-muted` with actual tokens | 15 min | Fixes table border/text rendering |
| **P1** | Lighten `--color-text-faint` to meet WCAG AA (≥4.5:1) | 5 min | Accessibility compliance |
| **P2** | Increase table font sizes to use design tokens | 15 min | Readability improvement |
| **P2** | Add comparison checkbox hint / larger touch target | 30 min | Discoverability + mobile UX |
| **P3** | Add loading skeleton for detail page async load | 30 min | Perceived performance |
| **P3** | Add "Jump to table" anchor in hero section | 10 min | Navigation shortcut for power users |

---

*Audit performed on the live deployed site at mghnasiri.github.io/PORID/ and cross-referenced against the source repository at github.com/mghnasiri/PORID (commit as of 2026-03-28).*
