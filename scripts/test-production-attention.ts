import assert from "node:assert/strict";
import {
  ATTENTION_DUE_SOON_DAYS,
  buildAttentionSignals,
  compareAttentionRows,
  isAttentionEligible,
  type ProductionAttentionDates,
} from "../app/modules/production/services/production.attention.logic";

function makeDates(overrides: Partial<ProductionAttentionDates>): ProductionAttentionDates {
  const baseDate = new Date("2025-12-22T00:00:00.000Z");
  return {
    dropDeadDate: baseDate,
    customerTargetDate: baseDate,
    internalTargetDate: baseDate,
    daysToDropDead: null,
    daysToCustomer: null,
    daysToInternal: null,
    ...overrides,
  };
}

function run() {
  assert.equal(
    isAttentionEligible({
      jobState: "ACTIVE",
      effectiveOrderedTotal: 0,
      packTotal: 0,
    }),
    false,
    "net order 0 should be excluded"
  );

  assert.equal(
    isAttentionEligible({
      jobState: "ACTIVE",
      effectiveOrderedTotal: 10,
      packTotal: 10,
    }),
    false,
    "packed complete should be excluded"
  );

  assert.equal(
    isAttentionEligible({
      jobState: "CANCELED",
      effectiveOrderedTotal: 10,
      packTotal: 0,
    }),
    false,
    "non-active job should be excluded"
  );

  const holdSignals = buildAttentionSignals({
    dates: makeDates({}),
    started: true,
    jobHoldOn: true,
    jobHoldType: "CLIENT",
    jobHoldReason: "Awaiting approval",
    assemblyHoldOn: false,
    poHold: false,
    externalLate: false,
  });
  assert.ok(
    holdSignals.some((signal) => signal.key === "hold"),
    "held assemblies should include hold signal"
  );

  const a = {
    assemblyId: 1,
    jobId: 10,
    jobCode: "A",
    customerName: "Alpha",
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    started: true,
    effectiveHold: false,
    poHold: false,
    externalLate: false,
    daysToDropDead: -2,
    daysToCustomer: 2,
    daysToInternal: 5,
  };
  const b = {
    assemblyId: 2,
    jobId: 11,
    jobCode: "B",
    customerName: "Beta",
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    started: true,
    effectiveHold: false,
    poHold: false,
    externalLate: false,
    daysToDropDead: null,
    daysToCustomer: -1,
    daysToInternal: 3,
  };
  assert.ok(
    compareAttentionRows(a, b, "priority") < 0,
    "drop-dead overdue should sort before customer overdue"
  );

  const notStartedSignals = buildAttentionSignals({
    dates: makeDates({
      customerTargetDate: new Date("2025-12-25T00:00:00.000Z"),
      daysToCustomer: Math.min(ATTENTION_DUE_SOON_DAYS, 3),
    }),
    started: false,
    jobHoldOn: false,
    assemblyHoldOn: false,
    poHold: false,
    externalLate: false,
  });
  const notStarted = notStartedSignals.find(
    (signal) => signal.key === "not-started"
  );
  assert.ok(notStarted, "not started signal should exist");
  assert.equal(
    notStarted?.tone,
    "warning",
    "not started + due soon should be warning tone"
  );
}

run();
console.log("production attention tests: ok");
