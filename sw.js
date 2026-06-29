const CACHE_NAME = 'coway-discount-nw-static17';

// 캐시 대상 리소스 목록
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // 이전 버전의 캐시 모두 초기화 (강력한 새 캐시 적용)
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // POST 방식 등은 캐시하지 않고 무시
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    // 1. 네트워크 통신을 먼저 시도 (Network-First)
    fetch(event.request)
      .then(networkResponse => {
        // 성공 시: 최신 데이터를 응답하면서, 동시에 캐시에 저장해둔다.
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // 2. 오프라인이거나 네트워크가 끊겨 에러 발생 시:
        // 백업되어 있던 캐시에서 문서를 찾아서 반환 (Offline-Fallback)
        return caches.match(event.request).then(cachedResponse => {
          // 캐시가 있으면 캐시 반환
          if (cachedResponse) {
            return cachedResponse;
          }
          // 캐시에도 없다면 오프라인 fallback 로직
          // index.html 등 중요 자산의 fallback 처리 가능
        });
      })
  );
});
