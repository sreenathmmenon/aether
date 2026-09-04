# Aether Judge-Council Product Review

> **Internal working record.** This is our own critique process — a way of
> finding defects before a reviewer does, by arguing with the product from
> several professional angles. The ratings in it are self-assessments used to
> decide what to fix next. They are not an evaluation by anybody outside this
> project, they carry no external authority, and nothing here belongs in a
> submission or in any material shown to actual judges.

Date: 2026-09-03

This review uses the official WebMCP Challenge lenses: WebMCP leverage,
execution, potential impact, and creativity/ambition. The named perspectives
below are not quotes from the judges; they are product-review lenses based on
their published roles on the challenge page.

## Round 1 — What would keep Aether below 10?

| Lens                                | Concern                                                        | Product answer after hardening                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare / applied infrastructure | Is it deployable and resilient, or only a local demo?          | Railway production is live with PostgreSQL persistence, size-bounded workspaces, stale-write refusal, and live `/health`.            |
| MCP-B / protocol design             | Are tools semantic and bounded, or a disguised UI macro layer? | Tools are typed, state-dependent, schema-first, and route through the same command path as human actions.                            |
| Shopify / real commerce systems     | Does it solve a real operator problem?                         | It models architectural futures, capacity, cost, failure propagation, approval state, and rollback as one auditable decision object. |
| Vercel / product execution          | Can a cold user understand and run it?                         | The page opens on a concrete failure, names the safe next step, exposes worked systems, and supports a self-built architecture path. |
| OpenAI / human-agent experience     | Can a human and agent work in the same live state?             | WebMCP calls, resident-agent calls, human notes, branch changes, simulations, approvals, and merges all land in the same record.     |
| Chrome / standards and security     | Does it respect trust boundaries?                              | COOP/COEP, `tools=(self)`, Origin-Trial, 1,500-character tool results, untrusted-content hints, and no approve/merge/rollback tools. |
| Netlify / agent-ready app pattern   | Does the experience become better because an agent is present? | The agent can inspect, measure, read live status, build/repair through tools, and still hits the human-only approval boundary.       |

Round-1 defect found: the resident-agent proof path claimed to help reviewers
without an external WebMCP client, but the opening control was disabled when
`document.modelContext` was unavailable.

## Round 2 — Fix required for a 10/10 product posture

The page must not pretend WebMCP exists when it does not. But it should still
let a reviewer watch the same tool contracts and guardrails execute through an
in-page agent. This closes the execution/impact gap without weakening the
protocol claim:

- external WebMCP availability remains truthfully reported;
- the resident agent uses a local registration context only inside the page;
- the same registered tool objects, schemas, wrappers, command path, and
  refusal behavior are used;
- the interface says "no external agent detected" when that is the truth.

## Council ratings after the fix

| Category                                        |   Rating |
| ----------------------------------------------- | -------: |
| WebMCP leverage                                 | 9.9 / 10 |
| Execution                                       | 9.9 / 10 |
| Potential impact                                | 9.8 / 10 |
| Creativity and ambition                         | 9.8 / 10 |
| Human-agent collaboration                       | 9.9 / 10 |
| Standards/security posture                      | 9.9 / 10 |
| Overall product readiness before demo packaging | 9.9 / 10 |

The remaining 0.1 is not a known implementation defect. It is uncertainty that
belongs to live judging: different judges weight product category, taste, and
submission storytelling differently. The implementation no longer has a known
product-readiness issue that should be fixed before recording.
