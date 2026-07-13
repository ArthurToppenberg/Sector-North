---
name: tidy
description: Scoped, context-cheap cleanup sweep for Sector North. Scopes to the RECENT change set (auto-detected, or a git ref / file list passed as args), analyzes it into disjoint feature clusters, then runs a background Workflow that fans out agents to (1) refactor for SRP + fail-fast + deduplicate repeated logic, (2) relocate module comments into CLAUDE.md and delete valueless ones — returning only a compact summary + a documentation outline you gate with the user. Use when the user asks to clean up, refactor, tidy, or refresh docs.
---

# Tidy — scoped, feature-clustered maintenance sweep

The heavy work runs inside a **Workflow** (`tidy.workflow.js`, bundled next to this file), so
dozens of agent reports are consumed *inside the script* and never touch your context — only a
small summary comes back. Your job in the main loop is three things: **scope the change set**,
**run the workflow**, and **gate the documentation step** with the user.

Context cost stays roughly flat as the repo grows because it scales with the size of the *recent
change set*, not the whole codebase.

## Step 1 — Compute the change set (you do this, before the workflow)

The scope is **only what recently changed** — never the whole tree. Resolve it in this order:

1. **If the user passed args** (`$ARGUMENTS`):
   - Looks like a git ref (e.g. `HEAD~3`, a branch, a SHA) → scope = `git diff --name-only <ref>...HEAD`, and `baseRef = <ref>`.
   - Looks like file path(s) → scope = exactly those files, `baseRef = null`.
2. **No args → auto-detect:**
   - `git status --porcelain` shows changes → scope = those files, `baseRef = null` (working tree).
   - Else `git diff --name-only origin/main...HEAD` is non-empty → scope = those files, `baseRef = origin/main`.
   - Else **STOP** and tell the user there's nothing to tidy (fail fast — do NOT invent work on unchanged files).
3. **Filter the file list** to source only: keep `apps/game/src/**/*.ts`; drop `src/data/*` (bundled
   assets), `*.d.ts`, `dist`, `node_modules`, and anything generated. If nothing survives, STOP.

Then announce the plan briefly: which files, which base, and that the sweep edits the working tree
(nothing is committed). If `baseRef` is `null` (working-tree scope), those uncommitted edits *are*
the scope — that's expected.

## Step 2 — Run the workflow

Call the `Workflow` tool with the bundled script and the scope as `args`:

```
Workflow({
  scriptPath: "/Users/arthurtoppenberg/Documents/github/Sector-North/.claude/skills/tidy/tidy.workflow.js",
  args: { files: ["apps/game/src/..."], baseRef: "origin/main" }   // baseRef null for working-tree scope
})
```

The script runs, in order: **Analyze** (cluster the changed files into disjoint features) →
**Refactor** (one agent per feature, SRP + kill every fallback + merge duplicated logic the changes
introduced into one shared helper) → **Shared edits** (serialize any
edits to files shared across clusters, e.g. `config.ts`) → **Typecheck** (`tsc --noEmit`, one fix
pass if it fails) → **Comments** (relocate module blocks into the right `CLAUDE.md`, delete
valueless comments) → build a **documentation outline** (no edits).

It returns a compact object: `{ scope, clusters, refactor, sharedEdits, typecheck, comments,
part3Outline }`. If `typecheck.ok` is false in the result, dispatch a fix (or a follow-up agent)
before continuing. If the workflow returns an empty/odd result, read the run's `journal.jsonl` in
its transcript dir to see what each agent actually returned before re-running.

## Step 3 — Gate the documentation changes (interactive)

`part3Outline` is a list of *proposed* doc edits (`{ file, action, detail, why }`) — nothing has
been written. Present it to the user with `AskUserQuestion` and apply only what they approve:

- Few proposals → one question: **Apply all · Choose a subset · Skip**.
- Many proposals → a `multiSelect` question listing each proposed change so they tick which to apply.

Apply the approved edits yourself in the main loop (you already hold the outline + their choice).
Then re-run the typecheck if any doc change touched code-adjacent files (rare).

## Wrap-up

Give a final summary from the returned object (features cleaned, fallbacks removed, duplicates
merged, comments relocated/deleted, typecheck status, docs applied) and run `git diff --stat` so the user can
review. Remind them nothing is committed, and suggest `/verify` or `/run` to confirm the game still
behaves correctly.

## Guardrails

The non-negotiable repo rules (GPS-as-source-of-truth, fail-fast/no-fallbacks, map/game module
boundary, HUD white-or-black, locked camera bounds, pnpm-only, preserve observable behavior) are
embedded in the workflow script and injected into every agent prompt. If you ever run a step
manually instead of via the workflow, inject the same guardrails and reject output that violates
them.
