# Handoff Report — Waterfall Search Pipeline Research & Design

## 1. Observation
- Target research report was successfully compiled and written to `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\WATERFALL_RESEARCH.md`.
- Codebase inspection successfully located all five requested bugs:
  1. **Double LLM Call** in `search.ts` (lines 467 & 289).
  2. **HR Query Over-filtering** in `search.ts` (lines 123 & 164).
  3. **Substring Exclusion Bug** in `search.ts` (lines 546-550).
  4. **Dead Imports in rank.ts** (line 9).
  5. **Hardcoded Test Names in rank.ts** (lines 33 & 39).
- Detailed mocks and behaviors for Serper.dev, Tavily AI, and Exa.ai are fully documented.

## 2. Logic Chain
- **Waterfall Pipeline Ordering:** Primary: Serper (Google) -> Secondary: Tavily -> Tertiary: Exa.ai. This maps directly to maximizing free tier longevity and speed while ensuring accuracy.
- **Calling Strategy:** Sequential first (check Serper), and only if result size < 5, execute Tavily and Exa in parallel to optimize latency.
- **Scoring & Deduplication:** Standardize URL normalization (`linkedin.com/in/john-doe`) to eliminate duplicates. Filter out ex-employees and name collisions with exact name boundaries and preposition qualifiers (e.g., `at Company`, `@ Company`).
- **Refactoring:** Fully refactored, type-safe TypeScript code blocks for `search.ts` and `rank.ts` are provided in the report to resolve all five codebase bugs cleanly.

## 3. Caveats
- No dynamic integration tests or network calls were executed due to the `CODE_ONLY` network restriction. The behavior of Tavily, Serper, and Exa.ai rate limits has been researched and mapped via documentation.
- The pipeline assumes target API keys are injected via environment variables: `SERPER_API_KEY`, `TAVILY_API_KEY`, and `EXA_API_KEY`.

## 4. Conclusion
The comprehensive research, risk analysis, design pseudocode, test cases, and cost calculations are complete and delivered. The `WATERFALL_RESEARCH.md` artifact is ready for direct developer implementation.

## 5. Verification Method
- **File Verification:** Open `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\WATERFALL_RESEARCH.md` and verify it contains all five core sections (API Behavior, Risks, Design & Pseudocode, Test Plan, Costs) with the detailed JSON mocks and TypeScript refactored blocks.
