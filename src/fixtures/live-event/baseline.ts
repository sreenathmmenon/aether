import type { ArchitectureGraph } from "@domain/architecture/types";

const createdAt = "2026-09-03T00:00:00.000Z";

/**
 * A live-event streaming platform at cricket-final scale.
 *
 * The other fixtures fail the way steady-state systems fail: something
 * breaks and the load stays where it was. This one fails the way a live
 * event does -- the load arrives faster than capacity can, and the
 * bottleneck is lead time rather than headroom. A wicket falls, an innings
 * resumes, and the audience returns in a minute.
 *
 * The shape is drawn from what Hotstar published about the 2019 World Cup
 * semi-final (AWS re:Invent 2019, CMY302): 25.3M peak concurrent viewers,
 * over 1M requests per second, 10 Tbps of egress. The talk is also where
 * the interesting constraint comes from -- they do not autoscale into a
 * spike, because instances take about a minute to boot and the scaler
 * reacts in about ninety seconds, while the audience grows by more than a
 * million people a minute. Capacity is pre-warmed instead.
 *
 * The numbers here are scaled to one region's share of that traffic so the
 * fixture stays legible on a canvas; the ratios and the failure modes are
 * the published ones. `docs/DATA_SOURCES.md` records what is measured,
 * what is published, and what is modelled.
 */
export const liveEventBaseline: ArchitectureGraph = {
  entities: {
    "region-mumbai": {
      id: "region-mumbai",
      kind: "region",
      name: "Mumbai",
      position: { x: 110, y: 60 },
      properties: { city: "Mumbai", failureDomain: "ap-south-1" },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "region-singapore": {
      id: "region-singapore",
      kind: "region",
      name: "Singapore",
      position: { x: 620, y: 380 },
      properties: { city: "Singapore", failureDomain: "ap-southeast-1" },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    // The edge absorbs the whole audience. It is provisioned well past its
    // own peak because a spike arrives before any scaler can answer it.
    edge: {
      id: "edge",
      kind: "gateway",
      name: "Edge Tier",
      position: { x: 220, y: 220 },
      properties: {
        regionId: "region-mumbai",
        peakRps: 420000,
        capacityRps: 620000,
        monthlyCostUsd: 14200,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    // Every viewer asks for a licence before the first frame plays, so a
    // resumed innings hits this in a single burst. It is the thinnest
    // margin on the board: 1.14x its own peak, which does not survive the
    // 1.5x a spike actually brings.
    drm: {
      id: "drm",
      kind: "service",
      name: "Licence Service",
      position: { x: 470, y: 220 },
      properties: {
        regionId: "region-mumbai",
        peakRps: 210000,
        capacityRps: 240000,
        replicas: 6,
        latencyTargetMs: 180,
        monthlyCostUsd: 8600,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    // One writable copy of who is watching what. A session lost is a
    // viewer sent back to a login screen mid-over.
    sessions: {
      id: "sessions",
      kind: "database",
      name: "Session Store",
      position: { x: 740, y: 220 },
      properties: {
        regionId: "region-mumbai",
        peakRps: 180000,
        capacityRps: 200000,
        replicationMode: "none",
        recoveryTimeMinutes: 34,
        monthlyCostUsd: 9800,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    // The ladder that makes the stream watchable at every bitrate. It sits
    // in the second region, so a regional loss is a quality loss rather
    // than a blackout.
    transcode: {
      id: "transcode",
      kind: "service",
      name: "Transcode Ladder",
      // The bottom row clears the causal timeline pinned across the canvas
      // floor, and keeps Singapore's band from crossing Mumbai's: the region
      // boxes are bounding boxes around their members, so two regions that
      // interleave horizontally draw their labels on top of each other.
      position: { x: 220, y: 440 },
      properties: {
        regionId: "region-singapore",
        peakRps: 96000,
        capacityRps: 150000,
        replicas: 4,
        latencyTargetMs: 240,
        monthlyCostUsd: 11400,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    // Ad breaks land on the same clock as the wickets, so this queue takes
    // its own spike at exactly the moment everything else does.
    adbreak: {
      id: "adbreak",
      kind: "queue",
      name: "Ad Break Queue",
      position: { x: 470, y: 440 },
      properties: {
        regionId: "region-singapore",
        peakRps: 74000,
        capacityRps: 120000,
        durable: true,
        monthlyCostUsd: 1600,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    // What the room watches during the event. Concurrency, join rate, and
    // buffer ratio are the three numbers a live operations desk reads.
    telemetry: {
      id: "telemetry",
      kind: "service",
      name: "Live Telemetry",
      position: { x: 740, y: 440 },
      properties: {
        regionId: "region-singapore",
        peakRps: 88000,
        capacityRps: 140000,
        replicas: 3,
        latencyTargetMs: 900,
        monthlyCostUsd: 2400,
      },
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
  },
  relationships: {
    "edge-drm": {
      id: "edge-drm",
      kind: "calls",
      sourceId: "edge",
      targetId: "drm",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "drm-sessions": {
      id: "drm-sessions",
      kind: "reads_from",
      sourceId: "drm",
      targetId: "sessions",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "edge-transcode": {
      id: "edge-transcode",
      kind: "calls",
      sourceId: "edge",
      targetId: "transcode",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "edge-adbreak": {
      id: "edge-adbreak",
      kind: "publishes_to",
      sourceId: "edge",
      targetId: "adbreak",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "adbreak-telemetry": {
      id: "adbreak-telemetry",
      kind: "consumes_from",
      sourceId: "adbreak",
      targetId: "telemetry",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
    "transcode-sessions": {
      id: "transcode-sessions",
      kind: "reads_from",
      sourceId: "transcode",
      targetId: "sessions",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    },
  },
};
