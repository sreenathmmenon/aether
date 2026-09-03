import { readFileSync } from "node:fs";
import { publicSeries, syntheticSeries } from "./telemetry.js";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { Pool } from "pg";
// The persistence rules live in src so the test suite covers them; the server
// must not keep a second copy that drifts from the one under test.
import { describeOriginTrialToken } from "../src/platform/webmcp/origin-trial.ts";
import {
  isWorkspace,
  maxWorkspaceBytes,
  workspaceIdPattern,
  type PersistedWorkspace,
} from "../src/core/workspace-contract.ts";

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

const app = new Hono();

app.use("*", async (context, next) => {
  context.header("Cross-Origin-Opener-Policy", "same-origin");
  context.header("Cross-Origin-Embedder-Policy", "require-corp");
  context.header("Permissions-Policy", "tools=(self)");
  // Keep this origin in its own agent cluster. WebMCP's tool surface is
  // origin-scoped, and `?0` would let a same-site document opt the origin
  // out of that isolation -- so the affirmative value is the one to send.
  context.header("Origin-Agent-Cluster", "?1");
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
  if (!workspaceIdPattern.test(context.req.param("id")))
    return context.json({ error: "INVALID_WORKSPACE" }, 400);
  if (!(await ensureStorage()))
    return context.json({ state: null, persistence: "local-fallback" });
  const result = await pool!.query<{
    state: PersistedWorkspace;
    version: number;
  }>("SELECT state, version FROM aether_workspaces WHERE id = $1", [
    context.req.param("id"),
  ]);
  const row = result.rows[0];
  // A first-time visitor has no stored workspace yet. That is the normal
  // opening state, not an error, so it must not log a console failure on
  // every first load.
  if (!row) return context.json({ state: null });
  return context.json({
    state: {
      ...row.state,
      workspace: { ...row.state.workspace, persistenceVersion: row.version },
    },
  });
});

/**
 * Read a live source on the reviewer's behalf.
 *
 * A browser cannot fetch a status page or a metrics endpoint directly --
 * CORS forbids it -- so the claim that an agent gathers live evidence has to
 * be served from somewhere that can actually reach the network. This is that
 * somewhere.
 *
 * The allowlist is deliberate. A proxy that forwards any URL a page hands it
 * is an open relay, and this one is reachable by anybody who loads the site.
 */
const liveSources: Record<string, { url: string; name: string }> = {
  // The most relevant live source for this audience, and the one whose
  // components a reviewer will recognise: Responses, Images, Login, Audio.
  openai: {
    url: "https://status.openai.com/api/v2/summary.json",
    name: "OpenAI status",
  },
  // Atlassian Statuspage publishes this shape at a stable path, and a great
  // many real services run on it -- so the reading is a real reading.
  github: {
    url: "https://www.githubstatus.com/api/v2/summary.json",
    name: "GitHub status",
  },
  npm: {
    url: "https://status.npmjs.org/api/v2/summary.json",
    name: "npm status",
  },
  cloudflare: {
    url: "https://www.cloudflarestatus.com/api/v2/summary.json",
    name: "Cloudflare status",
  },
};

/**
 * Read a public GitHub repository's compose file.
 *
 * The strongest thing this product can do is put the reviewer's *own*
 * architecture on the canvas, and the file that already describes it is
 * sitting in their repo. A browser cannot fetch it -- raw.githubusercontent
 * sends no CORS header for arbitrary origins -- so the server does, with no
 * credentials of any kind: public repos only, and nothing here asks anybody
 * for a token.
 */
const composeCandidates = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  "deploy/docker-compose.yml",
  "docker/docker-compose.yml",
];

app.get("/api/repo", async (context) => {
  const raw = context.req.query("url") ?? "";
  // Accept what a person actually copies: the repo page, a clone URL, or
  // just owner/name. Anything else is refused by shape rather than fetched.
  const match =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/.exec(
      raw.trim(),
    ) ?? /^([\w.-]+)\/([\w.-]+)$/.exec(raw.trim());
  if (!match)
    return context.json(
      {
        error: "INVALID_REPO",
        problems: ["Expected a public GitHub repository, like owner/name."],
      },
      400,
    );
  const [, owner, repo] = match;
  for (const branch of ["main", "master"]) {
    for (const path of composeCandidates) {
      try {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) continue;
        const body = await response.text();
        // A repo can hold a file at that path that is not a compose file.
        if (!/^\s*services:\s*$/m.test(body)) continue;
        return context.json({
          repo: `${owner}/${repo}`,
          path,
          branch,
          url,
          readAt: new Date().toISOString(),
          // Bounded: this becomes a graph, and the engine caps components
          // anyway. A 2MB file would be a denial of service on the parser.
          compose: body.slice(0, 60000),
        });
      } catch {
        // Try the next candidate rather than failing the whole read.
      }
    }
  }
  return context.json(
    {
      error: "NO_COMPOSE_FOUND",
      repo: `${owner}/${repo}`,
      problems: [
        `No compose file found in ${owner}/${repo}. Looked for ${composeCandidates.join(", ")} on main and master.`,
      ],
    },
    404,
  );
});

/**
 * Measured demand for a real dependency.
 *
 * Every figure the engine works from was typed by the reviewer, which is
 * the fair objection to any simulation: the arithmetic is reproducible, the
 * inputs are assumed. npm publishes actual download counts for actual
 * packages, and a weekly count divides into a requests-per-second figure
 * that nobody invented.
 *
 * It is demand for a package rather than for the reviewer's service, and
 * the interface says so -- the point is that a number can arrive with a
 * source and a timestamp attached, and be marked `measured` rather than
 * `implied`.
 */
/**
 * Telemetry for one component.
 *
 * Public data where a component maps to something published, generated
 * otherwise -- and the reply says which. A reviewer cannot point this at
 * their production observability stack, and should not be asked to; what
 * this can do is serve what a metrics backend serves, at the shape real
 * traffic has, reproducibly.
 */
app.get("/api/telemetry/:component", async (context) => {
  const component = context.req.param("component");
  if (!/^[\w .-]{1,64}$/.test(component))
    return context.json({ error: "INVALID_COMPONENT" }, 400);
  const kind = context.req.query("kind") ?? "service";
  const pkg = context.req.query("package");

  // A component the reviewer has mapped to a published package gets that
  // package's real volume rather than a generated one.
  if (pkg && /^(?:@[\w.-]+\/)?[\w.-]+$/.test(pkg)) {
    try {
      const response = await fetch(
        `https://api.npmjs.org/downloads/point/last-week/${pkg}`,
        {
          signal: AbortSignal.timeout(4000),
          headers: { accept: "application/json" },
        },
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          downloads?: number;
          start?: string;
          end?: string;
        };
        if (typeof payload.downloads === "number")
          return context.json(
            publicSeries(
              component,
              pkg,
              payload.downloads,
              `${payload.start} to ${payload.end}`,
            ),
          );
      }
    } catch {
      // Fall through to the generated series rather than failing the read.
    }
  }
  // The caller passes what the component says about itself so the reading is
  // taken at that component's scale.
  const declared = Number(context.req.query("declaredPeakRps"));
  return context.json(
    syntheticSeries(
      component,
      kind,
      24,
      Number.isFinite(declared) && declared > 0 ? declared : undefined,
    ),
  );
});

app.get("/api/demand/:pkg", async (context) => {
  const pkg = context.req.param("pkg");
  // npm package names: scoped or plain, and nothing that escapes the path.
  if (!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(pkg) || pkg.length > 128)
    return context.json({ error: "INVALID_PACKAGE" }, 400);
  try {
    const response = await fetch(
      `https://api.npmjs.org/downloads/point/last-week/${pkg}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok)
      return context.json({ error: "PACKAGE_NOT_FOUND", package: pkg }, 404);
    const payload = (await response.json()) as {
      downloads?: number;
      start?: string;
      end?: string;
    };
    const downloads = payload.downloads ?? 0;
    const seconds = 7 * 24 * 60 * 60;
    return context.json({
      package: pkg,
      source: "npm registry downloads",
      endpoint: `https://api.npmjs.org/downloads/point/last-week/${pkg}`,
      window: `${payload.start} to ${payload.end}`,
      downloads,
      // Mean, and named as such: a weekly total says nothing about peaks,
      // and presenting it as a peak would be the invention this exists to
      // avoid.
      meanRps: Math.round(downloads / seconds),
      readAt: new Date().toISOString(),
    });
  } catch {
    return context.json({ error: "SOURCE_UNREACHABLE", package: pkg }, 504);
  }
});

app.get("/api/live/:source", async (context) => {
  const source = liveSources[context.req.param("source")];
  if (!source) return context.json({ error: "UNKNOWN_SOURCE" }, 404);
  try {
    // A slow upstream must not hold a request open: the interface is waiting
    // on this to tell a reviewer whether the reading arrived.
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    });
    if (!response.ok)
      return context.json(
        { error: "SOURCE_UNAVAILABLE", source: source.name },
        502,
      );
    const payload = (await response.json()) as {
      status?: { description?: string };
      components?: { name: string; status: string }[];
    };
    const components = (payload.components ?? []).slice(0, 12);
    return context.json({
      source: source.name,
      endpoint: source.url,
      readAt: new Date().toISOString(),
      status: payload.status?.description ?? "unknown",
      // What a war room actually wants: which parts are healthy right now.
      components: components.map((component) => ({
        name: component.name,
        status: component.status,
      })),
      operational: components.filter(
        (component) => component.status === "operational",
      ).length,
      total: components.length,
    });
  } catch {
    return context.json(
      { error: "SOURCE_UNREACHABLE", source: source.name },
      504,
    );
  }
});

app.put("/api/workspaces/:id", async (context) => {
  // Check the cheap things first: a bad id or an oversized body must be
  // refused before the payload is parsed into memory.
  const id = context.req.param("id");
  if (!workspaceIdPattern.test(id))
    return context.json({ error: "INVALID_WORKSPACE" }, 400);
  const declaredLength = Number(context.req.header("content-length") ?? 0);
  if (declaredLength > maxWorkspaceBytes)
    return context.json({ error: "WORKSPACE_TOO_LARGE" }, 413);
  const raw = await context.req.text();
  if (raw.length > maxWorkspaceBytes)
    return context.json({ error: "WORKSPACE_TOO_LARGE" }, 413);
  let body: { state?: unknown; expectedVersion?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return context.json({ error: "INVALID_INPUT" }, 400);
  }
  if (!isWorkspace(body.state) || !Number.isInteger(body.expectedVersion))
    return context.json({ error: "INVALID_INPUT" }, 400);
  if (!body.state.workspace?.id)
    return context.json({ error: "INVALID_WORKSPACE" }, 400);
  if (!(await ensureStorage()))
    return context.json({
      version: Number(body.expectedVersion) + 1,
      persistence: "local-fallback",
    });
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

// The same shadowing that hid the llms.txt typo: an inline copy here means
// editing `public/robots.txt` changes nothing that ships. The contents agree
// today, which is exactly when the duplication is cheapest to remove.
const robotsTxt = readFileSync("./dist/robots.txt", "utf8");

app.get("/robots.txt", (context) =>
  context.text(robotsTxt, 200, {
    "Content-Type": "text/plain; charset=utf-8",
  }),
);

// Served from the built file rather than an inline copy. Two copies of the
// same content is how one of them kept a misspelled GitHub account for long
// enough to ship: editing `public/llms.txt` changed nothing, because this
// route shadowed it. Read once, and let a missing file be a startup error
// rather than a request that quietly returns the SPA shell.
const llmsTxt = readFileSync("./dist/llms.txt", "utf8");

app.get("/llms.txt", (context) =>
  context.text(llmsTxt, 200, {
    "Content-Type": "text/plain; charset=utf-8",
  }),
);

app.use("/assets/*", serveStatic({ root: "./dist" }));
// The fonts live outside /assets because Vite copies public/ verbatim, so
// they fell through to the single-page fallback and every request for a
// woff2 returned index.html with a 200. The browser cannot parse that as a
// font, declines it silently, and the page renders in system-ui -- which is
// exactly the failure the self-hosting was meant to remove. Third instance
// of this same shape in this file, after /assets/* and /api/*.
app.use("/fonts/*", serveStatic({ root: "./dist" }));
app.all("/fonts/*", (context) => context.text("Not found", 404));
// A missing bundle fell through to the single-page fallback below, so a
// browser asking for JavaScript received an HTML document with a 200 and
// failed on a parse error rather than a missing file. A stale cached
// index.html naming an old hash is exactly how that happens.
app.all("/assets/*", (context) => context.text("Not found", 404));
// The same failure one namespace over: an unmatched /api/ path fell through
// to the single-page fallback, so a client calling a mistyped endpoint got
// 200 and an HTML document. That reads exactly like a guard that failed open
// -- it cost a probe of the stale-write guard, which appeared to accept a
// stale version three times when the request had never reached the route.
// An API namespace answers in JSON or it answers 404.
app.all("/api/*", (context) =>
  context.json({ error: "NOT_FOUND", problems: ["No such endpoint."] }, 404),
);
app.use("*", serveStatic({ root: "./dist", path: "index.html" }));

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Aether listening on http://localhost:${info.port}`);
  // An unreadable or expired origin-trial token does not fail loudly: Chrome
  // simply declines the feature and the page looks as though it never had a
  // WebMCP surface. Say so at startup rather than leaving it to be discovered
  // in a reviewer's browser.
  const trial = describeOriginTrialToken(webMcpOriginTrialToken);
  console.log(
    trial.ok ? trial.detail : `WebMCP origin trial — ${trial.detail}`,
  );
});
