// Adds the cross-origin isolation headers that the threaded WebAssembly build
// needs on static hosts such as GitHub Pages, and keeps a copy of the app
// files in this browser so the page can open offline after one online visit.
'use strict';

// Change this name (for example to 'azahar-app-v2') when you update the site,
// so browsers drop the old copy and download the new files.
const CACHE_NAME = 'azahar-app-v1';

// Files the page needs to start, relative to this folder.
const APP_FILES = [
    './',
    'index.html',
    'app-icon.svg',
    'games_library.json',
    'azahar_layout.js',
    'azahar_ui.js',
    'azahar_input.js',
    'azahar_touch_controls.js',
    'azahar_savestates.js',
    'azahar_fullscreen.js',
    'azahar_romfs.js',
    'azahar_scheduler.js',
    'azahar_audio.js',
    'azahar_library.js',
    'azahar_netplay.js',
    'azahar_lobbies.js',
    'azahar.js',
    'azahar.wasm',
    'azahar_webgl2.js',
    'azahar_webgl2.wasm',
];

// Ordinary static files and folder addresses are stored; everything else
// goes straight to the network.
const STORABLE = /(\.(html|js|wasm|json|css|svg|png|ico)|\/)$/;

self.addEventListener('install', event => {
    event.waitUntil(storeAppFiles().finally(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(removeOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    event.respondWith(answer(event.request, url));
});

async function storeAppFiles() {
    try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(APP_FILES.map(async file => {
            const address = new URL(file, self.registration.scope).href;
            try {
                const response = await fetch(address);
                if (response.ok) await cache.put(address, response);
            } catch (_) {
                // Not reachable right now; it is stored the first time the page asks for it.
            }
        }));
    } catch (_) {
        // Storage unavailable: the site still works online.
    }
}

async function removeOldCaches() {
    try {
        for (const key of await caches.keys()) {
            if (key.startsWith('azahar-app-') && key !== CACHE_NAME) {
                await caches.delete(key);
            }
        }
    } catch (_) {}
}

async function answer(request, url) {
    const canUseCache = request.method === 'GET' &&
        request.cache !== 'no-store' &&
        !request.headers.has('range') &&
        STORABLE.test(url.pathname);

    if (canUseCache) {
        const saved = await findSaved(request);
        if (saved) return isolated(saved);
    }

    const response = await fetch(request);
    if (canUseCache) await keep(request, response);
    return isolated(response);
}

async function findSaved(request) {
    try {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(request, {ignoreSearch: true});
    } catch (_) {
        return undefined;
    }
}

async function keep(request, response) {
    if (!response.ok || response.type !== 'basic') return;
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    } catch (_) {}
}

function isolated(response) {
    if (response.status === 0 || response.type === 'opaqueredirect' || response.type === 'opaque') {
        return response;
    }
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
