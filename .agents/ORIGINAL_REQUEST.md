# Original User Request

## Initial Request — 2026-06-25T05:46:47Z

Deep research into Serper.dev, Tavily AI, and Exa.ai search APIs to design an optimal "waterfall" search pipeline for a Next.js job-tracking application. The pipeline must find current LinkedIn employees at target companies with high accuracy, eliminating ex-employees and wrong-company false positives. This is a production-grade research effort — the output will directly inform the final implementation.

Working directory: c:/Users/Lenovo/Downloads/Job tacker-20260510T160312Z-3-001/Job tacker/web
Integrity mode: development

### Context
The existing codebase at the working directory is a Next.js app with a search pipeline in `src/lib/pipeline/search.ts` that currently uses only Serper.dev (Google) to find LinkedIn profiles. It consistently fails for small companies (<100 employees) because Google doesn't index most LinkedIn profiles. We want to add Tavily and Exa.ai as fallback search sources in a "waterfall" pattern.

The current pipeline has these known bugs that must be accounted for in the plan:
- Double LLM call (calls `buildSearchStrategyWithLLM()` twice per request)
- HR query over-filters by including department name
- Substring exclusion bug ("Ed" filters out "Edward")
- Dead code imports in `rank.ts`
- Hardcoded test company names in LLM prompts

Free tier limits (as of June 2026):
- Serper.dev: 2,500 requests/month
- Tavily AI: 1,000 requests/month
- Exa.ai: 1,000 requests/month

## Requirements

### R1. API Behavior Deep Research
For each of the three APIs (Serper, Tavily, Exa.ai), research and document:
- The exact API request/response format for LinkedIn-targeted people searches
- Rate limiting behavior: what HTTP status codes and headers are returned when limits are hit? Is there a retry-after header? What happens mid-search if you've exhausted your quota?
- Data freshness: how up-to-date are search results? Do they reflect recent LinkedIn profile changes (e.g., someone who left a company last week)?
- Response time: typical latency for LinkedIn-targeted queries
- Edge cases: how does each API handle misspelled company names, companies with common names (e.g., "Apple" vs "Apple Corp India"), very small companies (<10 employees)?

### R2. Risk & Limitation Analysis
Identify and document all risks of depending on each API:
- Terms of Service risks (can they ban you for LinkedIn-targeted searches?)
- Free tier sustainability (any history of reducing free tiers?)
- API stability (breaking changes, deprecation notices)
- LinkedIn-specific limitations (do any of them explicitly block or throttle `linkedin.com` domain filtering?)
- Failure modes: what happens when one API is down? How should the waterfall handle partial failures?

### R3. Optimal Waterfall Design
Based on the research findings, recommend the most efficient waterfall ordering and trigger thresholds:
- Which API should be primary, secondary, tertiary and why?
- What should the "insufficient results" threshold be (currently proposed at 5)?
- How should results from different engines be merged, deduplicated, and scored fairly?
- Should any API calls run in parallel rather than sequentially for speed?
- How to minimize total API consumption (e.g., if Serper returns 8 great results, never call Tavily/Exa)

### R4. Detailed Test Plan
Design a comprehensive test plan using three benchmark companies:
- **Surepass** (small startup, ~93 employees — previously returned 0-1 results, known to have ~5 Product team members)
- **Fixerra** (small startup — known good baseline, should find 4-5 people)
- **Razorpay** (large company — regression test to ensure we don't break existing behavior)

For each benchmark, define:
- Expected minimum number of relevant LinkedIn profiles
- How to verify the results are *current* employees (not ex-employees)
- How to verify results are from the correct company (not a different company with a similar name)

### R5. Cost Projection
Based on typical usage patterns (assume 20 job applications per month, each triggering 1-3 search cycles), project:
- Monthly API consumption across all three providers
- How many months of free tier usage this affords
- Recommendations for staying well within free tier limits

## Acceptance Criteria

### API Research Completeness
- [ ] Each of the 3 APIs has a documented request/response example for a LinkedIn people search query
- [ ] Rate limiting behavior is documented with specific HTTP codes and recovery strategies
- [ ] At least 3 edge cases per API are identified and documented

### Risk Assessment Quality
- [ ] Each API has at least 2 documented risks with mitigation strategies
- [ ] LinkedIn-specific limitations are explicitly investigated (not assumed)
- [ ] A failure mode matrix exists showing what happens when each API fails

### Waterfall Design
- [ ] The recommended waterfall ordering is justified with evidence from the research
- [ ] Deduplication strategy handles the same LinkedIn profile appearing in results from multiple engines
- [ ] The design accounts for API-key-missing scenarios (graceful degradation)

### Test Plan
- [ ] Test cases exist for all 3 benchmark companies (Surepass, Fixerra, Razorpay)
- [ ] Each test case has specific, numeric acceptance thresholds (e.g., "≥4 current Product team members for Surepass")
- [ ] The test plan includes a method to verify current employment status

### Cost Projection
- [ ] Monthly consumption estimate is broken down by API provider
- [ ] A "danger zone" threshold is defined (e.g., "if you exceed 15 applications/month, Tavily will run out")

Deliver a final research report as a markdown artifact. The artifact should be structured as a production-grade implementation plan that a developer can follow directly to implement the waterfall. Include all research findings, risk mitigations, the recommended waterfall architecture with code-level pseudocode, the full test plan with numeric thresholds, and the cost projection.
