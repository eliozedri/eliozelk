// z:0 — pure CSS background: dark gradient + radial glow + subtle grid
export function SceneBackground() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background:
          "radial-gradient(ellipse at 50% 38%, rgba(0,90,155,0.18) 0%, rgba(1,4,14,0.99) 62%)",
        borderRadius: "inherit",
      }}
    >
      {/* Grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,190,255,0.028) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(0,190,255,0.028) 1px, transparent 1px)",
          backgroundSize: "4% 6%",
          borderRadius: "inherit",
        }}
      />
      {/* Subtle center bloom */}
      <div
        style={{
          position: "absolute",
          left: "30%",
          top: "20%",
          width: "40%",
          height: "60%",
          borderRadius: "50%",
          background: "rgba(0,160,220,0.06)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
