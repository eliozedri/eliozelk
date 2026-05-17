import { PIPELINES } from "./scene-config";

// z:10 — static dashed SVG lines from each pod center to Data Core center.
// viewBox="0 0 100 100" + preserveAspectRatio="none" makes each unit equal 1%
// of its respective axis (x% of stage width, y% of stage height), so SVG
// coordinates map exactly to the CSS % positions used by DepartmentPod.
export function PipelineLayer() {
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 10,
        pointerEvents: "none",
        overflow: "visible",
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {PIPELINES.map(p => (
        <line
          key={p.id}
          x1={p.from.x}
          y1={p.from.y}
          x2={p.to.x}
          y2={p.to.y}
          stroke={p.color}
          strokeWidth="0.25"
          strokeOpacity="0.32"
          strokeDasharray="1.4 2.2"
        />
      ))}
    </svg>
  );
}
