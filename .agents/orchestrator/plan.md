# Execution Plan — Next.js LinkedIn Search Waterfall Pipeline Research and Design

This plan outlines the steps for executing the research and design of the waterfall search pipeline.

## Steps
1. **Analyze Current Implementation & Codebase Constraints**
   - Read `src/lib/pipeline/search.ts` and related files to identify existing bugs and design patterns.
   - Specifically look for the known bugs (double LLM call, HR query over-filtering, substring exclusion, dead code imports, hardcoded test companies).
   - Document search inputs, current search query building logic, and results ranking.

2. **Conduct API Deep Research (Serper, Tavily, Exa)**
   - Query structure and search format for finding LinkedIn profiles of employees at a given company.
   - Rate limit behavior, HTTP codes (e.g. 429), retry headers, mid-search exhaustion.
   - Freshness & update frequency (Google vs Tavily vs Exa indexes).
   - Typical latency and performance differences.
   - Handling of misspelled names, common company names, and small companies (<10 employees).

3. **Risk & Limitation Assessment**
   - Terms of Service risks (especially regarding scraping or scraping-like behavior for LinkedIn).
   - Free tier sustainability and quota policies.
   - Stability of API endpoints and historical breaking changes.
   - Failure modes and failover mechanisms in code.

4. **Design Waterfall Search Pipeline**
   - Determine ordering (Primary, Secondary, Tertiary) based on cost, limits, accuracy, and freshness.
   - Establish threshold for "insufficient results" (currently 5).
   - Define deduplication strategy (handling identical profiles).
   - Define scoring/ranking integration.
   - Detail error/exception and missing key handling.
   - Write clean, detailed pseudocode for a developer to follow directly.

5. **Design Benchmark Test Plan**
   - Define expected behavior for: Surepass, Fixerra, Razorpay.
   - Establish metrics for verifying currency of employment.
   - Establish metrics for verifying correct company.

6. **Cost Projections**
   - Calculate monthly consumption under typical usage (20 jobs/month, 1-3 searches each).
   - Project free-tier lifetime.
   - Recommend strategies to stay within free tier.

7. **Synthesize Final Report**
   - Create a production-grade markdown report artifact incorporating all sections.
