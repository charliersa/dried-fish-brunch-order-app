// 顧客手機點餐 App（獨立版）Service Worker（測試）
const CACHE_PREFIX = 'xyg-customer-test-pwa-';
const CACHE_NAME = CACHE_PREFIX + 'v14';
const ASSETS = [
  './',
  './index.html',
  './feedback.html',
  './core/shared.js',
  './firebase-config.js',
  './manifest.json',
  './sw.js',
  './pwa-install.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // 逐一快取：單一檔案抓不到（改名／暫時 404）不該讓整個 Service Worker 安裝失敗
      Promise.all(ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('[sw] 略過快取', url, err))
      ))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      // 只刪自己這支 App 的舊版快取；同一個網域底下還有別站的 SW，不要互相清掉
      keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  // Firebase SDK 函式庫（gstatic）：版本化、不變 → cache-first，讓離線也能載入 Firebase（含 Firestore 離線持久化）
  const isFirebaseLib = url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') !== -1;

  if (isFirebaseLib) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // 其他跨網域（Firestore 連線）不攔截，交給 Firebase SDK（離線由其 IndexedDB 持久化處理）
  if (!sameOrigin) return;

  // 同源：network-first（有網拿最新版，避免改版被舊快取卡住；離線退回快取）
  event.respondWith(
    fetch(req).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      }
      return response;
    }).catch(() => caches.match(req).then(cached => {
      if (cached) return cached;
      if (req.destination === 'document') return caches.match('./index.html');
    }))
  );
});
