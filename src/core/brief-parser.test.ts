import { describe, expect, it } from "vitest";
import { createInitialState, deriveGraph, dispatch } from "./branch-engine";
import { blankBaseline } from "../fixtures/blank/baseline";
import {
  briefComponentLimit,
  kindFor,
  parseBrief,
  resolveAlias,
} from "./brief-parser";
import { runScenario } from "@simulation/engine";

const human = { id: "sreenath", kind: "human" as const, displayName: "S" };

describe("system brief parser", () => {
  it("keeps every component in a long brief instead of truncating at four", () => {
    // A reviewer describing a real system writes more than four clauses. The
    // parser used to keep the first four and drop the rest without a word,
    // so the canvas silently disagreed with the brief above it.
    const brief =
      "Users hit an API gateway, the gateway routes to checkout, checkout calls fraud scoring, " +
      "fraud writes to Postgres, orders publishes to Kafka, analytics consumes from Kafka, " +
      "billing reads from Postgres, and reporting depends on the warehouse";
    const parsed = parseBrief(brief);
    // Both ends of every clause are components now, so the count is of
    // distinct names rather than clauses — "the gateway routes to checkout"
    // introduces two things, and counting one lost the subject of every
    // prose sentence.
    expect(parsed.overflow).toBe(0);
    const named = parsed.components.map((c) => c.name.toLowerCase());
    for (const component of [
      "api gateway",
      "checkout",
      "fraud scoring",
      "postgres",
      "kafka",
      "analytics",
      "warehouse",
    ])
      expect(named, `${component} is missing from the graph`).toContain(
        component,
      );
  });

  it("reports overflow rather than dropping clauses silently", () => {
    // Fifteen genuinely different components exceed the budget by three, and
    // the reviewer is told so rather than left with a canvas that quietly
    // disagrees with the brief above it.
    const brief = Array.from(
      { length: briefComponentLimit + 3 },
      (_, index) => `checkout calls service${index}`,
    ).join(", ");
    const parsed = parseBrief(brief);
    // The subject "checkout" is one component shared by every clause, so
    // the budget is reached one object sooner than when subjects were
    // discarded. What must hold is the budget itself and that the reviewer
    // is told something was dropped.
    expect(parsed.distinctComponents).toBe(briefComponentLimit);
    expect(parsed.overflow).toBeGreaterThan(0);
  });

  it("reads the figures the reviewer stated and invents none", () => {
    const parsed = parseBrief(
      "Checkout handles 12k rps, Postgres costs 4200 usd monthly, Kafka buffers events",
    );
    const [checkout, postgres, kafka] = parsed.components;
    expect(checkout!.peakRps).toBe(12000);
    expect(postgres!.monthlyCostUsd).toBe(4200);
    // Nothing was stated about Kafka's traffic, so nothing is fabricated.
    expect(kafka!.peakRps).toBe(0);
    expect(kafka!.capacityRps).toBe(0);
    expect(kafka!.unmeasured).toBe(true);
  });

  it("derives edge kinds from the verb, which changes how failure travels", () => {
    const parsed = parseBrief(
      "gateway routes to checkout, checkout writes to Postgres, analytics reads from Postgres, orders publishes to Kafka",
    );
    expect(
      parsed.components.filter((c) => c.sourceName).map((c) => c.edgeKind),
    ).toEqual(["routes_to", "writes_to", "reads_from", "publishes_to"]);
  });

  it("never turns a stated figure into a component name", () => {
    // "billing reads from Postgres costing 2400 usd monthly" describes
    // Postgres, not a component called "2400 usd monthly".
    const parsed = parseBrief(
      "Users hit an API gateway at 40k rps, billing reads from Postgres costing 2400 usd monthly",
    );
    // "Users" and "billing" are the clauses' subjects and are components in
    // their own right; what must never appear is a name made of a figure.
    const names = parsed.components.map((c) => c.name);
    // "Users" is filtered as a framing word, not a component to simulate.
    expect(names).toEqual(["API gateway", "billing", "Postgres"]);
    expect(names.some((name) => /\d/.test(name))).toBe(false);
    const byName = new Map(parsed.components.map((c) => [c.name, c]));
    expect(byName.get("API gateway")!.peakRps).toBe(40000);
    expect(byName.get("Postgres")!.monthlyCostUsd).toBe(2400);
  });

  it("classifies the component the clause names, not every noun in it", () => {
    // A clause introduces the component it ends on: "the gateway routes to
    // checkout" adds checkout, a service, even though it says "gateway".
    const parsed = parseBrief(
      "users hit the API gateway, the gateway routes to checkout",
    );
    expect(parsed.components.map((c) => [c.name, c.kind])).toEqual([
      ["API gateway", "gateway"],
      ["checkout", "service"],
    ]);
  });

  it("treats a repeated component as one node with two edges", () => {
    // A brief mentions the same store twice when two things use it. That is
    // one component and two dependencies, not a duplicate to discard.
    const parsed = parseBrief(
      "orders publishes to Kafka, analytics consumes from Kafka",
    );
    // Each clause contributes its subject and its object; Kafka appearing
    // twice is two edges into one node, which the canvas merges on the way in.
    expect(parsed.components.map((c) => c.name)).toEqual([
      "orders",
      "Kafka",
      "analytics",
      "Kafka",
    ]);
    expect(
      parsed.components.filter((c) => c.sourceName).map((c) => c.edgeKind),
    ).toEqual(["publishes_to", "consumes_from"]);
  });

  it("names the subject a clause draws its edge from", () => {
    // "orders publishes to Kafka" must draw from orders, not from whatever
    // the previous clause happened to mention.
    const parsed = parseBrief(
      "checkout calls fraud scoring, orders publishes to Kafka, analytics consumes from Kafka",
    );
    // Subjects are components too now, so the list holds both ends of every
    // clause and a positional assertion would be checking the order rather
    // than the property. What matters is that each edge draws from its own
    // clause's subject.
    expect(
      parsed.components
        .map((c) => c.sourceName)
        .filter((name): name is string => Boolean(name)),
    ).toEqual(["checkout", "orders", "analytics"]);
  });

  it("treats a shortened repeat mention as the same component", () => {
    // Prose introduces "the API gateway" and then calls it "the gateway".
    // Two nodes for one component would split the graph and the evidence.
    const existing = ["API gateway", "fraud scoring", "Postgres"];
    expect(resolveAlias("gateway", existing)).toBe("API gateway");
    expect(resolveAlias("fraud", existing)).toBe("fraud scoring");
    expect(resolveAlias("Postgres", existing)).toBe("Postgres");
    expect(resolveAlias("warehouse", existing)).toBeUndefined();
  });

  it("never invents a component from a figure stated in its own sentence", () => {
    // A reviewer writes "Peak is 40000 rps." as its own sentence. Reading that
    // as a component called "Peak" both fabricates a node and misfiles the
    // real figure onto it — and the phantom then enters the availability
    // calculation, corrupting the number the product asks to be trusted.
    const parsed = parseBrief(
      "Our API gateway routes to checkout. Checkout calls fraud scoring. Peak is 40000 rps. Monthly cost is 2400 usd.",
    );
    expect(parsed.components.map((c) => c.name)).toEqual([
      "API gateway",
      "checkout",
      "fraud scoring",
    ]);
    // The figures measure the component the brief had just described.
    const measured = parsed.components[2]!;
    expect(measured.peakRps).toBe(40000);
    expect(measured.monthlyCostUsd).toBe(2400);
    expect(measured.unmeasured).toBe(false);
  });

  it("keeps a framing verb out of the component name", () => {
    // "checkout handles 12k rps" names checkout, not "checkout handles".
    const parsed = parseBrief(
      "checkout handles 12k rps, Postgres costs 4200 usd monthly",
    );
    expect(parsed.components.map((c) => c.name)).toEqual([
      "checkout",
      "Postgres",
    ]);
    expect(parsed.components[0]!.peakRps).toBe(12000);
    expect(parsed.components[1]!.monthlyCostUsd).toBe(4200);
  });

  it("budgets components rather than clauses", () => {
    // Fifteen sentences about the same pair is two components, not a
    // truncated brief. Counting clauses reported work as dropped that never
    // existed.
    const parsed = parseBrief(
      Array.from({ length: 15 }, () => "billing reads from Postgres").join(
        ". ",
      ),
    );
    expect(parsed.distinctComponents).toBe(2);
    expect(parsed.overflow).toBe(0);
  });

  it("reads an arrow chain, which is how engineers sketch a stack", () => {
    // "nginx -> django -> celery -> rabbitmq -> postgres" collapsed into a
    // single component, so the most compact way anyone describes a system
    // produced a one-node graph.
    const parsed = parseBrief(
      "our stack: nginx -> django -> celery -> rabbitmq -> postgres",
    );
    expect(parsed.components.map((c) => c.name)).toEqual([
      "nginx",
      "django",
      "celery",
      "rabbitmq",
      "postgres",
    ]);
    // The arrow is a dependency, so each component follows the one before it.
    expect(
      parsed.components.slice(1).every((c) => c.edgeKind === "calls"),
    ).toBe(true);
  });

  it("splits a clause that introduces two components with two verbs", () => {
    // "a Node API which reads from Redis and writes to Postgres" describes
    // three components, not one.
    const parsed = parseBrief(
      "It calls a Node API which reads from Redis and writes to Postgres",
    );
    const names = parsed.components.map((c) => c.name);
    expect(names).toContain("Redis");
    expect(names).toContain("Postgres");
    expect(parsed.components.map((c) => c.edgeKind)).toContain("reads_from");
    expect(parsed.components.map((c) => c.edgeKind)).toContain("writes_to");
  });

  it("classifies the infrastructure people actually name", () => {
    // A brief naming Redis or SQS describes a store and a queue. Calling both
    // plain services makes the simulation miss the stateful risk entirely.
    const parsed = parseBrief(
      "nginx routes to django, django writes to redis, a worker consumes from SQS, results land in S3",
    );
    const byName = new Map(parsed.components.map((c) => [c.name, c.kind]));
    expect(byName.get("redis")).toBe("database");
    expect(byName.get("SQS")).toBe("queue");
    expect(byName.get("S3")).toBe("database");
    // nginx is the first clause's subject, and a subject is a component in
    // its own right as well as the source of the clause's edge.
    expect(byName.get("nginx")).toBe("gateway");
    expect(parsed.components.find((c) => c.name === "django")!.sourceName).toBe(
      "nginx",
    );
    expect(kindFor("nginx")).toBe("gateway");
  });

  it("drops words that frame a list rather than naming a component", () => {
    // "our stack:" and "Kafka in the middle" introduce a description; adding
    // a node for either puts a phantom into the evidence.
    const parsed = parseBrief(
      "our stack: nginx -> postgres. Kafka in the middle. the fraud engine consumes from Kafka",
    );
    const names = parsed.components.map((c) => c.name.toLowerCase());
    expect(names).not.toContain("stack");
    expect(names).not.toContain("middle");
    expect(names).toContain("nginx");
  });

  it("does not treat a count as part of a component name", () => {
    // "three microservices" and "one MySQL cluster" name microservices and
    // MySQL, not "three microservices".
    const parsed = parseBrief(
      "the gateway routes to three microservices, all sharing one MySQL cluster",
    );
    for (const component of parsed.components)
      expect(component.name).not.toMatch(/\b(?:one|three|all)\b/i);
  });

  it("keeps a qualifier that is filler elsewhere in the sentence", () => {
    // "users hit the API" uses "user" as filler, but "user service" and
    // "user db" are component names. Ending the noun phrase at the first
    // filler word turned both into "service" and "db", so an arrow chain
    // silently lost a link and named another node after its type.
    const parsed = parseBrief(
      "Ingress -> auth service -> user service -> user db",
    );
    expect(parsed.components.map((c) => c.name)).toEqual([
      "Ingress",
      "auth service",
      "user service",
      "user db",
    ]);
  });

  it("reads several components named in one prepositional clause", () => {
    // "a monolith on EC2 with an RDS database behind an ALB" describes three
    // components and produced one, named "database behind ALB".
    const parsed = parseBrief(
      "A monolith on EC2 with an RDS database behind an ALB",
    );
    const byName = new Map(parsed.components.map((c) => [c.name, c.kind]));
    expect(byName.get("RDS database")).toBe("database");
    expect(byName.get("ALB")).toBe("gateway");
    expect(parsed.distinctComponents).toBeGreaterThanOrEqual(3);
  });

  it("turns a plain description into a simulable graph without an agent", () => {
    // A reviewer in a plain browser must reach a modelled system from their
    // own words; otherwise the entry point depends on narration.
    const parsed = parseBrief(
      "Users hit an API gateway, checkout calls fraud scoring, fraud writes to Postgres, events flow through Kafka",
    );
    let state = createInitialState(blankBaseline, "blank");
    const created: string[] = [];
    parsed.components.forEach((component, index) => {
      const added = dispatch(
        state,
        {
          type: "ADD_COMPONENT",
          input: {
            branchId: "branch-baseline",
            name: component.name,
            kind: component.kind,
            regionId: "region-primary",
            peakRps: component.peakRps || 8000,
            capacityRps: component.capacityRps || 10000,
            monthlyCostUsd: component.monthlyCostUsd || 800,
          },
        },
        human,
      );
      if (!added.ok) throw new Error("brief component must be addable");
      state = added.value;
      const entityId = added.affectedEntityIds[0]!;
      created.push(entityId);
      if (index === 0) return;
      const linked = dispatch(
        state,
        {
          type: "CONNECT_COMPONENTS",
          input: {
            branchId: "branch-baseline",
            sourceId: created[created.length - 2]!,
            targetId: entityId,
            kind: component.edgeKind,
          },
        },
        human,
      );
      if (!linked.ok) throw new Error("brief components must connect");
      state = linked.value;
    });

    const graph = deriveGraph(state, state.branches["branch-baseline"]!);
    const names = Object.values(graph.entities)
      .filter((entity) => entity.kind !== "region")
      .map((entity) => entity.name);
    expect(names).toContain("Postgres");
    expect(names).toContain("Kafka");
    expect(names.every((name) => name.split(" ").length <= 3)).toBe(true);
    const kinds = Object.values(graph.entities)
      .filter((entity) => entity.kind !== "region")
      .map((entity) => entity.kind);
    expect(kinds).toContain("gateway");
    expect(kinds).toContain("database");
    expect(kinds).toContain("queue");
    // Every component after the first is linked to the one before it, so the
    // graph is connected rather than a scatter of isolated nodes — that is
    // what makes it simulable.
    expect(Object.keys(graph.relationships)).toHaveLength(created.length - 1);

    // The engine treats a described system exactly like a seeded one.
    const run = runScenario(graph, "regional_outage", "branch-baseline", 1);
    expect(run.availability).toBeGreaterThan(0);
  });
});
