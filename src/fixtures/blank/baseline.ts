import type { ArchitectureGraph } from "@domain/architecture/types";

const createdAt = "2026-09-01T00:00:00.000Z";

/**
 * An empty two-region canvas. Aether ships worked examples, but a reviewer's
 * own system is the point: an agent can describe it into existence through
 * `add_architecture_component` and `connect_components`, and the deterministic
 * engine then proves consequences on that graph exactly as it does on a
 * seeded one.
 */
export const blankBaseline: ArchitectureGraph = {
  entities: {
    "region-primary": {
      id: "region-primary",
      kind: "region",
      name: "Primary",
      position: { x: 110, y: 60 },
      properties: { city: "Primary", failureDomain: "primary" },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "region-secondary": {
      id: "region-secondary",
      kind: "region",
      name: "Secondary",
      position: { x: 620, y: 360 },
      properties: { city: "Secondary", failureDomain: "secondary" },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
  },
  relationships: {},
};
