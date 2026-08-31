import type { ArchitectureGraph } from "@domain/architecture/types";

export type Scenario = "regional_outage" | "traffic_spike" | "database_failure";
export type ScenarioResult = {
  scenario: Scenario;
  branchId: string;
  branchVersion: number;
  availability: number;
  rtoMinutes: number;
  latencyMs: number;
  monthlyCostUsd: number;
  sloViolations: string[];
  affectedEntityIds: string[];
  rerunScope: "full" | "affected";
};

export function runScenario(
  graph: ArchitectureGraph,
  scenario: Scenario,
  branchId: string,
  branchVersion: number,
  costCeilingUsd?: number,
): ScenarioResult {
  const ledger = graph.entities.ledger!;
  const auth = graph.entities.auth!;
  const queue = graph.entities.queue!;
  const ledgerProps = ledger.properties as {
    replicationMode: "none" | "async" | "sync";
    monthlyCostUsd: number;
  };
  const authProps = auth.properties as {
    replicas: number;
    capacityRps: number;
    monthlyCostUsd: number;
  };
  const queueProps = queue.properties as {
    capacityRps: number;
    monthlyCostUsd: number;
  };
  const resilient = ledgerProps.replicationMode !== "none";
  const outageHeadroom = Math.min(
    authProps.capacityRps - 12000,
    queueProps.capacityRps - 12000,
  );
  const spikeHeadroom = Math.min(
    authProps.capacityRps - 18000,
    queueProps.capacityRps - 18000,
  );
  const monthlyCostUsd =
    ledgerProps.monthlyCostUsd +
    authProps.monthlyCostUsd +
    queueProps.monthlyCostUsd;
  const outcomes = {
    regional_outage: {
      availability: resilient ? 99.97 : 96.42,
      rtoMinutes: resilient
        ? ledgerProps.replicationMode === "sync"
          ? 7
          : 12
        : 46,
      latencyMs: resilient ? 185 : 480,
      violations: [
        !resilient && "Single regional ledger dependency",
        outageHeadroom < 0 &&
          `Capacity deficit: ${Math.abs(outageHeadroom)} RPS`,
      ],
      affectedEntityIds: ["ledger", "auth", "queue"],
    },
    traffic_spike: {
      availability: spikeHeadroom >= 0 ? 99.95 : resilient ? 99.61 : 97.9,
      rtoMinutes: spikeHeadroom >= 0 ? 4 : 18,
      latencyMs: spikeHeadroom >= 0 ? 230 : resilient ? 390 : 720,
      violations: [
        spikeHeadroom < 0 &&
          `Traffic capacity deficit: ${Math.abs(spikeHeadroom)} RPS`,
        spikeHeadroom < 0 && "Traffic spike SLO breached",
      ],
      affectedEntityIds: ["auth", "queue"],
    },
    database_failure: {
      availability:
        ledgerProps.replicationMode === "sync"
          ? 99.98
          : resilient
            ? 99.91
            : 94.7,
      rtoMinutes:
        ledgerProps.replicationMode === "sync" ? 5 : resilient ? 18 : 75,
      latencyMs:
        ledgerProps.replicationMode === "sync" ? 210 : resilient ? 310 : 930,
      violations: [
        !resilient && "Ledger has no standby replica",
        ledgerProps.replicationMode === "async" &&
          "Recovery point objective is non-zero",
      ],
      affectedEntityIds: ["ledger", "reconciliation"],
    },
  }[scenario];
  const costViolation =
    costCeilingUsd && monthlyCostUsd > costCeilingUsd
      ? `Human cost ceiling exceeded: $${monthlyCostUsd.toLocaleString()} > $${costCeilingUsd.toLocaleString()}`
      : false;
  return {
    scenario,
    branchId,
    branchVersion,
    availability: outcomes.availability,
    rtoMinutes: outcomes.rtoMinutes,
    latencyMs: outcomes.latencyMs,
    monthlyCostUsd,
    sloViolations: [...outcomes.violations, costViolation].filter(
      Boolean,
    ) as string[],
    affectedEntityIds: outcomes.affectedEntityIds,
    rerunScope: branchVersion > 1 ? "affected" : "full",
  };
}
