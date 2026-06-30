self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // 모든 등록된 캐시를 강제로 완전히 삭제하여 PWA 캐시 오염을 치료합니다.
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  // 캐싱을 완전히 건너뛰고 100% 실시간 네트워크만 사용하도록 강제합니다.
  event.respondWith(fetch(event.request));
});
