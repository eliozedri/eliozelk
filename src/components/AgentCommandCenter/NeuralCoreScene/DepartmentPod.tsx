import type { PodConfig } from "./scene-config";
import type { StatsLive } from "./entity-state";
import { deriveStatus, STATUS_META } from "./entity-state";
import { StatusBeacon } from "./StatusBeacon";

interface Props {
  pod: PodConfig;
  stats: StatsLive | null;
  isSelected: boolean;
  onClick: () => void;
}

// z:20 — one department pod: CSS ellipse + Hebrew + English labels + status beacon.
// Positioned with the same % coordinate system as NEURAL_HOTSPOTS:
//   left: pod.x%  (% of stage width)   top: pod.y%  (% of stage height)
//   width: pod.w% (% of stage width)   height: pod.h% (% of stage height)
// transform: translate(-50%,-50%) centres the element on those coordinates.
export function DepartmentPod({ pod, stats, isSelected, onClick }: Props) {
  const statusKey = deriveStatus(stats);
  const hasAgent  = pod.agentId !== null;

  return (
    <div
      role={hasAgent ? "button" : undefined}
      tabIndex={hasAgent ? 0 : undefined}
      aria-label={hasAgent ? pod.labelHe : undefined}
      aria-selected={hasAgent ? isSelected : undefined}
      onClick={hasAgent ? onClick : undefined}
      onKeyDown={hasAgent
        ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }
        : undefined
      }
      style={{
        position: "absolute",
        left: `${pod.x}%`,
        top: `${pod.y}%`,
        width: `${pod.w}%`,
        height: `${pod.h}%`,
        transform: "translate(-50%, -50%)",
        zIndex: 20,
        cursor: hasAgent ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {/* Glow halo — expands slightly beyond pod boundary */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-35%",
          borderRadius: "50%",
          background: pod.color,
          opacity: isSelected ? 0.22 : 0.09,
          filter: "blur(10px)",
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
        }}
      />

      {/* Pod body — full inset so it exactly fills the positioned box */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: isSelected
            ? `rgba(2,8,22,0.96)`
            : `rgba(2,8,22,0.90)`,
          border: `${isSelected ? "2px" : "1.5px"} solid ${pod.color}`,
          boxShadow: isSelected
            ? `0 0 22px ${pod.color}45, inset 0 0 12px ${pod.color}18`
            : `0 0 6px ${pod.color}22`,
          transition: "border-width 0.2s, box-shadow 0.25s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1px",
          textAlign: "center",
          padding: "10% 6%",
          overflow: "hidden",
        }}
      >
        {/* Hebrew label */}
        <span
          style={{
            display: "block",
            color: pod.color,
            fontSize: "clamp(6px, 0.82vw, 11px)",
            fontWeight: 700,
            lineHeight: 1.2,
            direction: "rtl",
            whiteSpace: "nowrap",
          }}
        >
          {pod.labelHe}
        </span>

        {/* English label */}
        <span
          style={{
            display: "block",
            color: pod.color,
            fontSize: "clamp(4.5px, 0.58vw, 8px)",
            fontWeight: 600,
            letterSpacing: "0.07em",
            opacity: 0.6,
            whiteSpace: "nowrap",
          }}
        >
          {pod.labelEn}
        </span>

        {/* Status label (selected only) */}
        {isSelected && stats && (
          <span
            style={{
              display: "block",
              marginTop: "2px",
              fontSize: "clamp(4px, 0.5vw, 7px)",
              color: STATUS_META[statusKey].dot,
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            {STATUS_META[statusKey].label}
          </span>
        )}
      </div>

      {/* Status beacon — top-right corner */}
      <StatusBeacon statusKey={statusKey} />
    </div>
  );
}
