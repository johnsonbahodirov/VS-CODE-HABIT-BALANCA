self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }
  const title = payload.title || "A little nudge from Balance";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Take a moment to check in with your habits.",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: payload.url || "/today" },
      tag: "balance-daily-reminder",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === target && "focus" in client);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    }),
  );
});
