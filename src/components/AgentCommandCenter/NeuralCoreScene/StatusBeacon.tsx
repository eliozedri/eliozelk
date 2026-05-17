import type { StatusKey } from "./entity-state";
import { STATUS_META } from "./entity-state";

interface Props {
  statusKey: StatusKey;
  size?: number; // CSS px, used as clamp baseline
}

// Pulsing status dot anchored to the top-right of its parent pod.
// Uses CSS animation defined in NeuralCoreScene (beacon-pulse keyframes).
// Renders nothing for "normal" and "unassigned" states to avoid visual noise.
export function StatusBeacon({ statusKey, size = 10 }: Props) {
  if (statusKey === "normal" || statusKey === "unassigned") return null;

  const { dot } = STATUS_META[statusKey];
  const isAlert = statusKey === "critical" || statusKey === "warning";

  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: "-3px",
        right: "-3px",
        zIndex: 5,
        display: "block",
        width: `clamp(${size - 2}px, 1.1vw, ${size + 4}px)`,
        height: `clamp(${size - 2}px, 1.1vw, ${size + 4}px)`,
        borderRadius: "50%",
        background: dot,
        boxShadow: `0 0 ${size}px ${dot}, 0 0 ${size * 2}px ${dot}50`,
        animation: isAlert
          ? "beacon-pulse-alert 1.6s ease-in-out infinite"
          : "beacon-pulse 2.4s ease-in-out infinite",
      }}
    />
  );
}
