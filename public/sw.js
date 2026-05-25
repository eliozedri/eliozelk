/* Elkayam notifications service worker — display + click routing only.
   It NEVER acknowledges anything: acknowledgement happens in-app and the DB is the
   source of truth. A push click just focuses/opens the app at the related item. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "התראה", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "התראה";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    dir: "rtl",
    lang: "he",
    icon: "/elkayam-logo.png",
    badge: "/elkayam-logo.png",
    data: { url: data.url || "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
