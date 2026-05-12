"use client";

import { useRef } from "react";
import { nanoid } from "nanoid";
import type { DiaryPhoto } from "@/types/workDiary";

const MAX_PHOTOS = 5;
const MAX_DIM = 800;

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  photos: DiaryPhoto[];
  onChange: (photos: DiaryPhoto[]) => void;
  disabled?: boolean;
}

export function PhotoUpload({ photos, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_PHOTOS - photos.length;
    const toProcess = Array.from(files).slice(0, remaining);
    const newPhotos: DiaryPhoto[] = [];
    for (const file of toProcess) {
      try {
        const dataUrl = await compressImage(file);
        newPhotos.push({
          id: nanoid(),
          dataUrl,
          caption: "",
          takenAt: new Date().toISOString(),
        });
      } catch {
        // skip failed images
      }
    }
    onChange([...photos, ...newPhotos]);
  }

  function updateCaption(id: string, caption: string) {
    onChange(photos.map((p) => (p.id === id ? { ...p, caption } : p)));
  }

  function removePhoto(id: string) {
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-3">
      {photos.map((photo, idx) => (
        <div
          key={photo.id}
          className="flex gap-3 items-start bg-gray-50 rounded-lg p-2 border border-gray-200"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.dataUrl}
            alt={`תמונה ${idx + 1}`}
            className="w-20 h-20 object-cover rounded-lg shrink-0"
          />
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={photo.caption}
              onChange={(e) => updateCaption(photo.id, e.target.value)}
              placeholder="תיאור (אופציונלי)"
              disabled={disabled}
              className="w-full px-2 py-1 text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              {new Date(photo.takenAt).toLocaleTimeString("he-IL")}
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => removePhoto(photo.id)}
              className="text-gray-400 hover:text-red-500 transition-colors shrink-0 mt-1"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {!disabled && photos.length < MAX_PHOTOS && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors w-full justify-center"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            הוסף תמונה ({photos.length}/{MAX_PHOTOS})
          </button>
        </>
      )}
    </div>
  );
}
