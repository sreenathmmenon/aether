import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { Pool } from "pg";

type PersistedWorkspace = {
  workspace?: { id?: string; persistenceVersion?: number };
  branches?: unknown;
  revisions?: unknown;
  audit?: unknown;
  simulations?: unknown;
};

const databaseUrl = process.env.DATABASE_URL;
const webMcpOriginTrialToken = process.env.WEBMCP_ORIGIN_TRIAL_TOKEN;
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : undefined;
let storageReady: Promise<void> | undefined;

async function ensureStorage() {
  if (!pool) return false;
  storageReady ??= pool
    .query(
      `
      CREATE TABLE IF NOT EXISTS aether_workspaces (
        id TEXT PRIMARY KEY,
        state JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    )
    .then(() => undefined);
  await storageReady;
  return true;
}

function isWorkspace(value: unknown): value is PersistedWorkspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedWorkspace;
  return Boolean(
    candidate.workspace?.id &&
    candidate.branches &&
    candidate.revisions &&
    candidate.audit &&
    candidate.simulations,
  );
}

const app = new Hono();

app.use("*", async (context, next) => {
  context.header("Cross-Origin-Opener-Policy", "same-origin");
  context.header("Cross-Origin-Embedder-Policy", "require-corp");
  context.header("Permissions-Policy", "tools=(self)");
  if (webMcpOriginTrialToken)
    context.header("Origin-Trial", webMcpOriginTrialToken);
  context.header("X-Content-Type-Options", "nosniff");
  await next();
});

app.get("/health", async (context) => {
  try {
    const persistent = await ensureStorage();
    if (persistent) await pool!.query("SELECT 1");
    return context.json({
      status: "ok",
      service: "aether",
      persistence: persistent ? "postgres" : "local-fallback",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return context.json(
      { status: "degraded", service: "aether", persistence: "unavailable" },
      503,
    );
  }
});

app.get("/api/workspaces/:id", async (context) => {
  if (!(await ensureStorage()))
    return context.json({ error: "PERSISTENCE_UNAVAILABLE" }, 503);
  const result = await pool!.query<{
    state: PersistedWorkspace;
    version: number;
  }>("SELECT state, version FROM aether_workspaces WHERE id = $1", [
    context.req.param("id"),
  ]);
  const row = result.rows[0];
  if (!row) return context.json({ error: "NOT_FOUND" }, 404);
  return context.json({
    state: {
      ...row.state,
      workspace: { ...row.state.workspace, persistenceVersion: row.version },
    },
  });
});

app.put("/api/workspaces/:id", async (context) => {
  if (!(await ensureStorage()))
    return context.json({ error: "PERSISTENCE_UNAVAILABLE" }, 503);
  const body = (await context.req.json()) as {
    state?: unknown;
    expectedVersion?: unknown;
  };
  if (!isWorkspace(body.state) || !Number.isInteger(body.expectedVersion))
    return context.json({ error: "INVALID_INPUT" }, 400);
  const id = context.req.param("id");
  if (body.state.workspace?.id !== "workspace-payment")
    return context.json({ error: "INVALID_WORKSPACE" }, 400);
  const version = Number(body.expectedVersion);
  const saved = await pool!.query<{ version: number }>(
    `INSERT INTO aether_workspaces (id, state, version)
       VALUES ($1, $2::jsonb, 1)
     ON CONFLICT (id) DO UPDATE
       SET state = EXCLUDED.state, version = aether_workspaces.version + 1, updated_at = NOW()
       WHERE aether_workspaces.version = $3
     RETURNING version`,
    [id, JSON.stringify(body.state), version],
  );
  if (!saved.rows[0]) return context.json({ error: "STALE_WORKSPACE" }, 409);
  return context.json({ version: saved.rows[0].version });
});

app.get("/robots.txt", (context) =>
  context.text("User-agent: *\nAllow: /\n", 200, {
    "Content-Type": "text/plain; charset=utf-8",
  }),
);

app.get("/llms.txt", (context) =>
  context.text(
    "# Aether\n\nEvidence-first counterfactual architecture laboratory.\n\n- [Product overview](https://github.com/sreenathmmmenon/aether)\n",
    200,
    { "Content-Type": "text/plain; charset=utf-8" },
  ),
);

app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("*", serveStatic({ root: "./dist", path: "index.html" }));

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Aether listening on http://localhost:${info.port}`);
});
