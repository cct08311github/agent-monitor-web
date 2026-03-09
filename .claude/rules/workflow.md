# Development Workflow

Use GitHub Issues and PRs as the primary development workflow. If the repository defines a stricter process, follow that instead.

## Required Workflow

1. Check for an existing GitHub issue before starting work
2. If none exists, create one and mark it `in-progress` when implementation starts
3. Create a dedicated branch from `main`
4. Complete the work, run relevant tests, push, and open a PR
5. Add the PR link back to the issue
6. If new work is discovered during implementation and it is outside the current issue scope, create a separate follow-up issue immediately

## Rules

- Do not use local progress files as the detailed source of truth for task tracking
- Local markdown status files may be used only for high-level handoff or summary notes
- Every meaningful code or documentation change should map to an issue or an active PR
- Keep one branch and one PR scoped to one primary issue whenever practical
- If implementation reveals additional work that should not be bundled into the current issue, open a new issue before context is lost
- Prefer creating the follow-up issue during the same session rather than leaving undocumented TODOs in code or chat
- If a repository contains its own `AGENTS.md`, follow the repository-specific instructions in addition to this workflow
- Commit format: `feat(sN): <description>` (N = sprint number)
- Found a bug? Open an issue and follow this same workflow

## Automation Rule

For repositories that use recurring automations:

- On each scheduled run, check whether there is an actionable open GitHub issue
- If there is an actionable issue, start work by marking it `in-progress`, creating a dedicated branch from `main`, and proceeding with the standard workflow
- If there is no actionable issue, do not invent work; report that no issue is available and stop
- During implementation, any newly discovered out-of-scope work must be captured as a separate GitHub issue before the session ends
