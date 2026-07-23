# Braintrust Evaluation Methodology

This document details the programmatic testing loop used to validate, grade, and improve the LLM behaviors powering the **Job Tracker** and **JobSuite Outreach Engine**. Because LLMs are inherently non-deterministic, we rely on [Braintrust](https://www.braintrust.dev/) to mathematically measure regression and confirm improvements when tuning our system prompts or swapping models.

---

## 1. Golden Datasets

To score the LLM accurately, we established "Golden Datasets" (`braintrust/datasets/`). These are JSON files containing hand-curated, verifiable "ground truth" examples of what the perfect output should look like given a specific Job Description (JD) and Company Context.
- `mission_extracts.json`: Tests the AI's ability to pull out core company missions and required hard skills.
- `golden.json`: Tests the AI's ability to accurately construct complex boolean search queries for hiring managers.

---

## 2. Evaluation Steps & Scorers

We run modular evaluations for each distinct step of the JobSuite Outreach pipeline.

### Step 2.1: Lead Generation & Search Strategy
**The Goal:** Given a job description, generate the perfect Google Dork (`site:linkedin.com/in`) to find the Hiring Manager, and then filter the Serper search results accurately.

**Scorers Used:**
- `CandidateFound` (Heuristic / Exact Match): Checks if the resulting ranked array of candidates is `> 0`.
- `JDContactExtracted` (Heuristic / Exact Match): Checks if the system correctly parsed explicit contact emails (e.g., `chahal.shah@presolv360.com`) from the raw JD text before even searching.

**Results & Improvements:**
- *Initial Result:* The LLM was pulling in candidates whose LinkedIn snippets said "Ex-Product Manager at [Company]" or "Former [Role]". 
- *Improvement Made:* We updated the LLM filtering prompt (`run_validation_traces.ts`) to include strict `REJECTION RULES`, specifically instructing the model to reject snippets containing "Ex-", "Former", or "Left". We also lowered the model temperature to `0.1` to increase deterministic filtering.

### Step 2.2: Context Extraction (Mission & Strengths)
**The Goal:** Extract a short, punchy noun phrase summarizing the company's mission from their website, and select exactly 2 hard skills from the user's Evidence Library that map to the JD.

**Scorers Used (LLM-as-a-judge via Autoevals):**
- `missionRelevance`: An LLM judge grades (0.0 to 1.0) whether the extracted mission phrase accurately reflects the company's real-world business objective.
- `strengthsAlignment`: An LLM judge evaluates if the extracted hard skills are actually requested in the original Job Description.

**Results & Improvements:**
- *Initial Result:* The LLM was writing full, wordy sentences for the mission (e.g., "Your vision of building is an ecosystem...").
- *Improvement Made:* We aggressively updated the system prompt to enforce formatting: *"Write a short noun phrase completing the sentence 'Your vision of building...'. DO NOT repeat 'Your vision of building' or write a full sentence."* Evals immediately jumped from ~0.6 to 0.95 accuracy.

### Step 2.3: Final Email Copy Generation
**The Goal:** Synthesize the scraped context, the extracted strengths, and the user's career highlights into a professional, non-robotic cold email.

**Scorers Used:**
- `EmailFormat` (Heuristic): Ensures the email is under a specific character limit (brevity is critical for cold emails) and contains no markdown formatting.
- `Factuality` (LLM-as-a-judge): Grades whether the LLM invented any fake metrics or experiences not found in the user's Evidence Library.

**Results & Improvements:**
- *Initial Result:* Standard LLMs tend to hallucinate impressive-sounding metrics when generating cover letters. The `Factuality` scorer frequently failed.
- *Improvement Made:* We completely decoupled the "About Me" bullets from the LLM's creative control. We injected a strict rule into the prompt instructing the model to *only* select and rewrite bullet points directly from the provided `EVIDENCE LIBRARY` array, completely eradicating hallucinations.

---

## 3. Continuous Testing (CI/CD)

Whenever a developer tweaks a prompt in `src/lib/automation/prompts/` or changes the orchestration logic, they run:
```bash
npx braintrust eval braintrust/scripts/run_eval.ts
```
This executes the pipeline against the Golden Dataset, logs the traces directly to the Braintrust Dashboard, and outputs a mathematical delta (e.g., `missionRelevance: 0.92 (+0.05)`). We do not merge prompt changes to `main` unless the score delta is positive.
