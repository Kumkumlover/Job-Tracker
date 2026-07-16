# BRIEFING — 2026-06-25T05:47:05+05:30

## Mission
Execute deep research into Serper, Tavily, and Exa.ai search APIs, perform risk and limitation analysis, design the optimal waterfall pipeline, outline the test plan, project costs, and write a production-grade research and implementation report.

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\.agents\orchestrator
- Original parent: main agent
- Original parent conversation ID: c1126451-ade7-4339-86ab-2d1a78f45334

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\PROJECT.md
1. **Decompose**: Decomposed by requirements (Research, Risk, Waterfall Design, Test Plan, Costs).
2. **Dispatch & Execute** (pick ONE):
   - **Delegate (sub-orchestrator)**: Spawn explorer subagents to research each API and verify current code.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Self-succeed at 16 spawns, write handoff.md, spawn successor.
- **Work items**:
  1. Initialize scope and plan [done]
  2. Research Serper, Tavily, Exa.ai APIs [pending]
  3. Analyze Risks & Limitations [pending]
  4. Design Waterfall Pipeline & Pseudocode [pending]
  5. Outline Test Plan [pending]
  6. Project Costs & Synthesize Report [pending]
- **Current phase**: 1
- **Current focus**: Research and planning

## 🔒 Key Constraints
- Never reuse a subagent after it has delivered its handoff — always spawn fresh
- Write metadata/state files (.md) only in .agents/orchestrator/ folder
- Do not write source code directly (dispatch to workers/explorers)

## Current Parent
- Conversation ID: c1126451-ade7-4339-86ab-2d1a78f45334
- Updated: not yet

## Key Decisions Made
- Decompose the research, risk analysis, pipeline design, testing and costing into milestone blocks.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_m1 | teamwork_preview_explorer | Codebase Analysis | completed | d9f1a519-2118-4e0a-b586-cb56a4b6456a |
| worker_m2_m7 | teamwork_preview_worker | Waterfall Research & Report | completed | 7dbe25d1-b2e7-4aa2-ac17-e5f4d6db0935 |

## Succession Status
- Succession required: no
- Spawn count: 2 / 16
- Pending subagents: none
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: killed
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\.agents\orchestrator\ORIGINAL_REQUEST.md — Original User Request
- c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\.agents\orchestrator\progress.md — Progress tracker
- c:\Users\Lenovo\Downloads\Job tacker-20260510T160312Z-3-001\Job tacker\web\PROJECT.md — Global project plan and milestones
