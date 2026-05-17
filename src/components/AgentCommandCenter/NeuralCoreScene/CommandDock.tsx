// Bottom aggregate-stats dock bar. Mirrors the current NeuralOperationsCore dock chips.
export interface DockChip {
  label: string;
  value: string;
  color: string;
  glow: boolean;
}

interface Props {
  chips: DockChip[];
  dataSource: "live" | "mock";
}

export function CommandDock({ chips, dataSource }: Props) {
  return (
    <div
      className="flex items-center gap-2 flex-wrap justify-end"
      style={{
        marginTop: "10px",
        paddingTop: "10px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {chips.map(chip => (
        <div
          key={chip.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "6px",
            background: chip.glow ? `${chip.color}18` : "rgba(255,255,255,0.03)",
            border: `1px solid ${chip.glow ? `${chip.color}35` : "rgba(255,255,255,0.07)"}`,
            boxShadow: chip.glow ? `0 0 10px ${chip.color}20` : "none",
          }}
        >
          <span
            className="text-[10px] font-black tabular-nums"
            style={{ color: chip.color }}
          >
            {chip.value}
          </span>
          <span
            className="text-[8px] font-semibold uppercase"
            style={{ color: chip.color, opacity: 0.65, letterSpacing: "0.10em" }}
          >
            {chip.label}
          </span>
        </div>
      ))}

      {/* Data source badge */}
      <span
        className="text-[8px] font-mono px-2 py-0.5 rounded ml-2"
        style={{
          background: dataSource === "live" ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)",
          color:      dataSource === "live" ? "#22c55e"               : "#f59e0b",
          border:     `1px solid ${dataSource === "live" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
        }}
      >
        {dataSource === "live" ? "● LIVE" : "○ MOCK"}
      </span>
    </div>
  );
}
