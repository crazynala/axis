type ExternalGate = {
  received: number[] | null;
  sent: number[] | null;
  gate: number[] | null;
  source: "received" | "sent" | "none";
};

const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const hasAny = (arr: number[] | null | undefined) =>
  Array.isArray(arr) && arr.some((n) => toNum(n) > 0);

const maxArrays = (a: number[], b: number[]) => {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) =>
    Math.max(toNum(a[i]), toNum(b[i]))
  );
};

const addArrays = (a: number[], b: number[]) => {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => toNum(a[i]) + toNum(b[i]));
};

const minArrays = (a: number[], b: number[]) => {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) =>
    Math.min(toNum(a[i]), toNum(b[i]))
  );
};

const clampArray = (arr: number[]) => arr.map((n) => Math.max(0, toNum(n)));

export function computeExternalGateFromSteps(steps: Array<{
  sent: number[];
  received: number[];
}>): ExternalGate {
  let receivedGate: number[] | null = null;
  let sentGate: number[] | null = null;
  for (const step of steps) {
    if (hasAny(step.received)) {
      receivedGate = receivedGate
        ? minArrays(receivedGate, step.received)
        : [...step.received];
    }
    if (hasAny(step.sent)) {
      sentGate = sentGate ? minArrays(sentGate, step.sent) : [...step.sent];
    }
  }
  if (receivedGate && hasAny(receivedGate)) {
    return { received: receivedGate, sent: sentGate, gate: receivedGate, source: "received" };
  }
  if (sentGate && hasAny(sentGate)) {
    return { received: receivedGate, sent: sentGate, gate: sentGate, source: "sent" };
  }
  return { received: null, sent: null, gate: null, source: "none" };
}

export function computeFinishCapBreakdown(opts: {
  externalGate: ExternalGate;
  sewRecorded: number[];
  sewHasExplicit: boolean;
  cutRecorded: number[];
  finishRecorded?: number[];
  finishLogged?: number[];
  finishLossReconciled?: number[];
}): number[] {
  if (opts.externalGate.gate && hasAny(opts.externalGate.gate)) {
    return clampArray(opts.externalGate.gate);
  }
  if (opts.sewHasExplicit && hasAny(opts.sewRecorded)) {
    return clampArray(opts.sewRecorded);
  }
  const finishRecorded = opts.finishRecorded || [];
  const finishLogged = opts.finishLogged || [];
  const finishLoss = opts.finishLossReconciled || [];
  const finishReached = addArrays(
    finishRecorded,
    addArrays(finishLogged, finishLoss)
  );
  const finishCap = maxArrays(opts.cutRecorded, finishReached);
  return clampArray(finishCap);
}

export function computeDownstreamUsed(opts: {
  externalGate: ExternalGate;
  sewRecorded: number[];
  finishRecorded: number[];
  packRecorded: number[];
  retainRecorded?: number[];
}): {
  cut: number[];
  sew: number[];
  finish: number[];
  pack: number[];
} {
  const extGate = opts.externalGate.gate || [];
  const packLike = opts.retainRecorded
    ? maxArrays(opts.packRecorded, opts.retainRecorded)
    : opts.packRecorded;
  const finishDown = maxArrays(opts.finishRecorded, packLike);
  const sewDown = maxArrays(finishDown, extGate);
  const cutDown = maxArrays(sewDown, opts.sewRecorded);
  return {
    cut: clampArray(cutDown),
    sew: clampArray(sewDown),
    finish: clampArray(packLike),
    pack: [],
  };
}

export function computeReconcileDefault(
  usable: number[],
  downstreamUsed: number[]
) {
  const len = Math.max(usable.length, downstreamUsed.length);
  return Array.from({ length: len }, (_, i) =>
    Math.max(0, toNum(usable[i]) - toNum(downstreamUsed[i]))
  );
}

export function anyPositive(arr: number[]) {
  return arr.some((n) => toNum(n) > 0);
}

export function computeReconcileMax(
  usable: number[],
  downstreamUsed: number[],
  alreadyReconciled: number[] = []
) {
  const len = Math.max(usable.length, downstreamUsed.length, alreadyReconciled.length);
  return Array.from({ length: len }, (_, i) =>
    Math.max(
      0,
      toNum(usable[i]) - toNum(downstreamUsed[i]) - toNum(alreadyReconciled[i])
    )
  );
}
