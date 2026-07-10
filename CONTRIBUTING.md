# Contributing to Sector-North

Contributions are welcome. Before you start, please read the two rule files in the repo —
they are short and non-negotiable:

- **`CLAUDE.md`** (repo root) — the core architectural principle (*GPS is the source of
  truth*), plus tooling and style rules (fail fast — no fallbacks, newest package
  versions, pnpm only, HUD in white/black only).
- **`apps/game/CLAUDE.md`** — how the game app is structured.

They are written for Claude Code but apply equally to human contributors.

## How to contribute

1. Fork the repository and create a branch for your change.
2. Make your change; keep commits and the PR title in
   [Conventional Commits](https://www.conventionalcommits.org/) form
   (`<type>(<scope>): <summary>`, e.g. `feat(map): add radar sweep`).
3. Run `pnpm -r typecheck` (and `pnpm build`) before opening the PR.
4. Open a pull request describing what you changed and why.

## License of the project

Sector-North is **source-available, not open source**. It is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md): anyone may use, modify, and share it
for **noncommercial** purposes only. Commercial use is not permitted.

## Contributor License Agreement (CLA)

By submitting a contribution (a pull request, patch, or any other change) to this project,
you agree to the following. **Read this before opening a PR — opening one is your
acceptance.**

1. **You have the right to contribute it.** The contribution is your original work (or you
   have the necessary rights to submit it), and to your knowledge it does not infringe
   anyone else's rights.

2. **You grant the project owner (Arthur Toppenberg) a broad, irrevocable license to your
   contribution.** Specifically, you grant a perpetual, worldwide, non-exclusive,
   royalty-free, irrevocable copyright and patent license to use, reproduce, modify,
   prepare derivative works of, publicly display, sublicense, and distribute your
   contribution and such derivative works.

3. **You permit the owner to relicense.** This license explicitly includes the right for
   the owner to license or relicense your contribution — and the project as a whole,
   including your contribution — under different terms, **including commercial or
   proprietary terms**, now or in the future. In other words, the owner may ship a
   commercial version of Sector-North that includes your contribution.

4. **You retain your own copyright.** You keep ownership of your contribution and remain
   free to use it elsewhere; this CLA is a license grant to the owner, not an assignment
   of ownership.

5. **No warranty.** Your contribution is provided "as is", without warranty of any kind,
   to the extent permitted by law.

This arrangement (contributors grant the owner broad rights, including the right to
relicense) is what keeps the project both open to community contribution *and* free of
the "someone else can profit from my work" problem — outside contributions can't strip the
owner's ability to steer or commercialize the project, and the noncommercial license keeps
third parties from selling it.

If you are contributing on behalf of a company, you confirm you are authorized to agree to
this CLA on the company's behalf.
