---
name: prune-branches
description: Delete stale git branches whose pull requests have already merged — both locally and on origin. Use when the user asks to clean up / prune / remove merged, dead, or no-longer-used branches, or to tidy up the branch list after PRs land.
---

# prune-branches — remove branches whose PRs have merged

After a PR merges, its branch is dead weight: it lingers locally, and (unless GitHub is
configured to auto-delete head branches) on `origin` too. This skill finds those merged
branches and deletes them from both places — **safely, never guessing.**

The guiding rule: **only delete a branch once you have proof its PR merged.** A branch that
looks merged by `git branch --merged` is *not* proof when the repo squash- or rebase-merges
(the classic false negative). Cross-check against GitHub before any destructive step.

## Step 0 — The better long-term fix (mention it, don't skip it)

Deleting branches by hand is mopping up a leak. The durable fix is to have GitHub delete
each PR's head branch automatically on merge. Check and offer to enable it:

```bash
gh repo view --json deleteBranchOnMerge          # is it already on?
gh api -X PATCH repos/{owner}/{repo} -f delete_branch_on_merge=true   # enable it
```

This only covers **origin**, and only for **future** merges — local branches and any
already-merged remote branches still need this skill. Enabling it is an outward-facing repo
setting change: confirm with the user before running the PATCH.

## Step 1 — Establish ground truth (read before deleting anything)

```bash
git rev-parse --is-inside-work-tree      # fail fast if not a git repo
gh auth status                           # fail fast if gh is not authenticated
git fetch --prune                        # sync remote-tracking refs; drop refs for
                                         #   branches already deleted on origin
git branch --show-current                # the branch you're on — NEVER delete this
```

**Fail fast** and stop if you're not in a git repo or `gh` is not authenticated. Do not
invent a branch list.

## Step 2 — Identify merged branches (proof required)

Combine two independent signals; a branch qualifies if **either** confirms it merged:

1. **Its PR is merged on GitHub** (authoritative, handles squash/rebase merges):

   ```bash
   gh pr list --state merged --limit 200 --json headRefName,number,title
   ```

   Any local/remote branch whose name matches a merged PR's `headRefName` is a delete
   candidate.

2. **Its upstream is gone** after `git fetch --prune` (the remote branch was deleted,
   e.g. by auto-delete-on-merge):

   ```bash
   git branch -vv | grep ': gone]'
   ```

Build the candidate list from the union of the two. Then **subtract the protected set**,
which is never eligible for deletion:

- `main` (and any other long-lived base branch)
- the branch currently checked out (`git branch --show-current`)
- any branch with an **open** (not merged) PR
- any branch with uncommitted local work you'd lose — if a candidate is the current branch
  or has unpushed commits not in its merged PR, stop and flag it instead of deleting

## Step 3 — Show the plan and get confirmation

List exactly what will be deleted, split into local vs origin, each with the PR number that
proves it merged. Example:

```
Will delete (merged PRs):
  local + origin  feat/radar-sweep        (PR #42, merged)
  local           chore/tidy-labels       (PR #38, merged; remote already gone)
Protected / skipped:
  main            (base branch)
  fix/live-bug    (current branch)
  feat/wip-thing  (PR #51 still OPEN)
```

**Always confirm with the user before deleting**, unless they've explicitly said to prune
without asking. Deleting a branch is destructive and hard to undo — treat it that way.

## Step 4 — Delete (local first, then origin)

For each confirmed branch:

```bash
# local — -d refuses branches git can't prove are merged; for squash/rebase merges that
# git can't see, -D is required, but ONLY after gh confirmed the PR merged in Step 2.
git branch -d <branch>   || git branch -D <branch>

# origin — skip if the remote branch is already gone (Step 2 signal 2)
git push origin --delete <branch>
```

Never `git branch -D` a branch you have not proven merged via `gh` — `-D` bypasses git's
own safety check, so the GitHub cross-check is the only thing standing between you and lost
work.

## Step 5 — Report

Summarize what was deleted (local and origin counts) and what was skipped and why. If any
deletion failed (e.g. remote branch protected, or unpushed commits), surface the error
verbatim rather than swallowing it.

## Guardrails

- **Proof before deletion:** every deleted branch traces to a merged PR or a gone upstream.
- **Never delete** `main`, the current branch, or a branch with an open PR.
- **No `-D` without a merged-PR confirmation.** `-d` is the default; `-D` only for
  squash/rebase merges that git can't detect but `gh` confirmed.
- **Confirm first** — destructive and effectively irreversible for local-only commits.
- Report failures honestly; do not hide a failed delete behind a success summary.
