import {
  briefComponentLimit,
  type BriefComponent,
  type BriefComponentKind,
  type ParsedBrief,
} from "./brief-parser";

/**
 * Read a `docker-compose.yml` into the same shape a prose brief produces.
 *
 * The product could model any architecture a person could describe, which is
 * a fair demand to make of a reviewer with sixty seconds. It could not read
 * the file that already describes their system -- so what it modelled was
 * always a fixture or a sentence, never the thing they run.
 *
 * This is deliberately not a YAML parser. Compose files are indented
 * key/value with a handful of shapes that matter here, and a dependency-free
 * reader that understands exactly those shapes cannot fail on syntax it was
 * never going to use.
 */

/**
 * What a service is, inferred from its image. A compose file names the thing
 * it runs -- `postgres:16`, `redis:7` -- and that name is a better signal
 * than anything else in the file.
 */
const imageKinds: [RegExp, BriefComponentKind][] = [
  [
    /postgres|mysql|mariadb|mongo|cockroach|cassandra|dynamo|sqlite/i,
    "database",
  ],
  [/redis|memcached|elasticsearch|opensearch|clickhouse/i, "database"],
  [/kafka|rabbitmq|nats|pulsar|sqs|redpanda|zookeeper/i, "queue"],
  [/nginx|traefik|envoy|haproxy|caddy|kong|gateway|ingress/i, "gateway"],
];

export function kindForImage(image: string, name: string): BriefComponentKind {
  for (const [pattern, kind] of imageKinds)
    if (pattern.test(image) || pattern.test(name)) return kind;
  return "service";
}

/** A compose service, before it becomes a component. */
type ComposeService = {
  name: string;
  image: string;
  dependsOn: string[];
  ports: number;
};

/**
 * Compose indentation is the structure, so the reader tracks it directly:
 * two levels under `services:` is a service name, three is one of its keys.
 */
export function readComposeServices(source: string): ComposeService[] {
  const lines = source.split("\n");
  const services: ComposeService[] = [];
  let inServices = false;
  let serviceIndent = -1;
  let current: ComposeService | undefined;
  let listKey = "";

  const indentOf = (line: string) => line.length - line.trimStart().length;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const indent = indentOf(line);
    const text = line.trim();

    if (/^services:\s*$/.test(text)) {
      inServices = true;
      serviceIndent = -1;
      continue;
    }
    if (!inServices) continue;
    // A top-level key that is not `services:` ends the block.
    if (indent === 0 && !/^services:/.test(text)) {
      inServices = false;
      continue;
    }

    if (serviceIndent === -1) serviceIndent = indent;

    if (indent === serviceIndent && /^[\w.-]+:\s*$/.test(text)) {
      current = {
        name: text.replace(/:$/, ""),
        image: "",
        dependsOn: [],
        ports: 0,
      };
      services.push(current);
      listKey = "";
      continue;
    }
    if (!current) continue;

    // A list item belongs to whichever key opened the list.
    if (text.startsWith("- ")) {
      const value = text
        .slice(2)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (listKey === "depends_on")
        current.dependsOn.push(value.replace(/:$/, ""));
      if (listKey === "ports") current.ports += 1;
      continue;
    }

    const [key, ...rest] = text.split(":");
    const value = rest
      .join(":")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key === "image") current.image = value;
    else if (key === "depends_on" || key === "ports") {
      listKey = key;
      // `depends_on: [a, b]` is as common as the block form.
      if (value.startsWith("[")) {
        const inline = value
          .replace(/[[\]]/g, "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        if (key === "depends_on") current.dependsOn.push(...inline);
        else current.ports += inline.length;
        listKey = "";
      }
    } else if (indent <= serviceIndent + 2) listKey = "";
  }

  return services;
}

/**
 * A compose file states no traffic figures, so every component arrives
 * unmeasured -- which is honest, and the interface already says so. The
 * reviewer sets the numbers that matter; the topology is what the file knows.
 */
export function parseCompose(source: string): ParsedBrief {
  const services = readComposeServices(source);
  const kept = services.slice(0, briefComponentLimit);
  const components: BriefComponent[] = [];

  for (const service of kept) {
    const kind = kindForImage(service.image, service.name);
    // `depends_on` is compose's own dependency edge, which is exactly the
    // relationship this product traces.
    const parents = service.dependsOn.filter((parent) =>
      kept.some((candidate) => candidate.name === parent),
    );
    const base: BriefComponent = {
      name: service.name,
      kind,
      peakRps: 0,
      capacityRps: 0,
      monthlyCostUsd: 0,
      unmeasured: true,
      edgeKind:
        kind === "database"
          ? "writes_to"
          : kind === "queue"
            ? "publishes_to"
            : "calls",
    };
    if (parents.length === 0) {
      components.push(base);
      continue;
    }
    // One entry per edge, the way a prose brief produces one per clause.
    for (const parent of parents)
      components.push({ ...base, sourceName: parent });
  }

  return {
    components,
    overflow: Math.max(0, services.length - kept.length),
    distinctComponents: kept.length,
  };
}

/** True when the text looks like a compose file rather than a prose brief. */
export function looksLikeCompose(source: string): boolean {
  return /^\s*services:\s*$/m.test(source);
}
