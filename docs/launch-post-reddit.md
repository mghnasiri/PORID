# I built an auto-updating guide to choosing OR solvers, modeling tools, and benchmarks

**Link:** https://mghnasiri.github.io/PORID/

I'm an OR researcher and I got frustrated with the same problem many of us face: the tooling landscape is fragmented, licensing gotchas are buried in vendor pages, and there's no single place that answers "which solver should I use for my problem?"

So I built PORID — a free, open-source, auto-updating navigator for the OR software ecosystem.

**What it does:**
- Compares 17 solvers (Gurobi, CPLEX, HiGHS, SCIP, COPT, OR-Tools, etc.) with version tracking from GitHub/PyPI
- Decision helper: answer a few questions, get a recommended solver stack
- Compatibility matrix: which modeling tools (Pyomo, PuLP, JuMP, CVXPY) work with which solvers
- Licensing guide with academic license instructions and gotcha warnings
- Performance comparison based on Mittelmann benchmarks (with proper sourcing)
- Starter paths for common situations: "I'm a Python beginner", "I need everything free", "PhD doing MIP research"

**What it is NOT:**
- Not a paper aggregator or job board
- Not affiliated with any solver vendor
- All editorial content is labeled as such; data is sourced to official docs

The data auto-updates daily via GitHub Actions. Built on vanilla JS, hosted on GitHub Pages, fully open source.

Would love feedback — especially on data accuracy.
