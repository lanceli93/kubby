# Multi-model workflow (Fable orchestrates, opus/sonnet execute)

Cost model: the expensive model (Fable 5) is used only for the low-frequency,
high-leverage work — **planning and acceptance** — while the high-frequency
work — **writing code** — is delegated to cheaper models (Sonnet 5, or Opus 4.8
for hard tasks). Fable stays in control the whole time and reviews every result.

## Roles

| Role | Model | Where it runs |
|------|-------|---------------|
| Orchestrator + Planner + Reviewer | **Fable 5** | the main session |
| Executor (worker) | **Sonnet 5** default, **Opus 4.8** for complex tasks | isolated subagent, one per task |

There is no separate planner/reviewer subagent on purpose — Fable does both
itself in the main loop. Executors run in isolated contexts and return only a
short report, so Fable's context stays clean for verification.

## How to start a session

Launch Claude Code and make the main model Fable:

```
claude --model fable
```

or inside a running session: `/model fable`.

Then tell Fable to orchestrate, e.g.:

> You are the orchestrator. Follow docs/multi-model-workflow.md. Plan <feature>,
> then delegate each task to the executor subagent and verify each result
> yourself before moving on.

## The loop Fable runs

1. **Plan (Fable).** Break the feature into small, independently-verifiable
   tasks. Write them as a checklist in `docs/feature-request.md` (or a named
   working task file), each item with a one-line acceptance criterion.
2. **Delegate (Fable → executor).** For each task, spawn the `executor`
   subagent with just that task + the context it needs + the checklist path.
   - Simple/mechanical task → let it default to **sonnet**.
   - Complex/risky task (tricky logic, cross-cutting, perf-sensitive) →
     spawn the executor with **model: opus**.
   - Independent tasks can be delegated in parallel (multiple Agent calls in
     one turn).
3. **Verify (Fable).** Read the executor's report and the actual diff. Run or
   re-run the build/typecheck/tests if needed. Accept only if it meets the
   acceptance criterion; otherwise send it back with specific feedback (reuse
   the same executor via SendMessage, or re-delegate).
4. **Record.** Confirm the checklist item is ticked. Fable owns commits and doc
   updates (per project `CLAUDE.md`): when a batch of changes is done, `git add`
   + `git commit` with a short message; on feature completion, move items from
   `docs/feature-request.md` to `docs/feature-completed.md` and update the
   latest `docs/architecture-v0.x-mvp.md`.

## Notes
- The executor's `model:` frontmatter (sonnet) is just the default. The
  orchestrator's per-spawn `model` argument overrides it, which is how Fable
  chooses opus vs sonnet per task.
- Keep tasks small enough that one executor run can finish and self-verify one
  checklist item — that's what keeps the delegate→verify loop tight.
