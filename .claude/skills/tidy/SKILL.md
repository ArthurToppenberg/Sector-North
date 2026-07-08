---
name: tidy
description: Orchestrated maintenance sweep for the Sector North codebase — fans out agents to (1) refactor for SRP + fail-fast (kill fallbacks), (2) relocate top-of-file comments into CLAUDE.md and delete valueless comments, (3) update and clean up documentation. Use when the user asks to clean up, refactor, tidy, or refresh docs across the game code.
---

# Tidy — orchestrated codebase maintenance sweep

This skill runs a three-part cleanup of the game code by **fanning out subagents** (via the
`Agent` tool) so independent files are processed in parallel. You are the orchestrator: you
scope the work, spawn agents with precise prompts, verify their output, and gate the final
part behind a user decision.

Run the parts **in order** — 1 → 2 → 3 — because each depends on the previous (refactoring
changes what comments say; comment relocation changes what the docs must describe). Do not
skip ahead.

## Non-negotiable guardrails (inject these into every agent prompt)

These come from the repo `CLAUDE.md` and `apps/game/CLAUDE.md`. Every agent MUST honor them,
and you must reject agent output that violates them:

- **GPS is the source of truth.** Never move lon/lat → pixel logic out of
  `src/map/project.ts`. Entities keep real lon/lat alongside derived x/y.
- **Fail fast — no fallbacks.** This is the *goal* of Part 1, not just a constraint.
- **Module boundary.** `src/map/` is pure TS (no Phaser); `src/game/` does rendering/input.
  Do not cross the boundary.
- **HUD is white or black only** (`0xffffff` / `0x000000`). Map geography (coastline green
  `0x33ff66`) is exempt — it is not HUD.
- **Camera bounds are locked.** Do NOT touch `ZOOM.min`/`ZOOM.max`, `CAMERA_CENTER_BOUNDS`,
  or the clamp logic in `CameraController` unless the user explicitly asks in this request.
- **pnpm only.** Never `npm`/`yarn`; never create `package-lock.json`/`yarn.lock`.
- **Preserve observable game behavior.** These are refactors and doc changes, not feature
  changes. If a genuine behavior change seems required, stop and surface it — don't guess.

## Phase 0 — Scope the work (you do this yourself, before any agent)

1. If the user named specific files/dirs in their request, use those. Otherwise default to
   all TypeScript under `apps/game/src/` (`src/game/*.ts` and `src/map/*.ts`). Do **not**
   process `src/data/*` (bundled assets), `node_modules`, `dist`, or generated files.
2. Check the working tree: `git status --short`. If there are substantial uncommitted
   changes, tell the user this sweep will edit the working tree and recommend they commit or
   stash first. Proceed once acknowledged (or if the tree is already clean-ish).
3. Read both `CLAUDE.md` files fully so you can judge agent output against them.
4. Build the file work-list and announce the plan (which files, how many agents).

## Part 1 — Refactor (SRP · future-proof · fail fast)

Fan out **one agent per source file** (batch independent files in a single message so they
run concurrently). Each agent's job, on its ONE file:

- **SRP:** each module/class/function does one thing. Split mixed responsibilities; move
  misplaced logic toward where it belongs (respecting the map/game boundary). Prefer small,
  focused, well-named units.
- **Future-proof:** remove dead code, tighten types (no stray `any`), replace magic numbers
  that describe on-screen sizes with entries in `src/game/config.ts` per the app rules, and
  keep tunables in config / logic in layers.
- **Kill fallbacks (the priority):** hunt down and eliminate every "stupid fallback" so the
  game fails loudly:
  - `try/catch` that only exists to keep going → let it throw.
  - Default/placeholder values masking a missing input (e.g. `?? 0`, `|| {}`, projection
    defaulting to `0,0`, a guessed config value) → validate up front and `throw`.
  - `null`/`undefined` returned to signal failure → throw an explicit `Error` with a clear
    message instead.
  - Silent swallowing of errors → remove; surface them.
  - Validate inputs/preconditions at the top of functions and throw on anything unexpected.

Agent prompt template (fill in `<FILE>` and paste the guardrails above):

> You are refactoring exactly one file: `<FILE>` in the Sector North game (a Phaser + TS
> map game). Read it and its imports for context. Apply: SRP, future-proofing, and
> **fail-fast (eliminate every fallback)** as described. GUARDRAILS: <paste guardrails>.
> Do NOT change observable game behavior. Do NOT edit any other file except to move
> genuinely misplaced logic across the map/game boundary (note it if you do). When done,
> report: (a) a concise bullet list of changes, (b) every fallback you removed and what it
> now does instead, (c) anything you deliberately left alone and why.

After all agents return:
- Run the typecheck: `pnpm exec tsc --noEmit` from `apps/game` (or `pnpm --filter
  sector-north-game typecheck`). Fix or dispatch fixes for any errors before moving on.
- Summarize Part 1 for the user (files touched, fallbacks removed).

## Part 2 — Comments → documentation

Goal: move **top-of-file / module-level explanatory comment blocks** (the "why this module
exists / why it's designed this way" headers) out of the code and into the appropriate
`CLAUDE.md`, and **delete comments that carry no value**.

Judgment rules (encode these into the agents):

- **Relocate, don't destroy:** a top-of-file block that explains architecture, rationale, or
  a design decision (e.g. the `svgIcon.ts` base64/`atob` explanation, the `AirportMarker`
  GPS-source-of-truth note) is knowledge — move its substance into the relevant `CLAUDE.md`
  (`apps/game/CLAUDE.md` for app conventions; root `CLAUDE.md` for project-wide rules),
  folding it into existing sections rather than dumping raw. Then remove/trim it from the
  file.
- **Keep in place:** short inline `// why` comments that only make sense at a specific line
  (a non-obvious gotcha next to the code it guards). These stay — do not force local "why"
  notes into the docs.
- **Delete outright:** comments that restate the code (`// increment i`), stale/obsolete
  comments, commented-out code, and redundant JSDoc that adds nothing over the signature.

Because this part edits shared `CLAUDE.md` files, do NOT let multiple agents write the same
`CLAUDE.md` concurrently. Structure it as:
1. Fan out **read-only** analyzer agents (one per file) that return: comment blocks to
   relocate (with proposed target CLAUDE.md + section), and comments to delete — no edits.
2. You (the orchestrator) merge their proposals, then apply CLAUDE.md edits yourself in one
   pass to avoid write races.
3. Fan out editor agents (one per source file) to remove/trim the relocated blocks and
   delete the valueless comments in their file only.

Re-run the typecheck after edits (comment removal shouldn't break it, but confirm), then
summarize what moved and what was deleted.

## Part 3 — Documentation (gated by a user decision)

Do NOT edit documentation blindly here. Instead:

1. Review the docs: both `CLAUDE.md` files, `apps/game/src/data/borders/readme.md`, any
   `README`, and top-level docs. Cross-check them against the now-refactored code and the
   comments relocated in Part 2 — find stale statements, gaps, duplication, and anything the
   refactor made inaccurate.
2. **Outline** your proposed documentation changes as a concrete, specific list (per file:
   what you'd add/rewrite/remove and why).
3. Present that outline to the user with the `AskUserQuestion` tool and let them choose what
   to apply (e.g. "Apply all", "Apply a subset", "Revise the outline", "Skip"). Do not
   proceed until they answer.
4. Apply only what the user approved.

## Wrap-up

Give the user a final summary across all three parts, and a `git diff --stat` overview so
they can review. Remind them these are working-tree edits (nothing committed) and suggest
running `/verify` or `/run` if they want to confirm the game still behaves correctly.
