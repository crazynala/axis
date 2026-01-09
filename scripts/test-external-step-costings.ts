import { ExternalStepType } from "@prisma/client";
import { buildExternalStepsByAssembly } from "../app/modules/job/services/externalSteps.server";
import { mapExternalStepTypeToActivityUsed } from "../app/modules/job/services/externalStepActivity";

const assembly = {
  id: 1,
  costings: [
    {
      id: 10,
      externalStepType: null,
      product: { externalStepType: ExternalStepType.EMBROIDERY },
    },
  ],
  product: null,
} as any;

const steps = buildExternalStepsByAssembly({
  assemblies: [assembly],
  activitiesByAssembly: new Map(),
  quantityByAssembly: new Map(),
});

const result = steps[assembly.id] || [];
if (!result.length) {
  throw new Error("Expected external step to be derived from costing product.");
}

const mapped = mapExternalStepTypeToActivityUsed(ExternalStepType.EMBROIDERY);
if (mapped !== "embroidery") {
  throw new Error(`Expected embroidery mapping, got ${mapped}`);
}

console.log("OK: external step derived from costing product.");
