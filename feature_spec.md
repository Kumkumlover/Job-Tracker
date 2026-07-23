# Job Tracker & JobSuite (Outreach) — Product Feature Specification

## Overview
This document outlines the core features, intended use cases, and problems solved by the **Job Tracker CRM** and the **JobSuite Outreach Automation Engine**. Built for product managers, software engineers, and ambitious professionals, this suite transforms the grueling process of job hunting into a data-driven, automated pipeline.

---

## 1. Job Tracker CRM Features

### 1.1. Automated Gmail Sync & Stage Detection
- **Description:** Connects securely to the user's Gmail accounts (supports multiple linked accounts). It scans for job-related inbound emails (acknowledgments, interview invites, rejections) and outbound emails (cold emails, follow-ups). An NLP/Regex engine automatically identifies the company, the role, and the pipeline stage (e.g., "Interview", "Offer", "Rejected").
- **Intended Use Case:** Users returning from an interview or sending cold emails don't need to manually update their spreadsheets. Clicking "Sync" handles all data entry.
- **Problem Solved:** Eradicates the manual, tedious overhead of data entry during high-volume job applications.

### 1.2. Touchpoint Timeline & Deep Linking
- **Description:** Every email interaction is logged chronologically as a "Touchpoint" attached to a specific application card. Each touchpoint contains the exact email snippet and a deep link that opens the original email directly in the Gmail web client.
- **Intended Use Case:** Reviewing past communications with a recruiter before jumping into a final round interview.
- **Problem Solved:** Prevents users from having to search through their bloated email inboxes to find historical context on a specific job application.

### 1.3. Multi-View Pipeline Management (Kanban & Table)
- **Description:** A Notion-style interface allowing users to view applications in a sortable, filterable Table View or a drag-and-drop Kanban Board.
- **Intended Use Case:** High-level tracking of where the user stands across the entire job market. 
- **Problem Solved:** Visualizes bottlenecks in the application funnel (e.g., "I have 50 applications in 'Applied' but only 2 in 'Interview'").

### 1.4. Custom Stages & Custom Properties
- **Description:** Users can define dynamic pipeline stages (with custom colors/ordering) and append custom metadata fields (e.g., "Expected Salary", "Referral Name", "Location") to their application cards.
- **Intended Use Case:** Adapting the CRM to fit niche job hunting strategies that don't fit standard "Applied/Interview/Rejected" workflows.
- **Problem Solved:** Eliminates the rigidity of standard CRM tools by providing spreadsheet-level flexibility.

### 1.5. Overdue Follow-Up Engine
- **Description:** The system tracks the timestamp of the last touchpoint. If an application sits in a "waiting" stage (like "Applied" or "Interview Scheduled") beyond a user-defined threshold, it gets flagged.
- **Intended Use Case:** Daily dashboard review to see who needs to be bumped or followed up with.
- **Problem Solved:** Ensures no high-value opportunity slips through the cracks due to recruiter ghosting.

### 1.6. Chrome Extension Integration
- **Description:** A companion browser extension that triggers on career pages (Greenhouse, Lever, Workday). It parses the company name and role, injecting it straight into the CRM via an API endpoint.
- **Intended Use Case:** Browsing LinkedIn Jobs or YC Work at a Startup and rapidly saving targets.
- **Problem Solved:** Reduces the friction of initiating tracking at the top of the funnel.

---

## 2. JobSuite Outreach Features (Cold Email Engine)

### 2.1. Dynamic Lead Sourcing & Verification (Apollo & Hunter)
- **Description:** Users input a target company and role. The system queries the Apollo.io API to find the names and LinkedIn URLs of key decision-makers (e.g., "VP of Product", "Hiring Manager"). It then pipes these names into Hunter.io to find and verify their direct professional email addresses.
- **Intended Use Case:** Bypassing the traditional resume black hole by finding the exact person who has the hiring power.
- **Problem Solved:** Saves hours of manual LinkedIn Boolean searching and email guessing permutations.

### 2.2. Intelligent Context Scraping (Jina / Serper / Tavily / Exa)
- **Description:** Utilizing advanced scraping and semantic search APIs, the engine reads the provided Job Description URL, the Company's Website, and the Lead's LinkedIn Profile. It extracts the company's core mission, the lead's recent posts, and the exact hard skills required for the role.
- **Intended Use Case:** Gathering the specific "why you, why this company" intelligence required for a highly tailored pitch.
- **Problem Solved:** Prevents generic, templated cold outreach that gets ignored by executives. 

### 2.3. Evidence Library Matching
- **Description:** Users store their career highlights and portfolio links in the settings. The system matches the hard skills extracted from the Job Description against the user's Evidence Library to formulate 3 hyper-relevant bullet points.
- **Intended Use Case:** Proving competence instantly to a Hiring Manager.
- **Problem Solved:** Replaces the need to rewrite the resume or cover letter for every single application.

### 2.4. Hyper-Personalized LLM Email Generation (Gemini)
- **Description:** The Gemini LLM acts as the copywriter. It synthesizes the scraped company mission, the lead's LinkedIn hook, and the Evidence Library into natural, punchy outreach templates (Cold Email, Startup Pitch, Follow-Up, LinkedIn DM).
- **Intended Use Case:** Hitting "Generate" and getting an instantly sendable, highly researched email that looks like it took 30 minutes to write.
- **Problem Solved:** Scales high-quality, personalized outreach, significantly boosting reply rates from decision-makers.

### 2.5. Direct Gmail Drafts & SMTP Sending
- **Description:** Once the email copy is approved in the UI, users can either save it directly to their linked Gmail account as a Draft, or fire it off immediately via SMTP. 
- **Intended Use Case:** Final review and send flow.
- **Problem Solved:** Eliminates copy-pasting between the app and the email client.

### 2.6. Global API Tracking (BYOK Widget)
- **Description:** Since the tool uses a Bring-Your-Own-Key (BYOK) architecture, a floating widget constantly polls the usage endpoints of the 6 integrated providers (Hunter, Apollo, Serper, Tavily, Gemini, Exa). It displays real-time account limits and current-session usage.
- **Intended Use Case:** Keeping an eye on API quotas while running mass outreach campaigns.
- **Problem Solved:** Prevents unexpected API billing overages or mid-campaign rate-limit failures.

### 2.7. Braintrust Evaluation & Testing Loop
- **Description:** A built-in programmatic testing loop utilizing Braintrust. It evaluates the LLM's email outputs against "Golden Datasets" of perfect emails. It uses heuristic scorers (length, formatting) and LLM-as-a-judge to grade factuality, tone, and personalization.
- **Intended Use Case:** Iterating on the LLM System Prompt. If a user tweaks the prompt, they run the eval loop to mathematically prove the new prompt performs better.
- **Problem Solved:** Solves the non-deterministic nature of LLMs, ensuring the quality of cold outreach never regresses.
