import { computeDefaultActivityBreakdownFromArrays } from "../app/modules/job/forms/jobAssemblyActivityMarshaller";
import {
  computeSewGateBreakdown,
  type StageStats,
} from "../app/modules/job/services/stageRows.server";
import { ExternalStepType } from "@prisma/client";

const sum = (arr: number[]) =>
  (arr || []).reduce((total, value) => total + (Number(value) || 0), 0);

const stageStatsFromUsable = (arr: number[]): StageStats => ({
  goodArr: [...arr],
  defectArr: [],
  usableArr: [...arr],
  attemptsArr: [...arr],
  goodTotal: sum(arr),
  defectTotal: 0,
  usableTotal: sum(arr),
  attemptsTotal: sum(arr),
});

const makeAgg = (opts: {
  cut?: number[];
  sew?: number[];
  finish?: number[];
  sent?: number[];
  received?: number[];
}) => {
  const externalAggregates = new Map();
  if (opts.sent || opts.received) {
    externalAggregates.set(ExternalStepType.EMBROIDERY, {
      sent: opts.sent || [],
      received: opts.received || [],
      net: [],
      loss: [],
      sentTotal: sum(opts.sent || []),
      receivedTotal: sum(opts.received || []),
      netTotal: 0,
      lossTotal: 0,
    });
  }
  return {
    stageStats: {
      cut: stageStatsFromUsable(opts.cut || []),
      sew: stageStatsFromUsable(opts.sew || []),
      finish: stageStatsFromUsable(opts.finish || []),
      pack: stageStatsFromUsable([]),
      qc: stageStatsFromUsable([]),
    },
    externalAggregates,
  } as any;
};

const finishDefault = computeDefaultActivityBreakdownFromArrays({
  activityType: "finish",
  labelsLen: 1,
  ordered: [2],
  alreadyCut: [2],
  finishInput: [2],
  finishDone: [1],
});

if (finishDefault[0] !== 1) {
  throw new Error(`Expected finish default 1, got ${finishDefault[0]}`);
}

const finishExternal = computeDefaultActivityBreakdownFromArrays({
  activityType: "finish",
  labelsLen: 1,
  ordered: [5],
  alreadyCut: [5],
  finishInput: [3],
  finishDone: [1],
});

if (finishExternal[0] !== 2) {
  throw new Error(`Expected finish default 2 with external cap, got ${finishExternal[0]}`);
}

const sewGateFinish = computeSewGateBreakdown({
  aggregation: makeAgg({ cut: [2], sew: [0], finish: [1] }),
  derivedExternalSteps: [],
});
if (sewGateFinish.total !== 1) {
  throw new Error(`Expected sew gate 1 from finish, got ${sewGateFinish.total}`);
}

const sewGateFallback = computeSewGateBreakdown({
  aggregation: makeAgg({ cut: [2], sew: [0], finish: [0] }),
  derivedExternalSteps: [],
});
if (sewGateFallback.total !== 2) {
  throw new Error(`Expected sew gate fallback 2, got ${sewGateFallback.total}`);
}

const sewGateExternalReceived = computeSewGateBreakdown({
  aggregation: makeAgg({ cut: [3], sent: [3], received: [1] }),
  derivedExternalSteps: [{ type: ExternalStepType.EMBROIDERY, expected: true } as any],
});
if (sewGateExternalReceived.total !== 1) {
  throw new Error(
    `Expected sew gate 1 from external received, got ${sewGateExternalReceived.total}`
  );
}

const sewGateExternalSent = computeSewGateBreakdown({
  aggregation: makeAgg({ cut: [3], sent: [3], received: [] }),
  derivedExternalSteps: [{ type: ExternalStepType.EMBROIDERY, expected: true } as any],
});
if (sewGateExternalSent.total !== 3) {
  throw new Error(
    `Expected sew gate 3 from external sent, got ${sewGateExternalSent.total}`
  );
}

console.log("OK: assembly activity defaults.");
