export type DebugExplainPayload = {
  context: {
    module: "dashboard" | "assembly" | "poLine" | "shipment";
    entity: { type: string; id: number | string };
    generatedAt: string;
    version: string;
  };
  rollups?: Record<string, number | string | boolean | null>;
  inputs?: Record<string, any>;
  derived?: Record<string, any>;
  reasoning?: Array<{
    code: string;
    label: string;
    why: string;
    evidence?: Record<string, any>;
  }>;
  links?: Array<{ label: string; href: string }>;
};
