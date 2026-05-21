"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";

export interface ModalOverride {
  title?: string;
  subtitle?: string;
  saveDraftLabel?: string;
  discardLabel?: string;
  hideSaveDraft?: boolean;
}

export interface NavigationGuard {
  isDirty: boolean;
  onSaveDraft: () => Promise<void>;
  onDiscard: () => void;
  modalOverride?: ModalOverride;
}

interface NavigationGuardContextValue {
  guard: NavigationGuard | null;
  registerGuard: (g: NavigationGuard) => void;
  clearGuard: () => void;
  // Modal state
  showModal: boolean;
  pendingHref: string | null;
  requestNavigate: (href: string) => void;   // called by Sidebar links
  confirmSaveDraft: () => Promise<void>;
  confirmDiscard: () => void;
  confirmStay: () => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const [guard, setGuard] = useState<NavigationGuard | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const guardRef = useRef<NavigationGuard | null>(null);

  const registerGuard = useCallback((g: NavigationGuard) => {
    guardRef.current = g;  // sync — requestNavigate reads this during click handlers
    setGuard(g);           // async — triggers Sidebar re-render to switch Link→button
  }, []);

  const clearGuard = useCallback(() => {
    setGuard(null);
    guardRef.current = null;
  }, []);

  const requestNavigate = useCallback((href: string) => {
    const current = guardRef.current;
    if (current?.isDirty) {
      setPendingHref(href);
      setShowModal(true);
    } else {
      // Navigate immediately — caller handles actual navigation
      setPendingHref(href);
      setShowModal(false);
    }
  }, []);

  const confirmSaveDraft = useCallback(async () => {
    const current = guardRef.current;
    if (current) {
      await current.onSaveDraft();
    }
    setShowModal(false);
    // Navigation will proceed after draft save — pendingHref remains for caller to use
  }, []);

  const confirmDiscard = useCallback(() => {
    const current = guardRef.current;
    if (current) {
      current.onDiscard();
    }
    setGuard(null);
    guardRef.current = null;
    setShowModal(false);
    // Navigation proceeds — pendingHref remains for caller to use
  }, []);

  const confirmStay = useCallback(() => {
    setPendingHref(null);
    setShowModal(false);
  }, []);

  return (
    <NavigationGuardContext.Provider value={{
      guard,
      registerGuard,
      clearGuard,
      showModal,
      pendingHref,
      requestNavigate,
      confirmSaveDraft,
      confirmDiscard,
      confirmStay,
    }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) throw new Error("useNavigationGuard must be used inside NavigationGuardProvider");
  return ctx;
}

// Hook used by forms to register dirty state + callbacks
export function useDirtyGuard(options: {
  isDirty: boolean;
  onSaveDraft: () => Promise<void>;
  onDiscard: () => void;
  modalOverride?: ModalOverride;
}) {
  const { registerGuard, clearGuard } = useNavigationGuard();

  useEffect(() => {
    registerGuard({
      isDirty: options.isDirty,
      onSaveDraft: options.onSaveDraft,
      onDiscard: options.onDiscard,
      modalOverride: options.modalOverride,
    });
  }, [options.isDirty, options.onSaveDraft, options.onDiscard, options.modalOverride, registerGuard]);

  // Always unregister on unmount (form left)
  useEffect(() => {
    return () => clearGuard();
  }, [clearGuard]);

  // beforeunload fallback for browser refresh/close
  useEffect(() => {
    if (!options.isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [options.isDirty]);
}
