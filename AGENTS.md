# AGENTS.md

Rules for any agent or human working in this repo. These are not suggestions.

## Commits

**Micro-commits. Always.**

- **One commit per working increment.** If it runs and it is better than before, commit it
- **Never batch.** Two unrelated changes are two commits, even when they took two minutes
- **Commit before starting the next thing**, not after finishing three things
- Each commit must be **independently revertible**. If reverting it would break something unrelated, it was too big
- Message format: `<area>: <what changed and why>` - the *why* is the part that matters
- Straight onto `main`. No branches, no PRs

The git history is a deliverable. It should read as a sequence of decisions, not a single dump.

## Scope

- **`docs/SCOPE.md` is the contract.** Check any proposed work against it before starting
- Green is in scope, amber is stretch, grey is deliberately excluded. **Do not build grey**
- If something is not in scope and seems necessary, say so and stop. Do not quietly widen the work
- **What was skipped is as important as what was built.** An exclusion only counts if it is named

## Decisions

- **Record rationale in `docs/DECISIONS.md` as decisions are made**, never afterwards
- Each entry: what was decided, why, what was rejected, and how reversible it is
- **Let reversibility set the deliberation.** Cheap decisions get seconds. Expensive ones get thought
- A decision written three hours later is a reconstruction, not a record

## Boundaries

- **`_context/` is local working material and is git-excluded.** Never commit it, never reference it from tracked files
- Secrets live in `.env` - the only one. Read server-side only. **Never `NEXT_PUBLIC_`**
- `docs/` is what a reader outside this project sees. Keep it that way

## Building

- The **adapter** is the only module that knows the external API's payload shape. Keep it that way
- **No database.** State belongs to the platform - see `DECISIONS.md` D2
- Model the domain the way the API does. Parallel names create translation work
- Prefer the boring thing that ships over the elegant thing that might

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
