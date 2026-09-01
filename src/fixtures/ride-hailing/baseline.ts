import type { ArchitectureGraph } from "@domain/architecture/types";

const createdAt = "2026-09-01T00:00:00.000Z";

/**
 * A dispatch platform in the shape the ride-hailing industry has written about
 * publicly: location ingest at the edge, a matching service that reads driver
 * supply from an in-memory store, trip state in a primary database, and an
 * event stream feeding pricing and analytics.
 *
 * The interesting property is that matching depends on both the geospatial
 * store and the trip database, so a single stateful failure removes the
 * ability to dispatch at all while riders keep arriving.
 */
export const rideHailingBaseline: ArchitectureGraph = {
  entities: {
    "region-core": {
      id: "region-core",
      kind: "region",
      name: "Core",
      position: { x: 110, y: 60 },
      properties: { city: "Core", failureDomain: "primary-metro" },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "region-analytics": {
      id: "region-analytics",
      kind: "region",
      name: "Analytics",
      position: { x: 620, y: 360 },
      properties: { city: "Analytics", failureDomain: "batch" },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    ingest: {
      id: "ingest",
      kind: "gateway",
      name: "Location Ingest",
      position: { x: 220, y: 220 },
      properties: {
        regionId: "region-core",
        peakRps: 46000,
        capacityRps: 60000,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    matching: {
      id: "matching",
      kind: "service",
      name: "Matching",
      position: { x: 470, y: 220 },
      properties: {
        regionId: "region-core",
        peakRps: 32000,
        capacityRps: 34000,
        replicas: 3,
        latencyTargetMs: 90,
        monthlyCostUsd: 7400,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    supply: {
      id: "supply",
      kind: "database",
      name: "Driver Supply",
      position: { x: 740, y: 220 },
      properties: {
        regionId: "region-core",
        peakRps: 32000,
        capacityRps: 33000,
        replicationMode: "none",
        recoveryTimeMinutes: 22,
        monthlyCostUsd: 4100,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    trips: {
      id: "trips",
      kind: "database",
      name: "Trip State",
      position: { x: 740, y: 90 },
      properties: {
        regionId: "region-core",
        peakRps: 18000,
        capacityRps: 21000,
        replicationMode: "async",
        recoveryTimeMinutes: 34,
        monthlyCostUsd: 5600,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    events: {
      id: "events",
      kind: "queue",
      name: "Trip Events",
      position: { x: 430, y: 450 },
      properties: {
        regionId: "region-analytics",
        peakRps: 18000,
        capacityRps: 26000,
        durable: true,
        monthlyCostUsd: 900,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    pricing: {
      id: "pricing",
      kind: "service",
      name: "Surge Pricing",
      position: { x: 700, y: 450 },
      properties: {
        regionId: "region-analytics",
        peakRps: 12000,
        capacityRps: 16000,
        replicas: 2,
        latencyTargetMs: 300,
        monthlyCostUsd: 2200,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
  },
  relationships: {
    "ingest-matching": {
      id: "ingest-matching",
      kind: "calls",
      sourceId: "ingest",
      targetId: "matching",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "matching-supply": {
      id: "matching-supply",
      kind: "reads_from",
      sourceId: "matching",
      targetId: "supply",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "matching-trips": {
      id: "matching-trips",
      kind: "writes_to",
      sourceId: "matching",
      targetId: "trips",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "trips-events": {
      id: "trips-events",
      kind: "publishes_to",
      sourceId: "trips",
      targetId: "events",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "events-pricing": {
      id: "events-pricing",
      kind: "consumes_from",
      sourceId: "events",
      targetId: "pricing",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
  },
};
