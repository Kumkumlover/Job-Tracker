# Handoff Report — Search Pipeline Analysis

## 1. Observation
Below are the direct observations of the bugs located within the codebase under `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\`.

### Bug 1: Double LLM Call
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\search.ts`
* **Locations:** 
  - Line 467 (inside `searchCandidatesAuto` function):
    ```typescript
    const { deptKeywords } = await buildSearchStrategyWithLLM(company, jobTitle, jd ?? "", combinedExcludes);
    ```
  - Line 289 (inside `searchCandidates` function):
    ```typescript
    const { deptQuery, hrQuery, deptKeywords } = await buildSearchStrategyWithLLM(company, jobTitle, jd, excludeNames);
    ```
  - Line 500 (inside `searchCandidatesAuto` function) where `searchCandidates` is invoked:
    ```typescript
    searchPromises.push(
      searchCandidates(company, jobTitle, combinedExcludes, jd).catch(err => {
        console.error("[search] Serper engine failed:", err);
        return [] as SearchResult[];
      })
    );
    ```

### Bug 2: HR Query Over-Filters by Including Department Name
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\search.ts`
* **Locations:**
  - Line 123 (inside `buildSearchStrategyWithLLM`):
    ```typescript
    const hrQuery = `site:linkedin.com/in "${company}" (${hrUnique.join(" OR ")}) "${strategy.department}"${exclusions ? ` ${exclusions}` : ""}`;
    ```
  - Line 164 (inside `buildQueriesFallback`):
    ```typescript
    const hrQuery = `site:linkedin.com/in "${company}" (Recruiter OR "Talent Acquisition" OR "HR Business Partner" OR "People Partner") "${deptKeywords}"${exclusions ? ` ${exclusions}` : ""}`;
    ```

### Bug 3: Substring Exclusion Bug
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\search.ts`
* **Location:** Lines 546-550 (inside `searchCandidatesAuto`):
    ```typescript
      for (const excluded of excludeSet) {
        if (name === excluded || name.includes(excluded)) {
          return false; // Filter out
        }
      }
    ```

### Bug 4: Dead Code Imports in rank.ts
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\rank.ts`
* **Location:** Line 9:
    ```typescript
    import { extractDeptKeywords, deptRelevanceScore, detectWrongDept } from "./dept-utils";
    ```

### Bug 5: Hardcoded Test Company Names in LLM Prompts
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\rank.ts`
* **Locations:**
  - Line 33:
    ```typescript
    Your goal is to find people who CURRENTLY work at ${company} (or its direct variants like Fixed Invest).
    ```
  - Line 39:
    ```typescript
    4. If a snippet says "DevOps Engineer. Fixerra.", that means they work there. If it says "At Fixerra, I designed...", evaluate if it sounds like a current or past role.
    ```


## 2. Logic Chain

### Bug 1: Double LLM Call
1. In `searchCandidatesAuto`, the function `buildSearchStrategyWithLLM` is called to fetch `deptKeywords` (line 467).
2. Within the same control flow of `searchCandidatesAuto`, `searchCandidates` is invoked asynchronously as a promise (line 500).
3. The first operation in `searchCandidates` is another call to `buildSearchStrategyWithLLM` (line 289) using the same input parameters (`company`, `jobTitle`, `jd`, `excludeNames` / `combinedExcludes`).
4. **Conclusion:** Under ordinary execution, a single request to `searchCandidatesAuto` triggers the LLM twice to analyze the identical job description, which incurs duplicate latency and API costs.

### Bug 2: HR Query Over-Filters by Including Department Name
1. The queries generated for finding recruiters target LinkedIn profiles belonging to the target company.
2. In both the LLM strategy path (`buildSearchStrategyWithLLM`, line 123) and heuristic path (`buildQueriesFallback`, line 164), the search query includes `"${strategy.department}"` or `"${deptKeywords}"` in double quotes as a mandatory boolean filter.
3. HR, Talent Acquisition, and recruitment profiles are often generalized or do not explicitly state the specific team they support (e.g. they might just have "Technical Recruiter" or "Talent Acquisition Manager" in their profile, without mentioning "Engineering" or "Product Management" anywhere in their public snippet).
4. **Conclusion:** By forcing Google Search to strictly match the department name, the search query over-filters the recruitment pool and fails to return valid HR/Recruiting personnel.

### Bug 3: Substring Exclusion Bug
1. `searchCandidatesAuto` filters out candidates whose names match names in the `combinedExcludes` array.
2. The comparison is done via `name.includes(excluded)` (line 547), which is a substring check.
3. If an exclusion name is short (e.g., `"Ed"`), any candidate name containing that sequence (e.g., `"Edward"`, `"Edwin"`, `"Jared"`) will match the condition and be filtered out.
4. **Conclusion:** Substring comparison results in false-positive exclusions, preventing valid candidates from appearing in search results if they share substrings with excluded individuals.

### Bug 4: Dead Code Imports in rank.ts
1. `rank.ts` imports `extractDeptKeywords`, `deptRelevanceScore`, and `detectWrongDept` from `./dept-utils` at line 9.
2. A textual search of `rank.ts` reveals no references to these three imported symbols anywhere in the file.
3. **Conclusion:** The imports are redundant and represent dead code.

### Bug 5: Hardcoded Test Company Names in LLM Prompts
1. The system instruction prompt in `rankCandidates` tells the LLM how to identify valid employees.
2. The prompt includes instructions mentioning specific names: `"Fixed Invest"` (line 33) and `"Fixerra"` (line 39) as examples of current employment indicators.
3. When the system is run for other real companies, the LLM prompt still contains these specific test company names, which can lead to confusion and poor classification performance for non-test companies.
4. **Conclusion:** These test names should be removed or generalized (e.g. using variable placeholders or general descriptions).


## 3. Caveats
- No dynamic integration tests or unit tests are present in the web workspace (as verified by scanning directories and checking `package.json`). Therefore, verification is constrained to static code analysis and linting.
- The behavior of the Serper and LLM APIs was analyzed based on the code structure and prompts; live API calls were not executed since this is a read-only investigation.


## 4. Conclusion
The pipeline code has multiple inefficiencies, scope bugs, and code hygiene issues. Correcting these involves:
1. Passing down the resolved query parameters or `deptKeywords` from `searchCandidatesAuto` into `searchCandidates` (or refactoring them to share the strategy state) to avoid the double LLM call.
2. Removing the strict department quote constraint (`"${strategy.department}"` / `"${deptKeywords}"`) from the HR query, or making it optional.
3. Using strict whole-name comparisons (e.g., checking word boundaries or strict equivalence) instead of `name.includes(excluded)` in the exclusions filter.
4. Deleting the unused import line in `rank.ts`.
5. Replacing `"Fixed Invest"` and `"Fixerra"` with generic references in the `rank.ts` prompt.


## 5. Verification Method
Since there are no tests defined in the `package.json` scripts (`dev`, `build`, `start`, `lint`, `postinstall`, `setup`, `dev:all`), verification can be done by:
1. **Visual Inspections:** Open the files `search.ts` and `rank.ts` at the specified line numbers to verify the presence of the bugs.
2. **Type Checking & Linting:** Run `npm run lint` or `npx tsc --noEmit` in the `web` folder to ensure that any potential fixes to imports or code do not break the TypeScript compilation.
