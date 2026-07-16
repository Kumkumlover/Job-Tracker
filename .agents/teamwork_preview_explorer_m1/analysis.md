# Search Pipeline Analysis Report

This report presents the analysis of the search pipeline under `web/src/lib/pipeline/`, focusing on the files `search.ts`, `rank.ts`, `dept-utils.ts`, and `validate.ts`. Five specific bugs/issues have been located, analyzed, and detailed below.

---

## 1. Double LLM Call
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\search.ts`
* **Line Numbers:** Line 467 (in `searchCandidatesAuto`) and Line 289 (in `searchCandidates`).
* **Code Snippets:**
  - **In `searchCandidatesAuto` (Line 467):**
    ```typescript
    const { deptKeywords } = await buildSearchStrategyWithLLM(company, jobTitle, jd ?? "", combinedExcludes);
    ```
  - **In `searchCandidates` (Line 289):**
    ```typescript
    const { deptQuery, hrQuery, deptKeywords } = await buildSearchStrategyWithLLM(company, jobTitle, jd, excludeNames);
    ```
* **Why it occurs:**
  `searchCandidatesAuto` serves as the primary search pipeline coordinator. It calls `buildSearchStrategyWithLLM` on line 467 to extract `deptKeywords` for later scoring and GitHub/OSINT keyword determination. However, in the concurrent search block starting at line 493, `searchCandidatesAuto` calls `searchCandidates(...)` on line 500:
  ```typescript
  searchPromises.push(
    searchCandidates(company, jobTitle, combinedExcludes, jd).catch(err => {
      console.error("[search] Serper engine failed:", err);
      return [] as SearchResult[];
    })
  );
  ```
  `searchCandidates` is an independent search entry point which, on its very first line (Line 289), calls `buildSearchStrategyWithLLM` again with the same parameters. This causes two sequential, identical LLM calls per request, wasting API tokens, increasing cost, and doubling the request latency.

---

## 2. HR Query Over-Filters by Including Department Name
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\search.ts`
* **Line Numbers:** Line 123 (in `buildSearchStrategyWithLLM`) and Line 164 (in `buildQueriesFallback`).
* **Code Snippets:**
  - **In `buildSearchStrategyWithLLM` (Line 123):**
    ```typescript
    const hrQuery = `site:linkedin.com/in "${company}" (${hrUnique.join(" OR ")}) "${strategy.department}"${exclusions ? ` ${exclusions}` : ""}`;
    ```
  - **In `buildQueriesFallback` (Line 164):**
    ```typescript
    const hrQuery = `site:linkedin.com/in "${company}" (Recruiter OR "Talent Acquisition" OR "HR Business Partner" OR "People Partner") "${deptKeywords}"${exclusions ? ` ${exclusions}` : ""}`;
    ```
* **Why it occurs:**
  When searching for HR/recruiter contacts at the target company, both the LLM strategy builder and the fallback heuristic append the department name/keywords (e.g., `"${strategy.department}"` or `"${deptKeywords}"`) in double quotes as a mandatory search constraint.
  HR professionals and recruiters are typically generalists, and their LinkedIn headlines or snippets usually list general titles like "Technical Recruiter", "HR Manager", or "Talent Acquisition Specialist" without naming a specific department (like "Product Management" or "Engineering"). Forcing the search query to strictly include the department name in quotes causes the search engine to exclude the vast majority of valid HR profiles, leading to zero or very few HR results.

---

## 3. Substring Exclusion Bug ("Ed" filters out "Edward")
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\search.ts`
* **Line Numbers:** Lines 546-550 (in `searchCandidatesAuto`).
* **Code Snippet:**
  ```typescript
  // Strictly filter out excludeNames locally to fix the cycling bug
  if (combinedExcludes.length > 0) {
    const excludeSet = new Set(combinedExcludes.map(n => n.trim().toLowerCase()));
    searchResults = searchResults.filter(r => {
      let name = (r.title || "").split("—")[0].split("-")[0].split("|")[0].trim().toLowerCase();
      
      // Also do a substring check just in case the title format is weird
      for (const excluded of excludeSet) {
        if (name === excluded || name.includes(excluded)) {
          return false; // Filter out
        }
      }
      return true; // Keep
    });
  }
  ```
* **Why it occurs:**
  Inside the local filtering block of `searchCandidatesAuto`, the code performs a substring check: `name.includes(excluded)`. If the `excludeSet` contains a short name (e.g., "Ed" or "Al"), any candidate whose name contains that substring (e.g., "Edward", "Edwin", "Alexander", or "Jared") will match and be incorrectly filtered out of the search results, even if they are a completely different person.

---

## 4. Dead Code Imports in rank.ts
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\rank.ts`
* **Line Number:** Line 9.
* **Code Snippet:**
  ```typescript
  import { extractDeptKeywords, deptRelevanceScore, detectWrongDept } from "./dept-utils";
  ```
* **Why it occurs:**
  The functions `extractDeptKeywords`, `deptRelevanceScore`, and `detectWrongDept` are imported from `./dept-utils` at the top of `rank.ts`. However, none of these imported functions/variables are referenced anywhere else in the file. They constitute dead imports that should be removed to keep the file clean.

---

## 5. Hardcoded Test Company Names in LLM Prompts
* **File:** `c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\src\lib\pipeline\rank.ts`
* **Line Numbers:** Line 33 and Line 39 (inside the prompt template in `rankCandidates`).
* **Code Snippets:**
  - **Line 33:**
    ```typescript
    Your goal is to find people who CURRENTLY work at ${company} (or its direct variants like Fixed Invest).
    ```
  - **Line 39:**
    ```typescript
    4. If a snippet says "DevOps Engineer. Fixerra.", that means they work there. If it says "At Fixerra, I designed...", evaluate if it sounds like a current or past role.
    ```
* **Why it occurs:**
  The system prompt supplied to the LLM in `rankCandidates` contains hardcoded references to specific test company names: "Fixed Invest" and "Fixerra". Since these prompts are meant to be generic across any company passed in through the `${company}` parameter, embedding specific test company names can confuse the LLM when classifying candidate profiles for other target companies.
