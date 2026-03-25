# PORID Architecture

**Personal Operations Research Intelligence Dashboard**

This document describes the system architecture, data flow, and key design
decisions behind PORID.

---

## High-level overview

PORID is a two-part system:

1. **Python data pipeline** -- runs daily via GitHub Actions, fetches papers /
   software / conferences / opportunities from multiple academic APIs, and
   writes static JSON files.
2. **Static SPA frontend** -- a vanilla-JS single-page application served from
   GitHub Pages that reads those JSON files and renders an interactive
   dashboard.

There is no backend server at runtime. The pipeline produces static data; the
frontend consumes it.

---

## Pipeline flow

```
 Sources                  Pipeline stages                   Outputs
 -------                  ---------------                   -------

 arXiv        \                                          data/publications.json
 Crossref      \     +---------+    +----------+         data/software.json
 OpenAlex       +--> | Fetch   |--> | Classify |--+      data/conferences.json
 Semantic       |    | (parallel)   | (tag by  |  |      data/opportunities.json
  Scholar      /     +---------+    | keywords)|  |      data/metadata.json
 Optim.Online /                     +----------+  |      data/changelog.json
                                                  |
 GitHub  ------>  fetch_software  ----------------+
 WikiCFP ----->  fetch_conferences  --------------+
 RSS feeds --->  fetch_opportunities  ------------+
                                                  |
                                    +----------+  |   +-------+   +-------+
                                    | Validate |<-+-->| Dedup |-->| Merge |
                                    +----------+      +-------+   +-------+
                                                                      |
                                                         +------------+
                                                         |
                                                         v
                                                  +-----------+
                                                  | Write JSON|
                                                  +-----------+
                                                         |
                                            +------------+----------+
                                            |            |          |
                                            v            v          v
                                       trends.py   build_brief  build_digest
                                       (compute    (weekly      (daily email
                                        sparklines) summary)     + HTML)
                                            |            |          |
                                            v            v          v
                                       trends.json  brief-*.json  digest-*.html
                                                                      |
                                                                      v
                                                               send_email.py
```

### Pipeline stages in detail

| Stage | Script | Purpose |
|-------|--------|---------|
| Fetch | `fetch_arxiv.py`, `fetch_crossref.py`, `fetch_openalex.py`, `fetch_semantic_scholar.py`, `fetch_optim_online.py`, `fetch_software.py`, `fetch_conferences.py`, `fetch_opportunities.py`, `fetch_cordis.py`, `fetch_nsf.py`, `fetch_pubmed.py`, `fetch_solvers.py` | Query external APIs/RSS feeds and normalize results into a common item schema (`{id, title, authors, date, source, type, ...}`). Run in parallel via `ThreadPoolExecutor`. |
| Classify | `classify.py` | Scan title + abstract against keyword lists from `config.yaml`. Assigns tags (e.g., `linear-programming`, `combinatorial-optimization`). Computes a relevance score (0-100). Defaults to `general-or`. |
| Validate | `validate.py` | Drop items with missing required fields or malformed data. |
| Deduplicate | `deduplicate.py` | Two-pass: (1) exact DOI match, (2) normalized title Jaccard similarity > 0.85. Keeps first-seen item. |
| Merge | `run_pipeline.py` | Merge new items with existing `data/*.json` (incremental). Drop items older than 90 days; archive stale items to `data/archive/YYYY-MM.json`. |
| Post-process | `compute_trends.py`, `build_brief.py`, `build_digest.py`, `build_rss.py`, `build_ical.py` | Generate derivative outputs: trend sparklines, weekly brief, daily email digest, RSS feed, iCal feed. |

### Scheduling

The pipeline runs daily at 07:00 UTC via `.github/workflows/fetch-data.yml`.
A separate workflow (`.github/workflows/weekly-backup.yml`) creates compressed
snapshots of `data/*.json` every Sunday on the `data-backups` branch.

---

## Frontend architecture

### Technology

- **Vanilla JavaScript** -- no framework, no build step, no bundler.
- **ES modules** -- native `import`/`export` with `<script type="module">`.
- **Hash-based routing** -- URL fragments (`#publications`, `#software`, etc.)
  drive which module renders into the main content area.
- **CSS custom properties** -- theming via `data-theme="dark|light"` on `<html>`.

### Module structure

```
src/
  index.html              Entry point (SPA shell)
  js/
    app.js                Main orchestrator: data loading, routing, global UI
    modules/
      publications.js     Papers list + filters + citation export
      software.js         GitHub releases
      conferences.js      Conference deadlines + CFP tracking
      opportunities.js    Job/grant listings
      trends.js           Sparkline trend charts
      digest.js           Daily digest viewer
      pulse.js            Hub: activity pulse overview
      radar.js            Hub: radar/discovery view
      toolkit.js          Hub: tools & utilities
      watchlist.js        Bookmarked items
      search.js           Global full-text search
      funding.js          Funding opportunities
      awards.js           Awards & honors
      seminars.js         Seminar announcements
      datasets.js         Dataset listings
      resources.js        Learning resources
      changelog.js        Pipeline changelog viewer
      opportunity-alerts.js  Alert matching
    components/
      card.js             Reusable item card renderer
      filters.js          Filter bar + saved view presets
      modal.js            Modal dialog utility
      radar-chart.js      Canvas-based radar chart
      empty-state.js      Empty-state placeholder
    utils/
      storage.js          localStorage wrapper (watchlist, notes, read status)
      citation.js         BibTeX / RIS / CSV export helpers
      date.js             Date formatting
      preferences.js      User preference persistence
```

### Data loading

On startup, `app.js` fetches all JSON files from `data/` via `fetch()`. Data is
held in an in-memory `state` object. Each module's `render(data, container)`
function receives the relevant slice of state and renders HTML into the content
area.

---

## Data flow diagram

```
+------------------+       +-------------------+       +------------------+
|  External APIs   |       |  GitHub Actions    |       |  GitHub Pages    |
|  (arXiv, S2,     | ----> |  (daily cron)      | ----> |  (static host)   |
|   Crossref, ...) |       |  run_pipeline.py   |       |  src/index.html  |
+------------------+       +-------------------+       +------------------+
                                    |                          |
                                    | writes                   | fetch()
                                    v                          v
                            +---------------+          +---------------+
                            | data/*.json   | -------> | Browser SPA   |
                            | (committed to |  served  | (renders UI   |
                            |  main branch) |  as      |  from JSON)   |
                            +---------------+  static  +---------------+
                                    |          files
                                    v
                            +---------------+
                            | Email digest  |
                            | (SMTP via     |
                            |  Gmail)       |
                            +---------------+
```

---

## Key design decisions

### 1. Static-first, no backend

All data is pre-computed JSON committed to the repo. The frontend is pure static
files. This means zero hosting cost (GitHub Pages), zero auth complexity, and
the entire history of data is in git.

### 2. Incremental merge, not full replace

Each pipeline run merges new items with existing data rather than replacing it.
This means a single failed source does not wipe previously collected data. Items
older than 90 days are archived to `data/archive/`.

### 3. Parallel fetching

Fetchers are I/O-bound (HTTP requests). They run concurrently via Python's
`ThreadPoolExecutor` in `run_pipeline.py` for faster pipeline execution.

### 4. Two-pass deduplication

DOI-based exact matching catches most duplicates across sources (e.g., the same
paper appearing in both Crossref and OpenAlex). Title-similarity Jaccard
matching (threshold 0.85) catches near-duplicates with slightly different
metadata.

### 5. Keyword-based classification over ML

Tags are assigned by scanning title + abstract against keyword lists in
`config.yaml`. This is transparent, debuggable, and requires no model training.
A relevance score (0-100) combines tag count, recency, and metadata
completeness.

### 6. No build step for the frontend

The SPA uses native ES modules and no bundler. This keeps the developer
experience simple: edit a `.js` file, refresh the browser. No webpack, no npm,
no transpilation.

### 7. Email digest as a push channel

While the dashboard is pull-based (you visit the site), the daily email digest
provides a push notification of new items. Both are generated from the same
underlying data.

---

## Configuration

All pipeline behavior is driven by `pipeline/config.yaml`:

- **arXiv categories** and search queries
- **Crossref journals** (ISSNs)
- **OpenAlex concepts**
- **Semantic Scholar** search queries
- **GitHub repos** to track
- **Conference** definitions (name, dates, CFP deadlines)
- **Tag keyword** mappings for classification
- **Email** recipient and preferences

---

## Repository layout

```
PORID/
  .github/
    workflows/
      fetch-data.yml        Daily pipeline + deploy
      weekly-backup.yml     Weekly data snapshots
    ISSUE_TEMPLATE/         Bug report + feature request forms
    pull_request_template.md
  pipeline/
    run_pipeline.py         Orchestrator (parallel fetch + merge)
    fetch_*.py              Individual source fetchers
    classify.py             Tag assignment
    deduplicate.py          DOI + title-similarity dedup
    validate.py             Data quality checks
    compute_trends.py       Sparkline trend data
    build_brief.py          Weekly brief generator
    build_digest.py         Daily email digest builder
    build_rss.py            RSS feed generator
    build_ical.py           iCal feed generator
    send_email.py           SMTP email sender
    config.yaml             All pipeline configuration
    requirements.txt        Python dependencies
    templates/              Jinja2 email templates
  src/
    index.html              SPA entry point
    js/                     Frontend modules (see above)
    css/                    Stylesheets
    data/                   Copy of data/*.json for Pages deployment
  data/
    publications.json       Fetched papers
    software.json           GitHub releases
    conferences.json        Conference data
    opportunities.json      Jobs/grants
    metadata.json           Pipeline run metadata
    changelog.json          Incremental change log
    trends.json             Trend sparkline data
    archive/                Monthly archives of stale items
```
