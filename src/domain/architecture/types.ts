import type { EntityId, Versioned } from "@core/types";

export type ArchitectureEntityKind =
  "service" | "database" | "queue" | "gateway" | "region";
export type ArchitectureRelationshipKind =
  | "calls"
  | "reads_from"
  | "writes_to"
  | "publishes_to"
  | "consumes_from"
  | "routes_to"
  | "depends_on";

export type CanvasPosition = { x: number; y: number };

export type Capacity = {
  peakRps: number;
  capacityRps: number;
};

export type ServiceProperties = Capacity & {
  replicas: number;
  regionId: EntityId;
  latencyTargetMs: number;
  monthlyCostUsd: number;
};

export type DatabaseProperties = Capacity & {
  regionId: EntityId;
  replicationMode: "none" | "async" | "sync";
  recoveryTimeMinutes: number;
  monthlyCostUsd: number;
};

export type QueueProperties = Capacity & {
  regionId: EntityId;
  durable: boolean;
  monthlyCostUsd: number;
};

export type GatewayProperties = Capacity & { regionId: EntityId };
export type RegionProperties = { city: string; failureDomain: string };

export type ArchitectureProperties =
  | ServiceProperties
  | DatabaseProperties
  | QueueProperties
  | GatewayProperties
  | RegionProperties;

export type ArchitectureEntity = Versioned & {
  id: EntityId;
  kind: ArchitectureEntityKind;
  name: string;
  position: CanvasPosition;
  properties: ArchitectureProperties;
};

export type ArchitectureRelationship = Versioned & {
  id: EntityId;
  kind: ArchitectureRelationshipKind;
  sourceId: EntityId;
  targetId: EntityId;
  label?: string;
};

export type ArchitectureGraph = {
  entities: Record<EntityId, ArchitectureEntity>;
  relationships: Record<EntityId, ArchitectureRelationship>;
};
