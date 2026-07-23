# Braintrust Evaluation Methodology

This document details the rigorous, programmatic testing loop used to validate, grade, and iteratively improve the LLM behaviors powering the **Job Tracker** and **JobSuite Outreach Engine**. Because LLMs are inherently non-deterministic, we rely on [Braintrust](https://www.braintrust.dev/) to mathematically measure regression, isolate failure points, and confirm improvements across the pipeline.

During the development of JobSuite, we broke the outreach pipeline down into 5 distinct evaluation steps. For each step, we ran experiments against a hand-curated "Golden Dataset", analyzed the failures, and tuned our system prompts or algorithms until the score improved. 

Here is the exact 5-step methodology we followed and how it contributes to the tool's success.

---

## Step 1: Company Research & Context Extraction
**The Goal:** Process a raw Job Description (JD) and extract structured, foundational data: Industry, Stage, Core Products, and Mission Statement.

**Evaluation & Scorer:**
- Evaluated via `Job-Tracker-Company-Research`.
- **Scorer:** Custom LLM-as-a-Judge grading for semantic equivalence (100% accuracy expected).

**Experimentation & Improvements:**
- *Initial Problem:* Passing massive, raw JSON blocks of company context to downstream LLM steps caused context-window bloat and occasional parsing failures.
- *Improvement Made:* We analyzed the traces and realized downstream tasks only needed the raw text. We modified the output layer of this step to flatten the JSON into a clean string format (e.g., `Industry: X \n Mission: Y`). 
- *Impact on Success:* This ensures that the Email Generation engine is fed clean, noise-free context, drastically reducing token usage and improving the precision of the final cold email.

---

## Step 2: Search Strategy Generation
**The Goal:** Translate the target Job Title and JD into a highly optimized Boolean search strategy (Google Dorks) to locate the actual Hiring Manager on LinkedIn, bypassing generic peers.

**Evaluation & Scorer:**
- Evaluated via `Job-Tracker-Search-Strategy`.
- **Scorer:** Exact Match/Keyword Inclusion Score checking if crucial titles (like "VP of Product", "Director of Engineering") and latent department keywords were successfully expanded.

**Experimentation & Improvements:**
- *Initial Problem:* Searching for just "Product Manager" often yielded individual contributors instead of the person with hiring power.
- *Improvement Made:* We dedicated a distinct LLM step *solely* to generating search variations. We tuned the golden dataset to expect expanded titles and department keywords (like "Platform" or "Infrastructure"). 
- *Impact on Success:* By evaluating this step in isolation, we dramatically improved the recall rate of our subsequent Serper/Exa search APIs. The tool now accurately finds the elusive Hiring Managers that standard searches miss.

---

## Step 3: Consensus Search & Candidate Ranking
**The Goal:** Fire the generated queries to multiple search engines (Serper, Tavily, Exa), combine the results using a heuristic consensus algorithm, and use an LLM to select the single best Hiring Manager from the top 25 results.

**Evaluation & Scorer:**
- Evaluated via `Job-Tracker-Candidate-Ranking`.
- **Scorer:** `Candidate Validation Score` measuring how often the system correctly identified the true Hiring Manager from the raw search data.

**Experimentation & Improvements:**
- *Initial Problem 1 (The "None" Hallucination):* If the LLM felt no candidate was a perfect fit, it hallucinated string values like `"None"` instead of returning a valid empty JSON array, crashing the pipeline. We mitigated this by heavily reinforcing the JSON schema rules in `candidateRank_v1.txt`.
- *Initial Problem 2 (Ex-Employees):* The LLM occasionally selected candidates who had recently left the company. 
- *Improvement Made:* We implemented strict `REJECTION RULES` in the prompt, instructing the model to reject snippets containing "Ex-", "Former", or "Left". We also lowered the model temperature to `0.1` to increase deterministic filtering.
- *Impact on Success:* While a slight false-positive rate remains acceptable (it's better to guess a hiring manager than email no one), these prompt iterations ensured the tool consistently surfaces the highest-probability decision maker.

---

## Step 4: Email Hook Generation
**The Goal:** Synthesize the scraped Company Context and generate a 1-2 sentence personalized opening hook explaining *why* the user is interested in the company.

**Evaluation & Scorer:**
- Evaluated via `Job-Tracker-Email-Hook-Generation`.
- **Scorer:** `Factuality Score` (Custom LLM-as-a-judge specifically checking for hallucinations, invented metrics, or fake values).

**Experimentation & Improvements:**
- *Initial Problem:* When evaluating with standard LLMs (acting as copywriters), they leaned into "salesy" behaviors, hallucinating growth metrics or product features to sound more persuasive when company context was thin. Furthermore, standard evaluation libraries like `autoevals` failed in our environment because they hardcoded OpenAI models, while we were using Groq/Gemini.
- *Improvement Made:* First, we built our own custom `Factuality Judge` to ensure our eval pipeline remained robust and fast. Second, we strictly constrained the LLM with negative prompting (`"Under NO circumstances should you include numbers or features not explicitly stated in the context"`).
- *Impact on Success:* The cold emails generated by the tool now sound incredibly authentic, highly personalized, and most importantly, strictly factual—preventing embarrassing outreach errors.

---

## Step 5: Final Assembly & Evidence Library Matching
**The Goal:** Assemble the final email copy by mapping the user's hard skills to the JD, completely avoiding resume hallucinations.

**Evaluation & Scorer:**
- Evaluated via end-to-end `EmailFormat` and `MissionRelevance`.

**Experimentation & Improvements:**
- *Initial Problem:* The LLM was wordy, writing full sentences for the company mission (e.g., "Your vision of building is an ecosystem..."). It also occasionally invented impressive-sounding metrics for the user's background.
- *Improvement Made:* We aggressively updated the system prompt to enforce formatting: *"Write a short noun phrase completing the sentence 'Your vision of building...'"*. More importantly, we completely decoupled the "About Me" bullets from the LLM's creative control. We injected a strict rule instructing the model to *only* select and rewrite bullet points directly from the user's provided `EVIDENCE LIBRARY`.
- *Impact on Success:* Evals jumped from ~0.6 to 0.95 accuracy. The final tool now produces high-converting, deeply personalized cold emails that perfectly align the candidate's real-world skills with the specific needs of the Hiring Manager.

---

## Conclusion: Continuous Testing (CI/CD)

By isolating the pipeline into these 5 steps, we eradicated compounding errors (where a hallucination in Step 1 destroys the email in Step 5). 

Whenever a developer tweaks a prompt or changes the orchestration logic, they run:
```bash
npx braintrust eval braintrust/scripts/run_eval.ts
```
This executes the pipeline against the Golden Dataset, logs the traces directly to the Braintrust Dashboard, and outputs a mathematical delta. We do not merge prompt changes to `main` unless the score delta is positive.
