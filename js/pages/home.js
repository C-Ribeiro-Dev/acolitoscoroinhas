/**
 * pages/home.js — Lógica da página inicial (index.html)
 *
 * Responsável por: estatísticas rápidas (com modais de detalhe), prévia
 * da próxima escala no hero, escala da semana, próximas escalas, avisos
 * fixados e últimas notícias.
 */
import { App } from '../app.js';
import { ScheduleGenerator } from '../schedule-generator.js';
import { Countdown } from '../countdown.js';
import { STATUS_LABELS, NEWS_TYPE_ICONS, NEWS_TYPE_ACCENTS, NEWS_TYPE_BADGES, NEWS_TYPE_EYEBROWS, PRIORITY_ORDER } from '../shared/constants.js';
import { formatWeekRange, formatDateBR, formatDateFull, formatNewsDate, getArrivalTime } from '../shared/date-utils.js';
import { renderMassParticipants, getUpcomingMissasEspeciais, buildMissaEspecialCard, arrivalInfoHtml } from '../shared/mass-render.js';
import { escapeHtml, Modal, normalizeText } from '../shared/dom-utils.js';

async function init() {
  renderStats();
  renderSpecialMassesHome();
  renderHeroSchedulePreview();
  renderHomeScheduleSection();
  renderUpcomingSchedules();
  renderPinnedAnnouncements();
  renderLatestNews();
  bindStatCards();
  bindAnnouncementModal();
}

// ── Missas Especiais (página inicial) ───────────────────────────
function renderSpecialMassesHome() {
  const container = document.getElementById('homeSpecialMasses');
  if (!container) return;

  const missas = getUpcomingMissasEspeciais();
  if (missas.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = missas.map(m => buildMissaEspecialCard(m, { compact: false })).join('');
}

// ── Prévia da próxima escala no hero ──────────────────────────────
function renderHeroSchedulePreview() {
  const container = document.getElementById('heroSchedulePreview');
  if (!container) return;

  // Mesma lógica do contador: próxima celebração (regular OU especial)
  const next = Countdown.getNextMass();
  if (!next) { container.innerHTML = ''; return; }

  if (next.mass.isSpecial) {
    const m = next.mass.data;
    const arrival = getArrivalTime(m.time);
    container.innerHTML = `
      <div class="hero-next-schedule-card hero-next-special">
        <div class="hero-next-schedule-header">
          <div class="hero-next-schedule-title">
            <span class="smc-badge-special" style="font-size:0.7rem;padding:3px 8px;">${m.icon ?? '✨'} Celebração Especial</span>
            <span class="hero-next-schedule-date" style="font-weight:700;color:var(--text-primary);">${escapeHtml(m.name)}</span>
          </div>
          <span class="badge badge-gold">Próxima celebração</span>
        </div>
        <div class="hero-next-schedule-participants" style="font-size:0.82rem;color:var(--text-secondary);margin-top:6px;">
          ${escapeHtml(m.dayName)} · ${formatDateBR(m.date)} · ${escapeHtml(m.time)}
        </div>
        <div class="arrival-info arrival-info-sm">
          <div class="arrival-sm-row">
            <span class="arrival-clock" aria-hidden="true">🕖</span>
            <span><strong>Chegada:</strong> ${arrival} (1 hora antes)</span>
          </div>
          <div class="arrival-sm-row">
            <span aria-hidden="true">⛪</span>
            <span>Responsabilidade: organizar o altar e preparar os materiais litúrgicos.</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const result = ScheduleGenerator.run();
  const schedules = result.schedules;
  const config = App.getConfig();

  let week = schedules.find(w => w.status === 'current');
  if (!week) week = schedules.find(w => w.status === 'upcoming');
  if (!week) { container.innerHTML = ''; return; }

  const now = new Date();
  let nextMass = null;
  let nextMassConfig = null;

  for (const mass of (week.masses ?? [])) {
    const mc = config?.masses?.find(m => m.id === mass.massId);
    if (!mc) continue;
    const d = new Date(mass.date + 'T00:00:00');
    d.setHours(mc.timeHour ?? 0, mc.timeMinute ?? 0, 0, 0);
    if (d > now) { nextMass = mass; nextMassConfig = mc; break; }
  }

  if (!nextMass && week.masses?.length > 0) {
    nextMass = week.masses[0];
    nextMassConfig = config?.masses?.find(m => m.id === nextMass.massId);
  }

  if (!nextMass) { container.innerHTML = ''; return; }

  const pids = nextMass.participants ?? [];
  const heroCtx = {
    celebracao: nextMassConfig?.label ?? nextMass.massId,
    data: formatDateBR(nextMass.date),
    horario: nextMassConfig?.time ?? '',
  };
  const chipsHtml = renderMassParticipants(pids, heroCtx, true);
  const arrivalHero = nextMassConfig?.time ? getArrivalTime(nextMassConfig.time) : null;

  container.innerHTML = `
    <div class="hero-next-schedule-card">
      <div class="hero-next-schedule-header">
        <div class="hero-next-schedule-title">
          <span class="mass-time-badge ${nextMass.massId}">${escapeHtml(nextMassConfig?.shortLabel ?? nextMass.massId)}</span>
          <span class="hero-next-schedule-date">${formatDateFull(nextMass.date)}</span>
        </div>
        <span class="badge badge-green">Próxima escala</span>
      </div>
      <div class="hero-next-schedule-participants">
        ${chipsHtml}
      </div>
      ${arrivalHero ? `<div class="arrival-info arrival-info-sm">
        <div class="arrival-sm-row">
          <span class="arrival-clock" aria-hidden="true">🕖</span>
          <span><strong>Chegada:</strong> ${arrivalHero} (1 hora antes)</span>
        </div>
        <div class="arrival-sm-row">
          <span aria-hidden="true">⛪</span>
          <span>Responsabilidade: organizar o altar e preparar os materiais litúrgicos.</span>
        </div>
      </div>` : ''}
    </div>
  `;
}

// ── Stats ──────────────────────────────────────────────────────
function renderStats() {
  const participants = App.getParticipants() ?? [];
  const noticias = App.getNoticias() ?? [];

  const result = ScheduleGenerator.run();
  const upcomingCount = result.schedules.filter(w => w.status !== 'past').length;
  const activeAnnouncements = noticias.filter(n => n.type === 'aviso').length;

  setStatValue('statParticipants', participants.filter(p => p.active !== false).length);
  setStatValue('statScheduledWeeks', upcomingCount);
  setStatValue('statAnnouncements', activeAnnouncements);
}

function setStatValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ═══════════════════════════════════════════════════════════════
// MODAIS DE ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════════

function openStatModal(eyebrow, title, bodyHtml) {
  document.getElementById('statModalEyebrow').textContent = eyebrow;
  document.getElementById('statModalTitle').textContent = title;
  document.getElementById('statModalBody').innerHTML = bodyHtml;
  Modal.open(document.getElementById('statModal'));
}

function closeStatModal() {
  Modal.close(document.getElementById('statModal'));
}

function bindStatCards() {
  document.getElementById('statModalClose')?.addEventListener('click', closeStatModal);
  document.getElementById('statModalCloseFooter')?.addEventListener('click', closeStatModal);
  Modal.bindDismiss(document.getElementById('statModal'), closeStatModal);

  document.querySelectorAll('.stat-card-clickable').forEach(card => {
    const open = () => {
      const type = card.dataset.stat;
      if (type === 'participants') openParticipantsModal();
      else if (type === 'masses') openMassesModal();
      else if (type === 'weeks') openWeeksModal();
      else if (type === 'avisos') openAvisosModal();
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

// ── Modal 1: Participantes Ativos ─────────────────────────────
function openParticipantsModal() {
  const participants = App.getParticipants() ?? [];
  const active = participants.filter(p => p.active !== false);
  const result = ScheduleGenerator.run();
  const now = new Date();
  const config = App.getConfig();

  const futureCounts = {};
  for (const week of result.schedules) {
    for (const mass of (week.masses ?? [])) {
      const mc = config?.masses?.find(m => m.id === mass.massId);
      const d = new Date(`${mass.date}T00:00:00`);
      d.setHours(mc?.timeHour ?? 0, mc?.timeMinute ?? 0, 0, 0);
      if (d < now) continue;
      for (const pid of (mass.participants ?? [])) {
        futureCounts[pid] = (futureCounts[pid] ?? 0) + 1;
      }
    }
  }

  const acolitos = active.filter(p => p.type === 'acolito');
  const coroinhas = active.filter(p => p.type === 'coroinha');

  const makeRow = p => `
    <div class="sm-p-row">
      <div class="avatar avatar-md ${p.type}">${App.getInitials(p.name)}</div>
      <div class="sm-p-info">
        <span class="sm-p-name">${escapeHtml(p.name)}</span>
        <span class="sm-p-type">${p.type === 'acolito' ? 'Acólito' : 'Coroinha'}</span>
      </div>
      <div class="sm-p-badges">
        <span class="sm-p-future">${futureCounts[p.id] ?? 0} escalas</span>
        <span class="badge badge-green" style="font-size:0.62rem;">Ativo</span>
      </div>
    </div>`;

  const makeGroup = (lista, rotulo) => lista.length === 0 ? '' : `
    <div class="sm-group">
      <div class="sm-group-label">${rotulo} (${lista.length})</div>
      ${lista.map(makeRow).join('')}
    </div>`;

  const body = `
    <div class="sm-search-wrap">
      <input type="search" class="search-input sm-search-input" id="smParticipantSearch"
             placeholder="🔍 Buscar participante…" autocomplete="off" />
    </div>
    <div id="smParticipantList">
      ${makeGroup(acolitos, 'Acólitos')}
      ${makeGroup(coroinhas, 'Coroinhas')}
    </div>`;

  openStatModal('👥 Participantes', `Participantes Ativos (${active.length})`, body);

  const searchEl = document.getElementById('smParticipantSearch');
  const listEl = document.getElementById('smParticipantList');
  searchEl?.addEventListener('input', () => {
    const q = normalizeText(searchEl.value.trim());
    if (!q) {
      listEl.innerHTML = makeGroup(acolitos, 'Acólitos') + makeGroup(coroinhas, 'Coroinhas');
      return;
    }
    const filtered = active.filter(p => normalizeText(p.name).includes(q));
    const fa = filtered.filter(p => p.type === 'acolito');
    const fc = filtered.filter(p => p.type === 'coroinha');
    listEl.innerHTML = filtered.length
      ? makeGroup(fa, 'Acólitos') + makeGroup(fc, 'Coroinhas')
      : '<p style="padding:var(--space-lg);color:var(--text-muted);text-align:center;">Nenhum resultado.</p>';
  });
  searchEl?.focus();
}

// ── Modal 2: Missas por Semana ────────────────────────────────
function openMassesModal() {
  const config = App.getConfig();
  const especiais = App.getMissasEspeciais() ?? [];
  const now = new Date();

  const regularRows = (config?.masses ?? []).map(m => `
    <div class="sm-mass-row">
      <span class="mass-time-badge ${m.id}">${escapeHtml(m.shortLabel)}</span>
      <div class="sm-mass-info">
        <span class="sm-mass-label">${escapeHtml(m.label)}</span>
        <span class="sm-mass-sub">Chegada: ${getArrivalTime(m.time)}</span>
      </div>
    </div>`).join('');

  const upcomingSpeciais = especiais.filter(m => {
    if (m.active === false) return false;
    return new Date(`${m.date}T${m.time}:00`) > now;
  });

  const specialRows = upcomingSpeciais.length > 0 ? `
    <div class="sm-section-divider">Celebrações Especiais Próximas</div>
    ${upcomingSpeciais.map(m => `
      <div class="sm-mass-row sm-mass-special">
        <span class="smc-badge-special" style="font-size:0.7rem;">${m.icon ?? '✨'} Especial</span>
        <div class="sm-mass-info">
          <span class="sm-mass-label">${escapeHtml(m.name)}</span>
          <span class="sm-mass-sub">${formatDateBR(m.date)} · ${escapeHtml(m.time)} · Chegada: ${getArrivalTime(m.time)}</span>
        </div>
      </div>`).join('')}` : '';

  openStatModal('⛪ Missas', 'Missas por Semana', `
    <div class="sm-section-divider">Missas Regulares</div>
    <div class="sm-mass-list">${regularRows}</div>
    ${specialRows}`);
}

// ── Modal 3: Semanas Escaladas ────────────────────────────────
function openWeeksModal() {
  const result = ScheduleGenerator.run();
  const schedules = result.schedules;

  const rows = schedules.map(w => {
    const s = STATUS_LABELS[w.status] ?? STATUS_LABELS.upcoming;
    const totalPart = (w.masses ?? []).reduce((acc, m) => acc + (m.participants?.length ?? 0), 0);
    return `
      <a class="sm-week-row" href="escalas.html" title="Abrir página de escalas">
        <div class="sm-week-left">
          <span class="badge ${s.cls}" style="font-size:0.65rem;">${s.label}</span>
          <div class="sm-week-info">
            <span class="sm-week-range">${formatWeekRange(w.weekStart, w.weekEnd)}</span>
            <span class="sm-week-meta">${w.weekId} · ${totalPart} escalado(s)</span>
          </div>
        </div>
        <span class="sm-week-arrow" aria-hidden="true">→</span>
      </a>`;
  }).join('');

  openStatModal('📋 Escalas', `Semanas Disponíveis (${schedules.length})`, `
    <div class="sm-week-list">${rows || '<p style="padding:var(--space-lg);color:var(--text-muted);">Nenhuma semana gerada.</p>'}</div>`);
}

// ── Modal 4: Avisos Ativos ────────────────────────────────────
function openAvisosModal() {
  const noticias = App.getNoticias() ?? [];
  const avisos = noticias
    .filter(n => n.type === 'aviso')
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));

  const rows = avisos.map(n => {
    const urgBadge = n.priority === 'high'
      ? '<span class="badge badge-red" style="font-size:0.62rem;">Urgente</span>' : '';
    const customBadge = n.badge
      ? `<span class="badge badge-purple" style="font-size:0.62rem;">${escapeHtml(n.badge)}</span>` : '';
    return `
      <div class="sm-aviso-row" data-notice-id="${n.id}" role="button" tabindex="0"
           title="Clique para ver o aviso completo">
        <div class="sm-aviso-left">
          <div class="sm-aviso-badges">${urgBadge}${customBadge}</div>
          <span class="sm-aviso-title">${escapeHtml(n.title)}</span>
          <span class="sm-aviso-date">📅 ${formatNewsDate(n.date)}</span>
        </div>
        <span class="sm-aviso-arrow" aria-hidden="true">›</span>
      </div>`;
  }).join('');

  openStatModal('🔔 Avisos', `Avisos Ativos (${avisos.length})`, `
    <div class="sm-aviso-list">${rows || '<p style="padding:var(--space-lg);color:var(--text-muted);">Nenhum aviso ativo.</p>'}</div>`);

  const openFromRow = row => {
    closeStatModal();
    setTimeout(() => openAnnouncementModal(Number(row.dataset.noticeId)), 150);
  };
  document.getElementById('statModalBody')?.querySelectorAll('[data-notice-id]').forEach(row => {
    row.addEventListener('click', () => openFromRow(row));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFromRow(row); } });
  });
}

// ── Próximas escalas ───────────────────────────────────────────
function renderUpcomingSchedules() {
  const container = document.getElementById('upcomingSchedules');
  if (!container) return;

  const result = ScheduleGenerator.run();
  const config = App.getConfig();

  const upcoming = result.schedules
    .filter(w => w.status !== 'past')
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(0, 3);

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <h3>Sem escalas próximas</h3>
        <p>As escalas serão geradas automaticamente quando os participantes forem cadastrados.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = upcoming.map(week => renderHomeWeekCard(week, config)).join('');
}

function renderHomeWeekCard(week, config) {
  const statusInfo = STATUS_LABELS[week.status] ?? STATUS_LABELS.upcoming;

  const massRows = (week.masses ?? []).map(mass => {
    const mc = config?.masses?.find(m => m.id === mass.massId);
    const pids = mass.participants ?? [];
    const ctx = { celebracao: mc?.label ?? mass.massId, data: formatDateBR(mass.date), horario: mc?.time ?? '' };
    return `
      <div class="schedule-mass-row">
        <span class="mass-time-badge ${mass.massId ?? ''}">${escapeHtml(mc?.shortLabel ?? mass.massId)}</span>
        <div class="mass-participants">${renderMassParticipants(pids, ctx, true)}</div>
      </div>`;
  }).join('');

  return `
    <div class="schedule-card ${week.status === 'current' ? 'is-current' : ''}">
      <div class="schedule-card-header">
        <div>
          <div class="schedule-week-label">${formatWeekRange(week.weekStart, week.weekEnd)}</div>
          <div class="schedule-dates">${week.weekId}</div>
        </div>
        <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
      </div>
      <div class="schedule-card-body">${massRows}</div>
      <div class="schedule-card-footer">
        <span style="font-size:0.72rem;color:var(--text-muted);">&nbsp;</span>
        <a href="escalas.html" style="font-size:0.72rem;color:var(--accent-purple-light);">Ver completo →</a>
      </div>
    </div>
  `;
}

// ── Escala da semana atual (seção abaixo do contador) ─────────
function renderHomeScheduleSection() {
  const container = document.getElementById('homeScheduleSection');
  if (!container) return;

  const result = ScheduleGenerator.run();
  const config = App.getConfig();

  let week = result.schedules.find(w => w.status === 'current');
  if (!week) week = result.schedules.find(w => w.status === 'upcoming');

  if (!week) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <h3>Sem escala disponível</h3>
        <p>Aguardando geração automática das escalas.</p>
      </div>
    `;
    return;
  }

  const statusInfo = STATUS_LABELS[week.status] ?? STATUS_LABELS.upcoming;

  const now = new Date();
  let nextMassId = null;
  for (const mass of (week.masses ?? [])) {
    const mc = config?.masses?.find(m => m.id === mass.massId);
    if (!mc) continue;
    const d = new Date(mass.date + 'T00:00:00');
    d.setHours(mc.timeHour ?? 0, mc.timeMinute ?? 0, 0, 0);
    if (d > now) { nextMassId = mass.massId; break; }
  }

  const massCards = (week.masses ?? []).map(mass =>
    renderMassMiniCard(mass, config, mass.massId === nextMassId)
  ).join('');

  container.innerHTML = `
    <div class="home-week-header">
      <div class="home-week-meta">
        <span class="home-week-range">${formatWeekRange(week.weekStart, week.weekEnd)}</span>
        <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
      </div>
    </div>
    <div class="masses-week-grid">
      ${massCards}
    </div>
  `;
}

function renderMassMiniCard(mass, config, isNext = false) {
  const mc = config?.masses?.find(m => m.id === mass.massId);
  const pids = mass.participants ?? [];
  const miniCtx = { celebracao: mc?.label ?? mass.massId, data: formatDateBR(mass.date), horario: mc?.time ?? '' };
  const participantsHtml = renderMassParticipants(pids, miniCtx, false);
  const massTime = mc?.time ?? '';

  return `
    <div class="mass-card ${isNext ? 'is-next' : ''}">
      <div class="mass-card-top ${mass.massId ?? ''}"></div>
      <div class="mass-card-header">
        <div>
          <span class="mass-time-badge ${mass.massId ?? ''}">${escapeHtml(mc?.shortLabel ?? mass.massId)}</span>
          <div class="mass-card-date">${formatDateFull(mass.date)}</div>
        </div>
        ${isNext ? '<span class="mass-card-next-badge">Em breve</span>' : ''}
      </div>
      <div class="mass-card-body">
        ${participantsHtml}
      </div>
      ${arrivalInfoHtml(massTime)}
    </div>
  `;
}

// ── Avisos fixados ─────────────────────────────────────────────
function renderPinnedAnnouncements() {
  const container = document.getElementById('pinnedAnnouncements');
  if (!container) return;

  const noticias = App.getNoticias() ?? [];
  const pinned = noticias
    .filter(n => n.pinned && n.type === 'aviso')
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));

  if (pinned.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔔</div>
        <h3>Nenhum aviso fixado</h3>
        <p>Adicione avisos no arquivo <code>data/noticias.json</code>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = pinned.map(n => renderAnnouncementItem(n)).join('');

  // Delegação única: cobre clique e teclado (Enter/Espaço) para qualquer
  // card renderizado, sem precisar de onclick/onkeydown inline por item.
  container.addEventListener('click', e => {
    const card = e.target.closest('[data-notice-id]');
    if (card) openAnnouncementModal(Number(card.dataset.noticeId));
  });
  container.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-notice-id]');
    if (card) { e.preventDefault(); openAnnouncementModal(Number(card.dataset.noticeId)); }
  });
}

function renderAnnouncementItem(item) {
  const priorityClass = item.priority === 'high' ? 'high' : 'normal';

  return `
    <div class="announcement-item ${priorityClass}"
         data-notice-id="${item.id}"
         role="button" tabindex="0"
         title="Clique para ler o aviso completo">
      <div class="announcement-icon">${NEWS_TYPE_ICONS[item.type] ?? '📌'}</div>
      <div class="announcement-content">
        <div class="announcement-header">
          <span class="announcement-title">${escapeHtml(item.title)}</span>
          ${item.priority === 'high' ? '<span class="badge badge-warning">Urgente</span>' : ''}
        </div>
        <p class="announcement-text">${escapeHtml(App.truncate(item.content, 160))}</p>
        <div class="announcement-meta">
          <span>📅 ${formatNewsDate(item.date)}</span>
          ${item.author ? `<span>• ${escapeHtml(item.author)}</span>` : ''}
          <span style="color:var(--accent-purple-light);margin-left:auto;">Ler mais →</span>
        </div>
      </div>
    </div>
  `;
}

// ── Modal de aviso ─────────────────────────────────────────────
function openAnnouncementModal(id) {
  const noticias = App.getNoticias() ?? [];
  const item = noticias.find(n => n.id === id);
  if (!item) return;

  const overlay = document.getElementById('announcementModal');
  if (!overlay) return;

  document.getElementById('modalEyebrow').textContent = item.badge ?? NEWS_TYPE_EYEBROWS[item.type] ?? 'Aviso';
  document.getElementById('modalTitle').textContent = item.title;
  document.getElementById('modalDate').textContent = `📅 ${formatNewsDate(item.date)}`;
  document.getElementById('modalAuthor').textContent = item.author ? `• ${item.author}` : '';

  const imageHtml = item.imageUrl
    ? `<div class="modal-cover-wrap">
         <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="modal-cover-img" loading="lazy"
              onerror="this.closest('.modal-cover-wrap').remove()" />
       </div>`
    : '';

  const bodyEl = document.getElementById('modalBody');
  const rawContent = item.contentFull ?? item.content ?? '';
  const textHtml = rawContent.split('\n\n').filter(Boolean).map(block => {
    if (block.includes('\n•') || block.startsWith('•')) {
      const lines = block.split('\n').filter(Boolean);
      const items = lines.map(l => `<li>${escapeHtml(l.replace(/^•\s*/, ''))}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    if (block.startsWith('📍')) return `<p class="modal-address">${escapeHtml(block)}</p>`;
    return `<p>${escapeHtml(block)}</p>`;
  }).join('');

  bodyEl.innerHTML = imageHtml + textHtml;

  Modal.open(overlay);
  document.getElementById('modalCloseBtn')?.focus();
}

function closeAnnouncementModal() {
  Modal.close(document.getElementById('announcementModal'));
}

function bindAnnouncementModal() {
  const overlay = document.getElementById('announcementModal');
  document.getElementById('modalCloseBtn')?.addEventListener('click', closeAnnouncementModal);
  document.getElementById('modalCloseBtnFooter')?.addEventListener('click', closeAnnouncementModal);
  Modal.bindDismiss(overlay, closeAnnouncementModal);
}

// ── Últimas notícias ───────────────────────────────────────────
function renderLatestNews() {
  const container = document.getElementById('latestNews');
  if (!container) return;

  const noticias = (App.getNoticias() ?? [])
    .filter(n => n.type !== 'aviso' || !n.pinned)
    .sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return (b.date ?? '').localeCompare(a.date ?? '');
    })
    .slice(0, 4);

  if (noticias.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📰</div>
        <h3>Nenhuma notícia ainda</h3>
        <p>Adicione notícias no arquivo <code>data/noticias.json</code>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div class="news-grid">${noticias.map(n => renderNewsCard(n)).join('')}</div>`;

  container.querySelectorAll('[data-notice-id]').forEach(card => {
    card.addEventListener('click', () => openAnnouncementModal(Number(card.dataset.noticeId)));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAnnouncementModal(Number(card.dataset.noticeId));
      }
    });
  });
}

function renderNewsCard(item) {
  const accentCls = NEWS_TYPE_ACCENTS[item.type] ?? '';
  const badge = NEWS_TYPE_BADGES[item.type] ?? NEWS_TYPE_BADGES.noticia;
  const hasModal = !!(item.contentFull || item.content);
  const hasCover = !!item.imageUrl;

  const coverHtml = hasCover
    ? `<div class="news-card-cover">
         <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="news-card-cover-img" loading="lazy"
              onerror="this.closest('.news-card-cover').remove()" />
         <div class="news-card-cover-gradient"></div>
       </div>`
    : '';

  return `
    <div class="news-card ${item.featured ? 'is-featured' : ''} ${hasCover ? 'has-cover' : ''}"
         ${hasModal ? `data-notice-id="${item.id}" role="button" tabindex="0" title="Clique para ler o conteúdo completo"` : ''}>
      ${coverHtml}
      <div class="news-card-accent ${accentCls}"></div>
      <div class="news-card-body">
        <div class="news-card-meta">
          <span class="badge ${badge.cls}">${badge.label}</span>
          ${item.badge ? `<span class="badge badge-purple">${escapeHtml(item.badge)}</span>` : ''}
          ${!item.badge && item.priority === 'high' ? '<span class="badge badge-red">Urgente</span>' : ''}
        </div>
        <h4 class="news-card-title">${escapeHtml(item.title)}</h4>
        <p class="news-card-content">${escapeHtml(App.truncate(item.content ?? '', hasCover ? 100 : 180))}</p>
      </div>
      <div class="news-card-footer">
        <span>📅 ${formatNewsDate(item.date)}</span>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="color:var(--text-muted);">${escapeHtml(item.author ?? '')}</span>
          ${hasModal ? '<span style="color:var(--accent-purple-light);font-size:0.75rem;">Ler mais →</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

export const Home = { init };
