"use client";

import { useEffect, useRef } from "react";

function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const nodes: { x: number; y: number; vx: number; vy: number; r: number }[] = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: Math.random() * 1.5 + 1,
    }));

    const CONNECT_DIST = 200;
    let raf: number;

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.28;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(6,182,212,${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        // glow halo
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4);
        grad.addColorStop(0, "rgba(6,182,212,0.5)");
        grad.addColorStop(1, "rgba(6,182,212,0)");
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 4, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // solid core
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100,220,240,0.85)";
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

export function HolographicBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* deep navy base */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(175deg, #040c1a 0%, #051220 45%, #030b18 100%)" }}
      />

      {/* strong center radial glow — bright projector beam pulling eye inward */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 55% 45% at 50% 40%, rgba(6,182,212,0.22) 0%, rgba(6,182,212,0.10) 40%, rgba(6,182,212,0.03) 65%, transparent 80%)" }}
      />
      {/* secondary bright core */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 28% 22% at 50% 38%, rgba(6,220,240,0.18) 0%, transparent 55%)" }}
      />

      {/* upper-left indigo accent */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 45% 40% at 8% 12%, rgba(79,70,229,0.08) 0%, transparent 65%)" }}
      />

      {/* lower-right cyan accent */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 40% 35% at 92% 82%, rgba(6,182,212,0.07) 0%, transparent 65%)" }}
      />

      {/* pink/magenta accent for bottom carousel area (matches reference) */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 20% at 50% 98%, rgba(168,85,247,0.06) 0%, transparent 70%)" }}
      />

      {/* CSS grid overlay (from ChatGPT version — radial-masked) */}
      <div className="holo-grid-overlay" style={{ opacity: 0.7 }} />

      {/* animated node network */}
      <NetworkCanvas />

      {/* edge vignette */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 110% 110% at 50% 50%, transparent 50%, rgba(0,0,0,0.62) 100%)" }}
      />
    </div>
  );
}
