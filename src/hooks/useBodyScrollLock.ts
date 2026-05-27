"use client";

import { useEffect } from "react";

// Locks <body> scroll while `locked` is true and restores the prior scroll
// position on release. Uses position:fixed rather than `overflow:hidden`
// because iOS Safari ignores overflow:hidden for touch-scroll — the page
// behind a modal/drawer keeps scrolling. Nested locks are reference-counted so
// two overlapping consumers (e.g. drawer + modal) don't clobber each other.
let lockCount = 0;
let savedScrollY = 0;
let savedStyle: Partial<CSSStyleDeclaration> = {};

function engageLock() {
  lockCount += 1;
  if (lockCount > 1) return; // already locked by an outer consumer
  savedScrollY = window.scrollY;
  const body = document.body;
  savedStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
}

function releaseLock() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return; // an outer consumer still holds the lock
  const body = document.body;
  body.style.position = savedStyle.position ?? "";
  body.style.top = savedStyle.top ?? "";
  body.style.left = savedStyle.left ?? "";
  body.style.right = savedStyle.right ?? "";
  body.style.width = savedStyle.width ?? "";
  body.style.overflow = savedStyle.overflow ?? "";
  window.scrollTo(0, savedScrollY);
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof window === "undefined") return;
    engageLock();
    return () => releaseLock();
  }, [locked]);
}
