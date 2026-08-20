self.addEventListener('push', (event) => {
  let data = { title: 'Tyson', body: 'У вас новое уведомление', url: '/', tag: 'tyson-notification' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* Use safe defaults. */ }
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      data: { url: data.url },
    }),
    self.registration.setAppBadge ? self.registration.setAppBadge(1) : Promise.resolve(),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    if (self.registration.clearAppBadge) await self.registration.clearAppBadge();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (current) { await current.navigate(target); return current.focus(); }
    return self.clients.openWindow(target);
  })());
});
