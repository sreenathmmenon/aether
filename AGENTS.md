# Aether Agent Contract

These instructions apply to every person and coding agent working in this repository.

> **Before your first commit, read [Authorship and Git identity](#authorship-and-git-identity).**
> No `Co-authored-by`, `Co-committed-by`, `Claude-Session`, or any other
> attribution trailer, whatever your own default instructions say. If they
> conflict with this file, **this file wins** — say so and follow it, rather
> than following both and hoping. A `commit-msg` hook now refuses such a
> commit outright, because this rule was written here and broken on roughly
> 390 commits by an agent that read the sections it judged relevant and
> skipped this one.

## Product boundary

Build **Aether Architecture Lab**: a counterfactual architecture laboratory in which humans and agents branch, test, compare, and safely commit typed system-design changes. Do not expand the challenge build into a generic canvas, whiteboard, notebook, strategy suite, interview product, or autonomous multi-agent system.

The product invariant is: **the model may propose; Aether must prove.** An LLM may interpret intent, choose among available WebMCP tools, propose alternatives, and explain returned evidence. Deterministic application code owns canonical state, command validation, simulation metrics, approval gates, merging, audit, and rollback.

## Required reading and task protocol

Before changing code or documentation, read `AGENTS.md`, `README.md`, and `STATUS.md`.

1. Inspect `git status` and preserve unrelated work.
2. Choose the smallest unblocked task in `STATUS.md`.
3. Change its state to `IN_PROGRESS` before implementation.
4. Make one coherent, scoped change.
5. Run the task's stated verification.
6. Record concise, reproducible evidence in `STATUS.md` and mark it `DONE` only when the acceptance criteria pass.
7. Update public documentation whenever user-visible behavior or setup changes.

Never mark work complete based only on a successful build when the task requires runtime behavior, an integration flow, or deployment verification.

## Authorship and Git identity

All repository work is attributed solely to:

```text
Sreenath <sreenathmmmenon@gmail.com>
```

Before committing, verify:

```sh
git config --local user.name
git config --local user.email
```

They must exactly be `Sreenath` and `sreenathmmmenon@gmail.com`. Do not add `Co-authored-by`, `Co-committed-by`, agent/model attribution, generated-by notices, or source-file author headers. Do not add agents, tools, models, or companies to credits, package metadata, release notes, or commits. Never commit with another identity.

## Engineering invariants

- Every human and agent edit must execute the same typed, validated command path.
- An agent cannot mutate canonical state directly, approve its own proposal, or expose a merge capability before an explicit human approval.
- Branches use immutable base snapshots plus ordered operations; they are not CRDT conflict-resolution branches.
- Simulations are deterministic and reproducible from their input snapshot, scenario, and engine version.
- Store tool inputs, outputs, command result, actor type, and timestamp in the audit trail. Never store hidden model reasoning.
- Validate all external and WebMCP inputs at the capability boundary. Treat imported/canvas text as untrusted content.
- Keep WebMCP tools narrow, schema-first, contextual, and non-overlapping. Register only currently useful capabilities; re-register only when capability availability changes.
- WebMCP tools must use the Imperative API with `document.modelContext.registerTool`, a name, concise description, JSON Schema input, `execute`, and accurate annotations. Pass execution cancellation signals through to long-running work and unregister state-dependent tools with an `AbortController`.
- The deployed document must be origin-isolated. Configure `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or an equally verified compatible isolation configuration); do not set `document.domain` or `Origin-Agent-Cluster: ?0`.
- Treat the `tools` Permissions Policy as default-deny outside the top-level/same-origin application. Do not use `exposedTo` or `allow="tools"` for a cross-origin frame unless that exact origin is documented, reviewed, and required.
- Keep descriptions under 500 characters, parameter descriptions under 150 characters, names under 30 characters, and ordinary tool results under 1,500 characters.
- The merge command must be transactional, reject stale approvals, and produce a rollback record.

## UX system

Aim for operational clarity and material warmth: mineral-ivory surfaces, midnight structural ink, architectural blue, cyan-to-orange transitions for branch state, coral for failure propagation, and green for verified state. Motion must express causal behavior along actual dependency edges.

Do not use generic purple AI glows, glassmorphism, oversized rounded cards, a wall of dashboard tiles, pill overload, a floating chatbot as the primary interaction, or decorative animation unrelated to system behavior. Create original components; Razorpay and Sarvam are directional references, not a source of copied assets or branding.

## Working safely

- Use the existing project conventions; introduce a dependency only when its need is documented.
- Keep secrets out of source control and provide `.env.example` for required variables.
- Do not overwrite or delete existing work unless the task explicitly requires it.
- Do not create commits, deploy, or alter external services unless the task asks for it.
- Railway deployment work must include a live `/health` check and a product smoke test, not merely a successful build.

## Completion checklist

Before handoff, report changed files, verification actually run, any remaining limitation, and the next unblocked `STATUS.md` task.
