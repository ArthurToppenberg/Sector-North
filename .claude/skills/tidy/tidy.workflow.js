export const meta = {
  name: 'tidy',
  description: 'Scoped, feature-clustered cleanup sweep of changed Sector North code',
  whenToUse: 'Invoked by the tidy skill after the main loop has computed the change set.',
  phases: [
    { title: 'Analyze', detail: 'cluster changed files into disjoint features' },
    { title: 'Refactor', detail: 'one agent per feature (SRP + fail-fast)', model: 'sonnet' },
    { title: 'Shared edits', detail: 'edit shared files in parallel with comment analysis', model: 'sonnet' },
    { title: 'Comments', detail: 'relocate module blocks to CLAUDE.md + strip valueless comments', model: 'sonnet' },
    { title: 'Typecheck', detail: 'single tsc --noEmit gate, fix once if needed', model: 'haiku' },
  ],
}

// ── Guardrails injected into every agent prompt (from repo + app CLAUDE.md) ──
const GUARDRAILS = `
- GPS is the source of truth. Never move lon/lat -> pixel logic out of src/map/project.ts.
  Entities keep real lon/lat alongside derived x/y.
- Fail fast, no fallbacks. This is the GOAL of the refactor, not just a constraint.
- Module boundary: src/map/ is pure TS (no Phaser); src/game/ does rendering/input. Do not cross it.
- HUD is white or black only (0xffffff / 0x000000). Map geography (coastline green 0x33ff66) is exempt.
- Camera bounds are LOCKED: do not touch ZOOM.min/max, CAMERA_CENTER_BOUNDS, or CameraController clamp logic.
- pnpm only. Never npm/yarn; never create package-lock.json/yarn.lock.
- Preserve observable game behavior. These are refactors + doc changes, not feature changes.
  If a genuine behavior change seems required, DO NOT guess — note it in your report and leave it.`.trim()

// ── Model tiers: spend the priciest model only where judgment is needed ──
// This workflow otherwise inherits the session model (often Opus + 1M ctx), which is far more
// than a scoped mechanical cleanup needs and is the dominant cost. Overriding is justified here
// because each agent's task shape is known — not the open-ended case where inheriting is safest.
//   FAST — pure command-runner / report agents (run tsc, read back ok/errors).
//   EDIT — scoped code + comment edits (refactor a cluster, merge given prose, delete listed lines).
//   Left inherited (strongest model): analyze:structure (clustering judgment) and docs:outline
//   (whole-repo staleness audit) — the two genuinely reasoning-heavy steps.
const FAST = { model: 'haiku', effort: 'low' }
const EDIT = { model: 'sonnet', effort: 'medium' }

// ── Schemas (structured agent output validated at the tool layer) ──
const CLUSTER_SCHEMA = {
  type: 'object', required: ['clusters'], additionalProperties: false,
  properties: {
    clusters: {
      type: 'array',
      items: {
        type: 'object', required: ['name', 'files', 'concerns'], additionalProperties: false,
        properties: {
          name: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          concerns: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    sharedFiles: {
      type: 'array',
      items: {
        type: 'object', required: ['path'], additionalProperties: false,
        properties: { path: { type: 'string' }, note: { type: 'string' } },
      },
    },
  },
}

const REFACTOR_SCHEMA = {
  type: 'object', required: ['changes', 'fallbacksRemoved'], additionalProperties: false,
  properties: {
    changes: { type: 'array', items: { type: 'string' } },
    fallbacksRemoved: { type: 'array', items: { type: 'string' } },
    leftAlone: { type: 'array', items: { type: 'string' } },
    sharedEdits: {
      type: 'array',
      items: {
        type: 'object', required: ['file', 'change'], additionalProperties: false,
        properties: { file: { type: 'string' }, change: { type: 'string' } },
      },
    },
  },
}

const PLAIN_SCHEMA = {
  type: 'object', required: ['summary'], additionalProperties: false,
  properties: { summary: { type: 'string' } },
}

const TYPECHECK_SCHEMA = {
  type: 'object', required: ['ok'], additionalProperties: false,
  properties: { ok: { type: 'boolean' }, errors: { type: 'string' } },
}

const COMMENTS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    relocations: {
      type: 'array',
      items: {
        type: 'object', required: ['file', 'target', 'section', 'substance'], additionalProperties: false,
        properties: {
          file: { type: 'string' },
          target: { type: 'string', enum: ['root CLAUDE.md', 'apps/game/CLAUDE.md'] },
          section: { type: 'string' },
          substance: { type: 'string' },
        },
      },
    },
    deletions: {
      type: 'array',
      items: {
        type: 'object', required: ['file', 'what'], additionalProperties: false,
        properties: { file: { type: 'string' }, what: { type: 'string' } },
      },
    },
  },
}

const DOC_OUTLINE_SCHEMA = {
  type: 'object', required: ['changes'], additionalProperties: false,
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object', required: ['file', 'action', 'detail'], additionalProperties: false,
        properties: {
          file: { type: 'string' },
          action: { type: 'string', enum: ['add', 'rewrite', 'remove'] },
          detail: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
}

// ── Inputs (computed by the main loop, passed verbatim) ──
// The runtime may hand `args` through as a JSON string rather than an object;
// parse that case so a stringified payload doesn't read as an empty change set.
const input = typeof args === 'string' ? JSON.parse(args) : args
if (!input || !Array.isArray(input.files) || input.files.length === 0) {
  throw new Error('tidy workflow requires args.files (non-empty). The change set was empty — nothing to tidy.')
}
const files = input.files
const baseRef = input.baseRef ?? null
const fileList = files.map((f) => '  - ' + f).join('\n')
const diffHint = baseRef
  ? `The relevant changes are the diff against ${baseRef}; run \`git diff ${baseRef} -- <file>\` to see exactly what changed.`
  : 'The relevant changes are uncommitted; run `git diff -- <file>` and `git diff --staged -- <file>` to see exactly what changed.'

// ── Phase A — analyze the change set into DISJOINT feature clusters ──
phase('Analyze')
const analysis = await agent(
  `You are the structure analyst for a SCOPED cleanup of the Sector North game (Phaser + TypeScript).
Scope = these changed files ONLY:\n${fileList}\n${diffHint}

Read each file and the imports it touches for context. Group the changed files into FEATURE CLUSTERS —
a cluster is the set of files implementing one concern (e.g. a "radar" cluster = src/map/radars.ts +
src/game/RadarLayer.ts + its config). Rules:
- Assign every changed file to EXACTLY ONE cluster. No two clusters may share a file.
- If a file is genuinely shared by multiple concerns (e.g. src/game/config.ts), put it in sharedFiles
  and do NOT place it in any cluster.
- For each cluster list the concrete cleanup concerns you can see: SRP violations, fallbacks to kill
  (try/catch-to-continue, ?? / || masking a missing value, null/undefined-as-failure, swallowed errors),
  dead code, loose types, on-screen magic numbers that belong in config, map/game boundary leaks.
Do NOT edit anything.
GUARDRAILS:\n${GUARDRAILS}`,
  { label: 'analyze:structure', phase: 'Analyze', schema: CLUSTER_SCHEMA }
)

const clusters = analysis.clusters ?? []
const sharedFiles = analysis.sharedFiles ?? []
if (clusters.length === 0) {
  throw new Error('Analyst produced no feature clusters from the change set; aborting rather than guessing.')
}
const sharedNames = sharedFiles.map((s) => s.path).join(', ') || 'none'
log(`Clustered ${files.length} changed file(s) into ${clusters.length} feature(s); shared files: ${sharedNames}`)

// ── Phase B — refactor each feature cluster in parallel (disjoint files => no write races) ──
phase('Refactor')
const refactorResults = (await parallel(
  clusters.map((c) => () =>
    agent(
      `You are refactoring the "${c.name}" feature of the Sector North game. You OWN these files and may
edit ONLY them:\n${c.files.map((f) => '  - ' + f).join('\n')}
${diffHint}
Stay TIGHTLY scoped: read the diff and the files you own — do not go spelunking through unrelated
modules or refactor code the recent changes did not touch. The changed lines are the target.
Priorities, in order:
1. FAIL-FAST (the point of this pass): eliminate every fallback the changes introduced. try/catch that
   only keeps going -> let it throw; ?? / || / defaults masking a missing input -> validate up front and
   throw with a clear message; null/undefined returned to signal failure -> throw an explicit Error;
   swallowed errors -> surface them.
2. Move on-screen magic numbers the changes touched into src/game/config.ts.
3. Only the obvious: dead code and stray \`any\` in the changed lines.
Known concerns from analysis: ${c.concerns.join('; ') || '(none flagged)'}.
If the cluster is already fail-fast and clean, SAY SO and make NO edits — do not invent refactors or
restructure for its own sake. Do NOT change observable game behavior. Do NOT edit files you don't own.
If a change genuinely requires editing a shared file (${sharedNames}), DO NOT edit it — describe the
needed edit in sharedEdits instead.
GUARDRAILS:\n${GUARDRAILS}
Report: changes made, every fallback removed (and what happens now instead), anything left alone + why,
and any sharedEdits.`,
      { label: `refactor:${c.name}`, phase: 'Refactor', schema: REFACTOR_SCHEMA, ...EDIT }
    ).then((r) => (r ? { ...r, cluster: c.name } : null))
  )
)).filter(Boolean)

// ── Phase B2 / C1 — shared-file edits run CONCURRENTLY with (read-only) comment analysis ──
// The shared-edit agent writes only shared files; comment analysis only READS cluster files.
// Disjoint file sets => safe to overlap, hiding the read-only pass behind the slower serial edit
// instead of stacking both on the critical path. (Typecheck moves to a single gate after Phase C.)
phase('Shared edits')
const sharedEdits = refactorResults.flatMap((r) => r.sharedEdits ?? [])
let sharedSummary = 'none'

const sharedRun = (async () => {
  if (sharedFiles.length && sharedEdits.length) {
    const applied = await agent(
      `Apply these requested edits to the SHARED files of the Sector North game. These files are shared
across feature clusters, so you are the ONLY writer — apply every edit coherently and resolve conflicts.
Shared files:\n${sharedFiles.map((s) => '  - ' + s.path + (s.note ? ' (' + s.note + ')' : '')).join('\n')}
Requested edits:\n${sharedEdits.map((e, i) => `  ${i + 1}. [${e.file}] ${e.change}`).join('\n')}
Honor fail-fast (no fallbacks) and keep observable behavior unchanged.
GUARDRAILS:\n${GUARDRAILS}
Report a concise summary of what you changed.`,
      { label: 'refactor:shared', phase: 'Shared edits', schema: PLAIN_SCHEMA, ...EDIT }
    )
    sharedSummary = applied?.summary ?? 'applied'
  } else {
    log('No shared-file edits requested.')
  }
})()

const commentAnalysisRun = parallel(
  clusters.map((c) => () =>
    agent(
      `Read these files of the Sector North game and identify comment cleanup — do NOT edit:
${c.files.map((f) => '  - ' + f).join('\n')}
Classify comments:
1. RELOCATE — top-of-file / module blocks explaining architecture, rationale, or a design decision.
   These belong in a CLAUDE.md. Say which (target: "root CLAUDE.md" for project-wide rules,
   "apps/game/CLAUDE.md" for app conventions), which section, and the substance to fold in.
2. DELETE — valueless comments: restate-the-code, stale/obsolete, commented-out code, redundant JSDoc.
3. KEEP — short inline "why" notes that only make sense next to their line. (Do not report these.)
Return relocations and deletions.`,
      { label: `comments:${c.name}`, phase: 'Comments', schema: COMMENTS_SCHEMA, ...EDIT }
    ).then((a) => (a ? { ...a, cluster: c.name } : null))
  )
)

const [, commentAnalysesRaw] = await Promise.all([sharedRun, commentAnalysisRun])
const commentAnalyses = commentAnalysesRaw.filter(Boolean)

// ── Phase C2 — fold relocated blocks into CLAUDE.md and strip source comments CONCURRENTLY ──
// docs:claude-md writes only CLAUDE.md; each strip:* edits only its own cluster's source files —
// all disjoint, so the doc write and the strips run together.
phase('Comments')
const relocations = commentAnalyses.flatMap((a) => a.relocations ?? [])
const docsWrite = relocations.length
  ? agent(
      `Fold these relocated comment blocks into the Sector North CLAUDE.md files. You are the ONLY writer of
CLAUDE.md — apply all coherently, MERGING into existing sections (do not dump raw, do not duplicate).
Relocations:\n${relocations
        .map((r, i) => `  ${i + 1}. target=${r.target} · section="${r.section}" · from=${r.file}\n       ${r.substance}`)
        .join('\n')}
Report a concise summary of what you added and where.`,
      { label: 'docs:claude-md', phase: 'Comments', schema: PLAIN_SCHEMA, ...EDIT }
    )
  : Promise.resolve(null)

const stripRun = parallel(
  clusters
    .map((c) => {
      const mine = commentAnalyses.find((a) => a.cluster === c.name)
      const dels = mine?.deletions ?? []
      const relo = mine?.relocations ?? []
      if (!dels.length && !relo.length) return null
      return () =>
        agent(
          `In the Sector North game, edit ONLY these files: ${c.files.join(', ')}.
Remove the top-of-file blocks whose substance was relocated to CLAUDE.md, and delete the valueless
comments listed. Keep short inline "why" notes. Do not change any code behavior. These are comment-only
edits — do NOT run tsc yourself; a single typecheck gate runs after this phase.
Relocated blocks to remove (by file): ${relo.map((r) => r.file).join(', ') || 'none'}
Comments to delete:\n${dels.map((d) => `  - [${d.file}] ${d.what}`).join('\n') || '  (none)'}`,
          { label: `strip:${c.name}`, phase: 'Comments', ...EDIT }
        )
    })
    .filter(Boolean)
)

await Promise.all([docsWrite, stripRun])

// ── Phase B3 — ONE typecheck gate covering refactor + shared + strip edits; fix once if it fails ──
phase('Typecheck')
let typecheck = await agent(
  'Run `pnpm --filter sector-north-game exec tsc --noEmit` (or `pnpm exec tsc --noEmit` inside apps/game). ' +
    'Report ok:true if clean, else ok:false with the raw error lines in errors.',
  { label: 'typecheck', phase: 'Typecheck', schema: TYPECHECK_SCHEMA, ...FAST }
)
if (!typecheck.ok) {
  log('Typecheck failed — dispatching a fix.')
  await agent(
    `The Sector North typecheck failed after the cleanup. Fix the type errors WITHOUT changing observable
behavior and WITHOUT reintroducing any fallback. Errors:\n${typecheck.errors ?? '(see tsc output)'}
GUARDRAILS:\n${GUARDRAILS}`,
    { label: 'typecheck:fix', phase: 'Typecheck', ...EDIT }
  )
  typecheck = await agent(
    'Re-run `pnpm --filter sector-north-game exec tsc --noEmit`. Report ok + any remaining error lines.',
    { label: 'typecheck:recheck', phase: 'Typecheck', schema: TYPECHECK_SCHEMA, ...FAST }
  )
}

// ── Phase D — build the Part 3 documentation outline. NO edits: the main loop gates it. ──
const docOutline = await agent(
  `Review the Sector North docs — both CLAUDE.md files, apps/game/src/data/borders/readme.md, any README
and top-level docs — against the code as it stands AFTER this cleanup of: ${files.join(', ')}.
Find stale statements, gaps, duplication, and anything the refactor or comment relocation made inaccurate.
Return a concrete list of proposed doc changes (per file: action add/rewrite/remove, the detail, and why).
Do NOT edit anything — this is a proposal the user will approve or reject.`,
  { label: 'docs:outline', phase: 'Comments', schema: DOC_OUTLINE_SCHEMA }
)

// ── Compact return value — the ONLY thing that reaches the main context ──
return {
  scope: { files, base: baseRef ?? 'working-tree' },
  clusters: clusters.map((c) => ({ name: c.name, files: c.files })),
  refactor: refactorResults.map((r) => ({
    cluster: r.cluster,
    changes: r.changes,
    fallbacksRemoved: r.fallbacksRemoved,
  })),
  sharedEdits: sharedSummary,
  typecheck,
  comments: {
    relocated: relocations.length,
    deleted: commentAnalyses.reduce((n, a) => n + (a.deletions?.length ?? 0), 0),
  },
  part3Outline: docOutline.changes,
}
