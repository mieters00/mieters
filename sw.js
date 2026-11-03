// Service worker: ontvangt meldingen, ook als Mieters dicht is.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (_) {}
    // Op een iPad moet elke push ook echt een melding tonen, anders trekt Apple de toestemming in.
    e.waitUntil(self.registration.showNotification(d.titel || 'Mieters', {
        body: d.tekst || '',
        tag: d.tag || undefined,
        renotify: !!d.tag,              // met dezelfde tag vervangt een nieuwe melding de oude, maar je hoort hem wel
        icon: 'image/icon-192.png',
        badge: 'image/icon-192.png',
        data: { url: d.url || '#/' },
    }));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    const hash = (e.notification.data && e.notification.data.url) || '#/';
    e.waitUntil((async () => {
        const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const w of open) {
            if (w.url.startsWith(self.registration.scope)) { await w.focus(); w.postMessage({ gaNaar: hash }); return; }
        }
        await self.clients.openWindow(self.registration.scope + hash);
    })());
});