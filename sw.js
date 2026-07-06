const CACHE_NAME = 'lending-book-v2';
const urlsToCache = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  // 立即接管，不等待旧 SW 释放
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(() => {
        return Promise.allSettled(
          urlsToCache.map(url => cache.add(url).catch(() => {}))
        );
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  // 立即接管所有页面
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 网络请求成功 → 更新缓存 → 返回新内容
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, cloned);
        });
        return response;
      })
      .catch(() => {
        // 网络失败 → 返回缓存（离线时使用）
        return caches.match(event.request);
      })
  );
});
