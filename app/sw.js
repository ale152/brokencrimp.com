// **The service worker that makes Broken Crimp a web APP rather than a web page**
// (S228, 2026-09-19 — `docs/context/web.md` §Phase 3 (h)).
//
// This file is the TEMPLATE and it is what a reader should review; the worker that ships is
// this with the two placeholders below filled in by `:web`'s `pwaServiceWorker` task, which is
// also what writes it into the distribution. Both substitutions are load-bearing:
//
//  * FILES is the precache list, and it cannot be hand-written because webpack content-hashes
//    the two `.wasm` files — their names change with every build that changes a byte of Kotlin;
//  * VERSION is a digest of that list. **A worker whose bytes do not change is a worker the
//    browser will not replace**, and that is the trap this design exists to avoid: the browser
//    re-fetches `sw.js` on navigation and compares it byte for byte, so a static worker over a
//    changed app would serve the OLD cached build for ever. Baking the version in means every
//    deploy that changes any file changes this script, which is the whole update mechanism.
//
// **The placeholder tokens appear exactly once each, and the build asserts it.** Writing either
// of them in this prose is how the first draft of this file shipped a worker whose header
// comment had a ten-line array spliced into it — a syntax error, a registration that failed, and
// an app that went on working perfectly online. Which is the shape of every service-worker bug:
// nothing is wrong until the network is gone.
//
// **What offline means here, and it changed at S235.** `CLAUDE.md`'s ruling is that
// offline-first is a statement about the reader's DATA, not about the process, because the
// Android app carries AdMob and therefore makes network requests. Until S235 the web version
// was the stronger thing — no ads, and so no request at all once this worker had run — and that
// sentence stood in this comment as a measurement (six resources at boot and none after).
//
// **It now holds only while no ad ids are configured**, which is every build until the owner
// pastes an AdSense client in (`WebAdIds.kt`). Where they ARE, the page adds two third-party
// scripts of its own accord and the ads make requests of their own for as long as it is open.
//
// **None of that reaches this worker, and that is by construction rather than by luck.** The
// early return below is on the URL's own prefix: everything an ad touches is on a Google origin,
// which is outside `ROOT`, so it is never matched, never cached and never served from a cache.
// The app's own six files behave exactly as they did. And the sentence that actually matters to
// a reader is untouched either way: **the climbs, the photos and the betas still come out of
// IndexedDB and still go nowhere**, with or without an ad on the page.

const VERSION = '8310eb0ef2ba5cbe';
const CACHE = 'brokencrimp-' + VERSION;
const FILES = [
    './',
    '5a894c3b9f3b2fbe7f5c.wasm',
    '6e23e5428398b92da386.wasm',
    'brokencrimp.js',
    'composeResources/com.brokencrimp.app/drawable/app_icon.png',
    'composeResources/com.brokencrimp.app/values-it/strings.commonMain.cvr',
    'composeResources/com.brokencrimp.app/values/strings.commonMain.cvr',
    'composeResources/com.brokencrimp.web.res/files/silence.beta',
    'composeResources/com.brokencrimp.web.res/font/digits.ttf',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'index.html',
    'manifest.json',
];

// The directory this worker was served from, which is also its scope: the app is deployed under
// a path (`/broken-crimp/app/` on the live site) and served from the root in development, so
// every URL here is relative and nothing knows where it lives.
const ROOT = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
    // **All of it or none of it.** `addAll` rejects if any single request fails, which fails the
    // install and leaves the previous worker (or none) in charge. That is the right failure: a
    // half-precached app is an app that opens offline and then dies at the first thing it
    // reaches for, which is worse than one that plainly needs the network.
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(FILES)),
    );
    // **`skipWaiting` is safe HERE, and that is a measurement about this app rather than a
    // general opinion** (S228). The usual objection is real: a worker that seizes a running tab
    // can hand a page from build A an asset from build B, so the default is to wait until every
    // window has closed. This app cannot reach that state — measured in Chrome 153 with
    // `performance.getEntriesByType('resource')` — because it fetches **six resources at boot
    // and none afterwards**: the script, the two wasm modules, the manifest, an icon and the
    // string table. Opening a climb, drawing the canvas and reading a wall photo touch IndexedDB
    // and memory, never the network. There is nothing left to fetch that could come from the
    // wrong build.
    //
    // What waiting costs, against that, is not hypothetical: a worker left waiting stays waiting
    // for as long as ANY tab it controls is open, and a reload does not release it. An installed
    // app the owner keeps open would sit on an old build indefinitely — verified, by simulating a
    // redeploy and watching the new worker stay `installed` across a reload AND across closing
    // and reopening the tab.
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
            // Claim every open page: the FIRST visit becomes offline-capable without a
            // reload, and an update takes effect on the next navigation rather than whenever the
            // reader happens to close the last window.
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    // Anything outside this worker's own directory is somebody else's business. **Since S235
    // there IS something outside it** — the consent platform and the ad script, both on Google
    // origins — and this line is what keeps them out of the cache entirely: not handled, not
    // stored, not replayed offline. An ad is the one thing that must never be served stale.
    if (!request.url.startsWith(ROOT)) return;

    event.respondWith(
        caches.match(request).then((hit) => {
            if (hit) return hit;
            return fetch(request).catch(() => {
                // A navigation that missed the cache is a deep link the precache stored under
                // the directory URL — `#/project/7` never reaches the network, but a query
                // string or a trailing `index.html` does. Answer with the shell; the hash is
                // read by the page itself.
                if (request.mode === 'navigate') return caches.match(ROOT);
                throw new Error('offline and not cached: ' + request.url);
            });
        }),
    );
});
