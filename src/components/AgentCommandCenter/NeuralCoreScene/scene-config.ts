import { NEURAL_HOTSPOTS } from "@/lib/agents/neural-core-hotspots";

// ── Department color tokens (matches design spec) ─────────────────────────────
export const DEPT_COLORS: Record<string, string> = {
  orchestrator:    "#00C2FF",
  data_core:       "#00E5FF",
  cfo:             "#22C55E",
  warehouse:       "#FACC15",
  coordination_qa: "#06B6D4",
  graphics:        "#A855F7",
  accounting:      "#3B82F6",
  catalog:         "#8B5CF6",
  fabrication:     "#F97316",
  meeting:         "#60A5FA",
  field_ops:       "#4ADE80",
};

// ── Hotspot → agent id ────────────────────────────────────────────────────────
// data_core and meeting have no agent; engineering-plan-agent stays out-of-core.
export const AGENT_MAP: Record<string, string | null> = {
  orchestrator:    "ops-orchestrator",
  cfo:             "cfo-agent",
  warehouse:       "inventory-agent",
  graphics:        "graphics-production-agent",
  accounting:      "billing-collections-agent",
  catalog:         "catalog-pricing-agent",
  fabrication:     "fabrication-agent",
  field_ops:       "field-ops-agent",
  coordination_qa: "coordination-qa-agent",
  data_core:       null,
  meeting:         null,
};

// ── Data Core center (pipeline hub) ──────────────────────────────────────────
const DATA_CORE_HS = NEURAL_HOTSPOTS.find(h => h.id === "data_core")!;
export const DATA_CORE_CENTER = { x: DATA_CORE_HS.x, y: DATA_CORE_HS.y };

// ── Pod config: hotspot + color + agentId ─────────────────────────────────────
export const PODS = NEURAL_HOTSPOTS.map(hs => ({
  ...hs,
  agentId: AGENT_MAP[hs.id] ?? null,
  color:   DEPT_COLORS[hs.id] ?? "#3A5878",
}));

// ── Pipeline connections: each non-hub pod → Data Core ────────────────────────
export const PIPELINES = PODS
  .filter(p => p.id !== "data_core")
  .map(p => ({
    id:    p.id,
    from:  { x: p.x, y: p.y },
    to:    DATA_CORE_CENTER,
    color: p.color,
  }));

export type PodConfig = (typeof PODS)[number];
export type PipelineConfig = (typeof PIPELINES)[number];
