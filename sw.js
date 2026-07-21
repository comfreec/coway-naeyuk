const CACHE_NAME = 'coway-naeyuk-v4';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/app-icon.png',
  '/w 인덕션.png',
  '/노블.png',
  '/더매너.png',
  '/더블케어.png',
  '/듀얼클린.png',
  '/리클라이닝 마사지셋.png',
  '/마인플러스.png',
  '/명함.png',
  '/모던파운데이션.png',
  '/사용해야되는이유.jpg',
  '/수납형.png',
  '/스마트 s6.png',
  '/스스로케어.png',
  '/스퀘어핏.png',
  '/스킨플러스 연수기.png',
  '/아이콘 얼음.png',
  '/아이콘2.png',
  '/아이콘3.png',
  '/안마의자 페블체어.png',
  '/에어컨.png',
  '/엘리트.png',
  '/우디프레임.png',
  '/음식물 처리기.png',
  '/의류청정기.png',
  '/인버터.png',
  '/카드할인.jpg',
  '/케어상품권.jpg',
  '/코라솔.jpg',
  '/코웨이 연수기.png',
  '/텐셀메모리폼베계.jpg',
  '/텐셀메모리폼베계1.jpg',
  '/트리플체어.png',
  '/하이브리드4.png'
];

self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(FILES_TO_CACHE);
    }).then(() => {
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  console.log('[ServiceWorker] Fetch', event.request.url, event.request.mode);
  
  // 1. 네비게이션 요청: 네트워크 우선, 캐시 폴백
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(fetchResponse => {
          // 캐시 업데이트
          const responseToCache = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return fetchResponse;
        })
        .catch(() => {
          console.log('[ServiceWorker] Navigation failed, using cache');
          return caches.match('/index.html').then(response => {
            return response || caches.match('/');
          });
        })
    );
    return;
  }

  // 2. 정적 리소스 요청: 캐시 우선, 네트워크 폴백 및 캐시 업데이트 (Stale-While-Revalidate)
  event.respondWith(
    caches.match(event.request).then(response => {
      // 캐시에 있으면 캐시 반환, 백그라운드에서 네트워크 요청으로 캐시 업데이트
      const fetchPromise = fetch(event.request).then(fetchResponse => {
        if (!fetchResponse || fetchResponse.status !== 200) {
          return fetchResponse;
        }
        const responseToCache = fetchResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return fetchResponse;
      }).catch(err => {
        console.warn('[ServiceWorker] Network fetch failed:', err);
      });

      // 캐시 응답 반환, 없으면 네트워크 응답 기다림
      return response || fetchPromise;
    })
  );
});
