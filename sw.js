/**
 * sw.js — Service Worker (PWA)
 * Cache-first para assets estáticos; network-first para dados JSON.
 * Versão: incrementar CACHE_NAME ao fazer deploy com mudanças.
 *
 * Caminhos relativos (e verificação de /data/ relativa a self.registration.scope)
 * para funcionar tanto na raiz de um domínio quanto num subcaminho
 * (ex.: GitHub Pages de projeto, "usuario.github.io/acolitoscoroinhas/").
 */

const CACHE_NAME = 'acolitos-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './escalas.html',
  './calendario.html',
  './noticias.html',
  './css/main.css',
  './css/components.css',
  './css/print.css',
  './js/app.js',
  './js/countdown.js',
  './js/schedule-generator.js',
  './js/partials.js',
  './js/shared/dom-utils.js',
  './js/shared/date-utils.js',
  './js/shared/constants.js',
  './js/shared/mass-render.js',
  './js/shared/absence-modal.js',
  './js/pages/home.js',
  './js/pages/escalas.js',
  './js/pages/noticias.js',
  './js/pages/search.js',
  './js/pages/calendar.js',
  './partials/navbar.html',
  './partials/footer.html',
  './favicon.svg',
  './icon-maskable.svg',
  './manifest.json',
];

// Instala e pré-cacheia assets estáticos.
// Usa cache.add() individual (não o cache.addAll() atômico) porque
// addAll() rejeita a instalação inteira se UM único recurso falhar —
// incluindo por redirecionamento (alguns servidores estáticos, como o
// "serve" com clean URLs, redirecionam "pagina.html" -> "pagina", o que
// já foi o suficiente para travar a instalação do service worker aqui).
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)))
        .then(results => {
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              console.warn(`[sw] Falha ao pré-cachear ${STATIC_ASSETS[i]}:`, r.reason);
            }
          });
        })
    ).then(() => self.skipWaiting())
  );
});

// Remove caches antigos ao ativar
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Caminho de /data/ relativo ao escopo do service worker (não à raiz do
// domínio) — necessário para funcionar corretamente se o site for servido
// de um subcaminho.
const DATA_PATH = new URL('data/', self.registration.scope).pathname;

// Estratégia de fetch
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requests que não são GET
  if (request.method !== 'GET') return;
  // Ignora origens externas (Google Fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // Arquivos JSON de dados: network-first (garante dados atualizados)
  if (url.pathname.startsWith(DATA_PATH)) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
