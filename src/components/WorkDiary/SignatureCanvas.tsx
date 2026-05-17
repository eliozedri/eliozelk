"use client";

import { useRef, useEffect, useCallback } from "react";

interface Props {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export function SignatureCanvas({ value, onChange, disabled = false, hasError = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, [value]);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      drawing.current = true;
      lastPos.current = getPos(e);
      canvasRef.current?.setPointerCapture(e.pointerId);
    },
    [disabled]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current || !lastPos.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#1e3a5f";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      lastPos.current = pos;
    },
    []
  );

  const onPointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }, [onChange]);

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`border rounded-lg overflow-hidden bg-white ${
          disabled ? "opacity-60" : "cursor-crosshair"
        } ${hasError ? "border-red-400 ring-1 ring-red-400" : "border-gray-300"}`}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={140}
          className="w-full touch-none block"
          style={{ height: 100 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="self-start text-xs text-gray-500 hover:text-red-500 underline transition-colors"
        >
          נקה חתימה
        </button>
      )}
      {hasError && !value && (
        <p className="text-xs text-red-500 font-medium">נדרשת חתימה לפני השליחה</p>
      )}
      {!hasError && !value && !disabled && (
        <p className="text-xs text-gray-400">חתום כאן באצבע או בעכבר</p>
      )}
    </div>
  );
}
