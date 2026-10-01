when there are many code changes, you should do git add + git commit with a short commit message
remove the items in docs/feature-request.md if you have done the features listed in it. Don't keep a separate completed-features log — git commits + the kubby skill are the record (docs/feature-completed.md is archived in docs/archive/)
every time we finish a big feature, update the kubby skill (.claude/skills/kubby/: SKILL.md, references/architecture.md, references/feature-patterns.md) instead of docs/architecture-v0.x-mvp.md — the skill is the reference we keep current, verify against the actual shipped code, and grep for stale counts/claims before committing
And always callout that you have done the git commit or doc update 
