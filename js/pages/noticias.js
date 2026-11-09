/**
 * pages/noticias.js — Lógica da página de Notícias & Avisos (noticias.html)
 *
 * Responsável por:
 *  - Exibir todos os itens carregados de noticias.json
 *  - Filtrar por tipo: todos / avisos / notícias / novidades
 *  - Destacar avisos fixados (pinned) e de alta prioridade
 */
import { App } from '../app.js';
import { NEWS_TYPE_ICONS, NEWS_TYPE_ACCENTS, NEWS_TYPE_BADGES, NEWS_TYPE_EYEBROWS, PRIORITY_ORDER } from '../shared/constants.js';
import { formatNewsDate } from '../shared/date-utils.js';
import { escapeHtml, Modal } from '../shared/dom-utils.js';

let _items = [];
let _filter = 'all'; // 'all' | 'aviso' | 'noticia' | 'novidade'

async function init() {
  _items = App.getNoticias() ?? [];
  render();
  bindEvents();
  renderStats();
}

function render() {
  renderPinned();
  renderGrid();
}

// ── Avisos fixados no topo ────────────────────────────────────
function renderPinned() {
  const container = document.getElementById('pinnedSection');
  if (!container) return;

  const pinned = _items
    .filter(n => n.pinned)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));

  if (pinned.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';

  const pinnedContainer = container.querySelector('#pinnedList');
  if (pinnedContainer) {
    pinnedContainer.innerHTML = pinned.map(n => renderAnnouncementItem(n)).join('');
  }
}

// ── Grade principal de cards ──────────────────────────────────
function renderGrid() {
  const container = document.getElementById('newsContainer');
  if (!container) return;

  let filtered = [..._items];
  if (_filter !== 'all') {
    filtered = filtered.filter(n => n.type === _filter);
  }

  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.date ?? '').localeCompare(a.date ?? '');
  });

  updateFilterCounts();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">🔍</div>
        <h3>Nenhum item encontrado</h3>
        <p>Não há conteúdo para o filtro selecionado.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(n => renderCard(n)).join('');

  container.querySelectorAll('[data-notice-id]').forEach(card => {
    const open = () => openNoticeModal(Number(card.dataset.noticeId));
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

// ── Card completo ─────────────────────────────────────────────
function renderCard(item) {
  const accentCls = NEWS_TYPE_ACCENTS[item.type] ?? '';
  const badge = NEWS_TYPE_BADGES[item.type] ?? NEWS_TYPE_BADGES.noticia;
  const hasCover = !!item.imageUrl;

  const priorityBadge = item.priority === 'high'
    ? '<span class="badge badge-red">Urgente</span>'
    : item.priority === 'low'
      ? '<span class="badge" style="background:var(--border-subtle);color:var(--text-muted)">Informativo</span>'
      : '';

  const pinnedTag = item.pinned
    ? '<span title="Fixado" style="font-size:0.9rem;">📌</span>'
    : '';

  const coverHtml = hasCover
    ? `<div class="news-card-cover">
         <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="news-card-cover-img" loading="lazy"
              onerror="this.closest('.news-card-cover').remove()" />
         <div class="news-card-cover-gradient"></div>
       </div>`
    : '';

  const customBadge = item.badge
    ? `<span class="badge badge-purple">${escapeHtml(item.badge)}</span>`
    : '';

  return `
    <div class="news-card ${item.priority === 'high' ? 'priority-high' : ''} ${hasCover ? 'has-cover' : ''}"
         ${(item.content || item.contentFull) ? `data-notice-id="${item.id}" role="button" tabindex="0" title="Clique para ler o conteúdo completo"` : ''}>
      ${coverHtml}
      <div class="news-card-accent ${accentCls}"></div>
      <div class="news-card-body">
        <div class="news-card-meta">
          <span class="badge ${badge.cls}">${badge.label}</span>
          ${customBadge}
          ${priorityBadge}
          ${pinnedTag}
        </div>
        <h3 class="news-card-title">${escapeHtml(item.title)}</h3>
        <p class="news-card-content" style="-webkit-line-clamp:${hasCover ? 3 : 5};">${escapeHtml(item.content)}</p>
      </div>
      <div class="news-card-footer">
        <span style="display:flex;align-items:center;gap:6px;">
          <span>📅</span>
          <span>${formatNewsDate(item.date)}</span>
        </span>
        <span style="color:var(--text-muted);">${escapeHtml(item.author ?? '')}</span>
      </div>
    </div>
  `;
}

// ── Item de aviso (estilo lista) ──────────────────────────────
function renderAnnouncementItem(item) {
  const priorityClass = item.priority === 'high' ? 'high' : 'normal';

  return `
    <div class="announcement-item ${priorityClass}">
      <div class="announcement-icon">${NEWS_TYPE_ICONS[item.type] ?? '📌'}</div>
      <div class="announcement-content">
        <div class="announcement-header">
          <span class="announcement-title">${escapeHtml(item.title)}</span>
          ${item.priority === 'high' ? '<span class="badge badge-warning">Urgente</span>' : ''}
        </div>
        <p class="announcement-text">${escapeHtml(item.content)}</p>
        <div class="announcement-meta">
          <span>📅 ${formatNewsDate(item.date)}</span>
          ${item.author ? `<span>• ${escapeHtml(item.author)}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ── Contadores das abas ───────────────────────────────────────
function updateFilterCounts() {
  const total = _items.length;
  const avisos = _items.filter(n => n.type === 'aviso').length;
  const noticias = _items.filter(n => n.type === 'noticia').length;
  const novidades = _items.filter(n => n.type === 'novidade').length;

  setCount('countAll', total);
  setCount('countAvisos', avisos);
  setCount('countNoticias', noticias);
  setCount('countNovidades', novidades);
}

function setCount(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value > 0 ? ` (${value})` : '';
}

// ── Estatísticas do cabeçalho ─────────────────────────────────
function renderStats() {
  const total = _items.length;
  const pinned = _items.filter(n => n.pinned).length;
  const urgente = _items.filter(n => n.priority === 'high').length;

  const elTotal = document.getElementById('statsTotal');
  const elPinned = document.getElementById('statsPinned');
  const elUrgente = document.getElementById('statsUrgente');

  if (elTotal) elTotal.textContent = total;
  if (elPinned) elPinned.textContent = pinned;
  if (elUrgente) elUrgente.textContent = urgente;
}

// ── Modal de aviso / notícia ─────────────────────────────────
function openNoticeModal(id) {
  const item = _items.find(n => n.id === id);
  if (!item) return;

  const overlay = document.getElementById('noticeModal');
  if (!overlay) return;

  document.getElementById('noticeModalEyebrow').textContent = item.badge ?? NEWS_TYPE_EYEBROWS[item.type] ?? 'Aviso';
  document.getElementById('noticeModalTitle').textContent = item.title;
  document.getElementById('noticeModalDate').textContent = `📅 ${formatNewsDate(item.date)}`;
  document.getElementById('noticeModalAuthor').textContent = item.author ? `• ${item.author}` : '';

  const imageHtml = item.imageUrl
    ? `<div class="modal-cover-wrap">
         <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="modal-cover-img" loading="lazy"
              onerror="this.closest('.modal-cover-wrap').remove()" />
       </div>`
    : '';

  const rawContent = item.contentFull ?? item.content ?? '';
  const textHtml = rawContent.split('\n\n').filter(Boolean).map(block => {
    if (block.includes('\n•') || block.startsWith('•')) {
      const lines = block.split('\n').filter(Boolean);
      return `<ul>${lines.map(l => `<li>${escapeHtml(l.replace(/^•\s*/, ''))}</li>`).join('')}</ul>`;
    }
    if (block.startsWith('📍')) return `<p class="modal-address">${escapeHtml(block)}</p>`;
    return `<p>${escapeHtml(block)}</p>`;
  }).join('');

  document.getElementById('noticeModalBody').innerHTML = imageHtml + textHtml;

  Modal.open(overlay);
  document.getElementById('noticeModalClose')?.focus();
}

function closeNoticeModal() {
  Modal.close(document.getElementById('noticeModal'));
}

// ── Eventos ───────────────────────────────────────────────────
function bindEvents() {
  document.querySelectorAll('[data-news-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      _filter = btn.dataset.newsFilter;
      document.querySelectorAll('[data-news-filter]').forEach(b => b.classList.toggle('active', b === btn));
      renderGrid();
    });
  });

  const overlay = document.getElementById('noticeModal');
  document.getElementById('noticeModalClose')?.addEventListener('click', closeNoticeModal);
  document.getElementById('noticeModalCloseFooter')?.addEventListener('click', closeNoticeModal);
  Modal.bindDismiss(overlay, closeNoticeModal);
}

export const Noticias = { init };
