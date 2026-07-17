# Job Tracker — Braintrust Evals

This project uses [Braintrust](https://www.braintrust.dev/) for evaluating the LLM components of our outreach pipeline. Evals help us detect regressions and test new models or prompt changes safely.

## Architecture

We use a dual LLM pathway:
1. **Pipeline Prompts (Search & Rank):** Uses the `askJSONValidated` wrapper (in `src/lib/automation/llm.ts`) via OpenAI SDK, auto-traced via `wrapOpenAI`.
2. **Email Extraction (Outreach Route):** Uses direct `fetch` to Gemini REST API, wrapped in a manual Braintrust `traced` span.

All prompts have been extracted into `src/lib/automation/prompts/` as `.txt` files for easy versioning and review.

## Running Evals

To evaluate the core email mission extraction logic locally:

1. Ensure your `.env.local` has `BRAINTRUST_API_KEY` and `GEMINI_API_KEY` set.
2. Run the eval script:
   ```bash
   npx braintrust eval braintrust/eval.ts
   ```

### CI/CD

A GitHub Action is configured in `.github/workflows/eval.yml`. It runs automatically on pull requests. You must configure `BRAINTRUST_API_KEY` and `GEMINI_API_KEY` in your GitHub repository secrets.

## Datasets and Scorers

- **Datasets:** Golden data is stored in `braintrust/datasets/`. Currently we have `mission_extracts.json` which contains verified data from stress tests on Payme, Saber Money, Blue Machines, Firstcry, and Silverpush.
- **Scorers:** Found in `braintrust/scorers/`. We use Braintrust's `autoevals` library for LLM-as-a-judge scoring on:
  - `missionRelevance`: Evaluates if the extracted company mission accurately reflects the JD.
  - `strengthsAlignment`: Evaluates if the extracted strengths align with the JD requirements.

## Monitoring

- **Tracing:** Production traces will automatically stream to the Braintrust dashboard whenever `BRAINTRUST_API_KEY` is present.
- **Alerts:** Please configure regression alerts directly in the Braintrust dashboard to notify the team via email or Slack if `missionRelevance` drops below 0.8 on main.
