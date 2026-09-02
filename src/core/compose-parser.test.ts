import { describe, expect, it } from "vitest";
import {
  kindForImage,
  looksLikeCompose,
  parseCompose,
  readComposeServices,
} from "./compose-parser";

const compose = `
version: "3.9"
services:
  gateway:
    image: nginx:1.25
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api
  api:
    image: node:20-alpine   # the app itself
    depends_on: [orders, cache]
  orders:
    image: postgres:16
  cache:
    image: redis:7
  events:
    image: confluentinc/cp-kafka:7.5
volumes:
  pgdata:
`;

describe("reading a docker-compose file", () => {
  it("finds every service and its image", () => {
    const services = readComposeServices(compose);
    expect(services.map((service) => service.name)).toEqual([
      "gateway",
      "api",
      "orders",
      "cache",
      "events",
    ]);
    expect(services[0]!.image).toBe("nginx:1.25");
    // A trailing comment is not part of the image.
    expect(services[1]!.image).toBe("node:20-alpine");
  });

  it("reads both the block and inline forms of depends_on", () => {
    const services = readComposeServices(compose);
    expect(services[0]!.dependsOn).toEqual(["api"]);
    expect(services[1]!.dependsOn).toEqual(["orders", "cache"]);
  });

  it("stops at the next top-level key", () => {
    // `volumes:` is not a service, and a reader that kept going would model
    // "pgdata" as a component of the architecture.
    expect(readComposeServices(compose).map((s) => s.name)).not.toContain(
      "pgdata",
    );
  });

  it("infers what a service is from the image it runs", () => {
    expect(kindForImage("postgres:16", "orders")).toBe("database");
    expect(kindForImage("redis:7", "cache")).toBe("database");
    expect(kindForImage("confluentinc/cp-kafka:7.5", "events")).toBe("queue");
    expect(kindForImage("nginx:1.25", "gateway")).toBe("gateway");
    expect(kindForImage("node:20-alpine", "api")).toBe("service");
    // The name carries the signal when the image is generic.
    expect(kindForImage("mycorp/edge:1", "ingress")).toBe("gateway");
  });

  it("turns depends_on into the dependency edges the engine traces", () => {
    const parsed = parseCompose(compose);
    const edges = parsed.components
      .filter((component) => component.sourceName)
      .map((component) => `${component.sourceName} -> ${component.name}`);
    expect(edges).toContain("api -> gateway");
    expect(edges).toContain("orders -> api");
    expect(edges).toContain("cache -> api");
    expect(parsed.distinctComponents).toBe(5);
  });

  it("marks every component unmeasured", () => {
    // A compose file states no traffic figures. Inventing them would put
    // numbers on screen that the reviewer never gave and cannot check.
    const parsed = parseCompose(compose);
    expect(parsed.components.every((component) => component.unmeasured)).toBe(
      true,
    );
    expect(
      parsed.components.every((component) => component.peakRps === 0),
    ).toBe(true);
  });

  it("tells a compose file from a prose brief", () => {
    expect(looksLikeCompose(compose)).toBe(true);
    expect(
      looksLikeCompose("checkout calls orders, orders writes to ledger"),
    ).toBe(false);
  });

  it("reports services beyond the budget rather than dropping them", () => {
    const many = ["services:"]
      .concat(
        Array.from(
          { length: 15 },
          (_, index) => `  svc${index}:\n    image: node:20`,
        ),
      )
      .join("\n");
    const parsed = parseCompose(many);
    expect(parsed.distinctComponents).toBe(12);
    expect(parsed.overflow).toBe(3);
  });
});
