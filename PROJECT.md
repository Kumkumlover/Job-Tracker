# Project: Next.js LinkedIn Search Waterfall Pipeline Research and Design

## Architecture
The search pipeline is located in `src/lib/pipeline/search.ts` and interacts with other modules in `src/lib/pipeline/`.
The goal is to research Serper.dev, Tavily AI, and Exa.ai, perform risk assessments, design a waterfall search pipeline to find current LinkedIn employees with high accuracy, outline a test plan, and project costs.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | codebase_analysis | Analyze current `src/lib/pipeline/search.ts` bugs and design constraints | None | DONE |
| 2 | api_deep_research | Research request/response, rate limit, freshness, and edge cases for Serper, Tavily, Exa | M1 | DONE |
| 3 | risk_limitation_analysis | Analyze ToS, sustainability, API stability, LinkedIn block risks | M2 | DONE |
| 4 | waterfall_design | Design optimal waterfall flow, deduplication, scoring, pseudocode | M3 | DONE |
| 5 | benchmark_test_plan | Define benchmarks for Surepass, Fixerra, and Razorpay | M4 | DONE |
| 6 | cost_projections | Project costs, free tier duration, and usage strategy | M5 | DONE |
| 7 | synthesis_report | Synthesize final research and implementation plan artifact | M6 | DONE |

## Code Layout
- `src/lib/pipeline/search.ts` - Main search pipeline
- `src/lib/pipeline/rank.ts` - Profiles ranking/scoring
- `src/lib/pipeline/dept-utils.ts` - Department extraction and query filtering
- `src/lib/pipeline/validate.ts` - Validation logic
