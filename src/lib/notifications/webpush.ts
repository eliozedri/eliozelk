import { notificationsApi } from "@/lib/notifications/client";

// Browser-side Web Push lifecycle + readiness. Opt-in only: permission is requested
// solely from an explicit user action (enablePush) — nothing here auto-prompts.

const SW_PATH = "/sw.js";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export interface PushReadiness {
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
  configured: boolean; // public VAPID key present in the client build
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function publicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function permissionState(): PushPermission {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function getReadiness(): Promise<PushReadiness> {
  const supported = pushSupported();
  if (!supported) {
    return { supported: false, permission: "unsupported", subscribed: false, configured: !!publicKey() };
  }
  const sub = await currentSubscription();
  return {
    supported: true,
    permission: Notification.permission as PushPermission,
    subscribed: !!sub,
    configured: !!publicKey(),
  };
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return navigator.serviceWorker.register(SW_PATH);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Enable push for THIS device: register SW → request permission → subscribe →
// persist to the server. Returns false (without throwing) on any blocker.
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const key = publicKey();
  if (!key) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!reg) return false;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  return notificationsApi.subscribePush(sub.toJSON(), navigator.userAgent);
}

// Disable push for THIS device: unsubscribe locally + remove on the server.
export async function disablePush(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  return notificationsApi.unsubscribePush(endpoint);
}
