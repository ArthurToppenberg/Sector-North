---
name: pr
description: Open a GitHub pull request for the current branch — push it to the remote and write a clear, well-structured description grounded in the actual diff. Use when the user asks to "make a PR", "open a pull request", "raise a PR", or ship the current branch to GitHub for review.
---

# pr — push the branch and open a well-described pull request

Turn the current branch's work into a GitHub PR with a description that a reviewer can
actually use. The rule of thumb: **the description is derived from the real diff and
commits, never invented.** If you can't back a sentence with something in the change set,
don't write it.

## Step 1 — Establish the ground truth (read before writing anything)

Run these together and read the output before drafting:

- `git branch --show-current` — the branch you'll open the PR from.
- `git status --porcelain` — is the tree clean? Uncommitted work must be handled (Step 2).
- `git log --oneline main..HEAD` (or `origin/main..HEAD`) — every commit unique to this branch.
- `git diff main...HEAD --stat` then `git diff main...HEAD` — the actual changes. Read the
  full diff, not just the stat, so the description reflects what really changed.

Determine the base branch: default to `main` (this repo's default). If the branch clearly
targets something else, confirm with the user rather than guessing.

**Fail fast:** if the branch is `main` itself, if there are no commits ahead of base, or if
`gh` is not authenticated (`gh auth status`), STOP and tell the user — do not fabricate a PR.

## Step 2 — Handle uncommitted changes

If `git status` is dirty:

- If the changes are clearly part of this feature, stage and commit them with a message that
  matches the repo's commit style (see `git log`), then continue.
- If it's unclear whether they belong, ask the user before committing.

Never open a PR that silently leaves relevant work uncommitted on the branch.

## Step 3 — Push the branch

```bash
git push -u origin <branch>
```

If the branch already has an upstream, a plain `git push` is fine. If the push is rejected
(remote has commits you don't), STOP and surface it — do not force-push unless the user
explicitly asks.

## Step 4 — Write the description and open the PR

Compose the body from the diff and commits. Structure it so a reviewer gets context fast:

- **Title** — concise, imperative, matching the repo's commit-message style (e.g.
  `perf(tidy): tier agent models to cut wall-clock`). Don't just echo the branch name.
- **Summary** — 1-3 sentences: what changed and *why*. Lead with intent, not mechanics.
- **Changes** — a short bullet list of the substantive changes, grouped logically. Reference
  files/areas where it helps a reviewer navigate.
- **Testing / verification** — what you ran (`pnpm --filter sector-north-game typecheck` /
  `build`) and its result, or an explicit note that it's unverified. Never claim a check
  passed that you didn't run.
- **Notes** — follow-ups, known gaps, or review-focus callouts, only if any exist. Omit the
  section rather than padding it.

Keep it tight and honest. No filler, no invented motivation, no checkbox theater.

Open the PR by passing the body via a file or heredoc so formatting survives:

```bash
gh pr create --base main --head <branch> --title "<title>" --body "$(cat <<'EOF'
## Summary
...

## Changes
- ...

## Testing
- ...

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

End the PR body with the `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
line (per the environment's git conventions).

## Step 5 — Report back

Print the PR URL that `gh pr create` returns so the user can click through. Give a one-line
summary of what was opened (title + base ← head). If a PR already exists for the branch,
`gh pr create` will say so — surface that and offer to update it instead of creating a new one.

## Guardrails

- **Grounded, not generated:** every claim in the description traces to the diff/commits.
- **No force-push, no new commits to `main`, no closing/merging** unless the user asks.
- **Verification honesty:** state exactly what you ran and what it returned; if you ran
  nothing, say so.
- Respect this repo's rule against running the game — verify with typecheck/build only.
