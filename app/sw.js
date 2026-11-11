

const VERSION = '413f5bc623ef3d52';
const CACHE = 'brokencrimp-' + VERSION;
const FILES = [
    './',
    '6e23e5428398b92da386.wasm',
    'brokencrimp.js',
    'c4a2a29f061d5a74eb7b.wasm',
    'composeResources/com.brokencrimp.app/drawable/app_icon.png',
    'composeResources/com.brokencrimp.app/drawable/climb_style_boulder.png',
    'composeResources/com.brokencrimp.app/drawable/climb_style_sport.png',
    'composeResources/com.brokencrimp.app/drawable/climb_style_trad.png',
    'composeResources/com.brokencrimp.app/values-it/strings.commonMain.cvr',
    'composeResources/com.brokencrimp.app/values/strings.commonMain.cvr',
    'composeResources/com.brokencrimp.web.res/files/burden_of_dreams.beta',
    'composeResources/com.brokencrimp.web.res/files/dna.beta',
    'composeResources/com.brokencrimp.web.res/files/silence.beta',
    'composeResources/com.brokencrimp.web.res/font/digits.ttf',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'index.html',
    'manifest.json',
];

const ROOT = new URL('./', self.location).href;

self.addEventListener('install', (event) => {

    event.waitUntil(
        caches.open(CACHE).then((cache) =>
            cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' })))),
    );

    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names
                    .filter((name) => name.startsWith('brokencrimp-') && name !== CACHE)
                    .map((name) => caches.delete(name)),
            ))

            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    if (!request.url.startsWith(ROOT)) return;

    event.respondWith(
        caches.match(request).then((hit) => {
            if (hit) return hit;
            return fetch(request).catch(() => {

                if (request.mode === 'navigate') return caches.match(ROOT);
                throw new Error('offline and not cached: ' + request.url);
            });
        }),
    );
});
