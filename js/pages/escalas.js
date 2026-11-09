/**
 * pages/escalas.js — Lógica da página de escalas (escalas.html)
 *
 * Responsável por:
 *  - Renderizar as escalas semanais (detalhe, cards e tabela)
 *  - Navegação entre semanas (anterior/próxima) e filtro por status
 *  - Alternância entre visão em cards e em tabela
 *  - Compartilhar (WhatsApp) e imprimir a semana focada
 *
 * Antes esse módulo vivia junto com `Home` (página inicial) dentro de um
 * único arquivo escalas.js de 1500+ linhas — inclusive `shareWeek`/
 * `printWeek` estavam definidos dentro do closure de `Home` embora só
 * fossem chamados a partir daqui, o que gerava um ReferenceError ao
 * clicar em "Compartilhar"/"Imprimir" (os dois closures são escopos
 * léxicos separados). Ambos moraram para cá, junto de quem os usa.
 */
import { App } from '../app.js';
import { ScheduleGenerator } from '../schedule-generator.js';
import { STATUS_LABELS } from '../shared/constants.js';
import { formatWeekRange, formatDateBR, formatDateFull, getArrivalTime } from '../shared/date-utils.js';
import { renderMassParticipants, getUpcomingMissasEspeciais, buildMissaEspecialCard } from '../shared/mass-render.js';
import { escapeHtml } from '../shared/dom-utils.js';

// ── Estado interno ────────────────────────────────────────────
let _schedules = [];
let _currentIdx = 0;
let _filter = 'all'; // 'all' | 'upcoming' | 'past'
let _view = 'cards'; // 'cards' | 'table'

// ── Inicialização ─────────────────────────────────────────────
async function init() {
  renderSpecialMassesEscalas();

  const result = ScheduleGenerator.run();
  _schedules = result.schedules;

  if (result.generated > 0) {
    App.showToast(`${result.generated} semana(s) gerada(s) automaticamente.`, 'success');
  }

  _currentIdx = _schedules.findIndex(w => w.status === 'current');
  if (_currentIdx === -1) _currentIdx = _schedules.findIndex(w => w.status === 'upcoming');
  if (_currentIdx === -1) _currentIdx = _schedules.length - 1;

  render();
  bindEvents();
}

// ── Missas Especiais (página de escalas) ──────────────────────
function renderSpecialMassesEscalas() {
  const container = document.getElementById('specialMassEscalas');
  if (!container) return;

  const missas = getUpcomingMissasEspeciais();
  if (missas.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML =
    missas.map(m => buildMissaEspecialCard(m, { compact: false })).join('') +
    `<div class="special-mass-divider">
      <div class="special-mass-divider-line"></div>
      <span class="special-mass-divider-label">Escalas Semanais</span>
      <div class="special-mass-divider-line"></div>
    </div>`;
}

// ── Renderização principal ────────────────────────────────────
function render() {
  renderWeekDetail();
  renderWeekList();
  updateNavigationButtons();
}

// ── Detalhe da semana focada ──────────────────────────────────
function renderWeekDetail() {
  const container = document.getElementById('scheduleDetail');
  if (!container) return;

  if (_schedules.length === 0) {
    container.innerHTML = emptyState(
      '📅',
      'Nenhuma escala cadastrada',
      'As escalas serão geradas automaticamente assim que os participantes forem cadastrados.'
    );
    return;
  }

  const week = _schedules[_currentIdx];
  if (!week) return;

  const config = App.getConfig();
  const statusInfo = STATUS_LABELS[week.status] ?? STATUS_LABELS.upcoming;

  container.innerHTML = `
    <div class="schedule-detail-card">
      <div class="schedule-detail-header">
        <div>
          <h3 class="schedule-detail-title">${week.weekId}</h3>
          <p style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">
            ${formatWeekRange(week.weekStart, week.weekEnd)}
          </p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
          ${week.status === 'past' ? '<span class="badge badge-blue">Histórico</span>' : ''}
          <button class="btn btn-ghost btn-sm" id="btnShareWeek" title="Compartilhar escala via WhatsApp" aria-label="Compartilhar escala">
            📤 Compartilhar
          </button>
          <button class="btn btn-ghost btn-sm" id="btnPrintWeek" title="Imprimir ou exportar como PDF" aria-label="Imprimir escala">
            🖨️ Imprimir
          </button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="mass-table">
          <thead>
            <tr>
              <th>Missa</th>
              <th>Data</th>
              <th>Participantes</th>
              <th>🕖 Chegada</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            ${week.masses.map(mass => renderMassRow(mass, config)).join('')}
          </tbody>
        </table>
      </div>
      <div class="arrival-notice">
        <span aria-hidden="true">⚠️</span>
        <div>
          <strong>Importante para os Acólitos e Coroinhas:</strong>
          Todos os escalados deverão chegar <strong>1 hora antes</strong> da celebração.
          A organização do altar e dos materiais litúrgicos é responsabilidade dos acólitos e coroinhas escalados.
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnShareWeek')?.addEventListener('click', () => shareWeek(week, config));
  document.getElementById('btnPrintWeek')?.addEventListener('click', () => printWeek(week, config));
}

/** Renderiza uma linha da tabela de missas. */
function renderMassRow(mass, config) {
  const massConfig = config?.masses?.find(m => m.id === mass.massId);
  const label = massConfig?.label ?? mass.massId;
  const dateLabel = formatDateFull(mass.date);
  const mCtx = { celebracao: label, data: formatDateBR(mass.date), horario: massConfig?.time ?? '' };
  const participants = renderMassParticipants(mass.participants ?? [], mCtx, false);
  const badgeCls = `mass-time-badge ${mass.massId ?? ''}`;
  const arrival = massConfig?.time ? getArrivalTime(massConfig.time) : null;

  return `
    <tr>
      <td data-label="Missa">
        <span class="${badgeCls}">${escapeHtml(massConfig?.shortLabel ?? label)}</span>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">${escapeHtml(label)}</div>
      </td>
      <td data-label="Data" style="font-size:0.82rem;color:var(--text-secondary);">
        ${dateLabel}
      </td>
      <td data-label="Participantes">${participants}</td>
      <td data-label="Chegada" style="font-size:0.82rem;white-space:nowrap;">
        ${arrival ? `<span class="arrival-table-badge">🕖 ${arrival}</span>` : '—'}
      </td>
      <td data-label="Obs." style="font-size:0.78rem;color:var(--text-muted);">
        ${escapeHtml(mass.observations) || '—'}
      </td>
    </tr>
  `;
}

// ── Lista de semanas ──────────────────────────────────────────
function renderWeekList() {
  const container = document.getElementById('weekList');
  if (!container) return;

  const filtered = _schedules.filter(w => {
    if (_filter === 'upcoming') return w.status !== 'past';
    if (_filter === 'past') return w.status === 'past';
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = emptyState('🔍', 'Nenhuma escala encontrada', 'Tente mudar o filtro.');
    return;
  }

  const config = App.getConfig();

  container.innerHTML = _view === 'cards'
    ? `<div class="schedules-grid">${filtered.map(w => renderWeekCard(w, config)).join('')}</div>`
    : `<div class="schedules-list">${filtered.map(w => renderWeekRow(w, config)).join('')}</div>`;

  container.querySelectorAll('[data-week-id]').forEach(el => {
    el.addEventListener('click', e => {
      // Não navega se o clique veio do botão "Comunicar ausência" aninhado
      // dentro do card (ele tem sua própria ação, tratada por delegação
      // em absence-modal.js).
      if (e.target.closest('.absence-action-btn')) return;

      const idx = _schedules.findIndex(w => w.weekId === el.dataset.weekId);
      if (idx !== -1) {
        _currentIdx = idx;
        renderWeekDetail();
        updateNavigationButtons();
        el.closest('.schedules-grid, .schedules-list')
          ?.querySelectorAll('.schedule-card, .schedule-row')
          .forEach(c => c.classList.remove('is-current'));
        el.classList.add('is-current');
        document.getElementById('scheduleDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/** Card de semana (visão em grade). */
function renderWeekCard(week, config) {
  const statusInfo = STATUS_LABELS[week.status] ?? STATUS_LABELS.upcoming;
  const isActive = _schedules[_currentIdx]?.weekId === week.weekId;

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
    <div class="schedule-card ${isActive ? 'is-current' : ''}"
         data-week-id="${week.weekId}"
         role="button" tabindex="0"
         title="Ver detalhe da semana ${week.weekId}">
      <div class="schedule-card-header">
        <div>
          <div class="schedule-week-label">${formatWeekRange(week.weekStart, week.weekEnd)}</div>
          <div class="schedule-dates">${week.weekId}</div>
        </div>
        <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
      </div>
      <div class="schedule-card-body">${massRows}</div>
      <div class="schedule-card-footer">
        <span style="font-size:0.72rem;color:var(--text-muted);">
          ${week.generatedAt ? formatDateBR(week.generatedAt.split('T')[0]) : '—'}
        </span>
        <span style="font-size:0.72rem;color:var(--accent-purple-light);cursor:pointer;">Ver detalhes →</span>
      </div>
    </div>
  `;
}

/** Linha da lista de semanas (visão em lista). */
function renderWeekRow(week, config) {
  const statusInfo = STATUS_LABELS[week.status] ?? STATUS_LABELS.upcoming;
  const totalPart = (week.masses ?? []).reduce((acc, m) => acc + (m.participants?.length ?? 0), 0);
  const isActive = _schedules[_currentIdx]?.weekId === week.weekId;

  return `
    <div class="schedule-card schedule-row ${isActive ? 'is-current' : ''}"
         data-week-id="${week.weekId}"
         role="button" tabindex="0"
         style="display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;padding:16px 20px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;border-radius:8px;background:var(--bg-elevated);
                    border:1px solid var(--border-subtle);display:flex;align-items:center;
                    justify-content:center;font-size:1.2rem;flex-shrink:0;">📅</div>
        <div>
          <div style="font-weight:700;font-size:0.95rem;">${week.weekId}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);">${formatWeekRange(week.weekStart, week.weekEnd)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end;">
        <span style="font-size:0.78rem;color:var(--text-muted);">${totalPart} escalado(s)</span>
        <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
      </div>
    </div>
  `;
}

// ── Navegação entre semanas ───────────────────────────────────
function updateNavigationButtons() {
  const btnPrev = document.getElementById('btnPrevWeek');
  const btnNext = document.getElementById('btnNextWeek');
  const lblWeek = document.getElementById('currentWeekLabel');

  if (btnPrev) btnPrev.disabled = _currentIdx <= 0;
  if (btnNext) btnNext.disabled = _currentIdx >= _schedules.length - 1;

  if (lblWeek && _schedules[_currentIdx]) {
    const w = _schedules[_currentIdx];
    lblWeek.textContent = `${w.weekId} • ${formatWeekRange(w.weekStart, w.weekEnd)}`;
  }
}

// ── Eventos ───────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btnPrevWeek')?.addEventListener('click', () => {
    if (_currentIdx > 0) { _currentIdx--; render(); }
  });

  document.getElementById('btnNextWeek')?.addEventListener('click', () => {
    if (_currentIdx < _schedules.length - 1) { _currentIdx++; render(); }
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      _filter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
      renderWeekList();
    });
  });

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      _view = btn.dataset.view;
      document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === btn));
      renderWeekList();
    });
  });
}

// ── Estado vazio ──────────────────────────────────────────────
function emptyState(icon, title, desc) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </div>
  `;
}

// ── Compartilhar escala via WhatsApp ─────────────────────────
function shareWeek(week, config) {
  const header = `📋 *Escala da Semana — ${week.weekId}*\n` +
                 `Período: ${formatWeekRange(week.weekStart, week.weekEnd)}\n\n`;

  const massLines = (week.masses ?? []).map(mass => {
    const mc = config?.masses?.find(m => m.id === mass.massId);
    const pids = mass.participants ?? [];
    const parts = pids.map(id => App.getParticipantById(id)).filter(Boolean);
    const acolitos = parts.filter(p => p.type === 'acolito').map(p => App.getShortName(p.name));
    const coroinhas = parts.filter(p => p.type === 'coroinha').map(p => App.getShortName(p.name));
    const arrival = mc?.time ? getArrivalTime(mc.time) : '';

    let line = `⛪ *${mc?.label ?? mass.massId}* — ${formatDateBR(mass.date)}\n`;
    if (acolitos.length) line += `  Acólitos: ${acolitos.join(', ')}\n`;
    if (coroinhas.length) line += `  Coroinhas: ${coroinhas.join(', ')}\n`;
    if (arrival) line += `  🕖 Chegada: ${arrival}\n`;
    if (mass.observations) line += `  📝 ${mass.observations}\n`;
    return line;
  }).join('\n');

  const footer = `\n⚠️ Todos devem chegar 1 hora antes para organizar o altar.\n`;
  const msg = header + massLines + footer;

  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ── Imprimir / exportar PDF ───────────────────────────────────
function printWeek(week, config) {
  const printArea = document.getElementById('printArea');
  if (!printArea) { window.print(); return; }

  const massRows = (week.masses ?? []).map(mass => {
    const mc = config?.masses?.find(m => m.id === mass.massId);
    const pids = mass.participants ?? [];
    const parts = pids.map(id => App.getParticipantById(id)).filter(Boolean);
    const acolitos = parts.filter(p => p.type === 'acolito');
    const coroinhas = parts.filter(p => p.type === 'coroinha');
    const arrival = mc?.time ? getArrivalTime(mc.time) : '—';

    const chips = [
      ...acolitos.map(p => `<span class="print-chip acolito">${escapeHtml(App.getShortName(p.name))}</span>`),
      ...coroinhas.map(p => `<span class="print-chip coroinha">${escapeHtml(App.getShortName(p.name))}</span>`),
    ].join('') || '<span style="color:#999;">A definir</span>';

    return `
      <tr>
        <td><span class="print-mass-badge ${mass.massId}">${escapeHtml(mc?.shortLabel ?? mass.massId)}</span><br>
            <small style="color:#666;">${escapeHtml(mc?.label ?? '')}</small></td>
        <td>${formatDateFull(mass.date)}</td>
        <td>${chips}</td>
        <td>${arrival}</td>
        <td style="color:#777;font-size:8.5pt;">${escapeHtml(mass.observations) || '—'}</td>
      </tr>`;
  }).join('');

  printArea.innerHTML = `
    <div class="print-header">
      <div>
        <h1 class="print-title">Escala — ${week.weekId}</h1>
        <p class="print-subtitle">${formatWeekRange(week.weekStart, week.weekEnd)}</p>
      </div>
      <div class="print-logo">
        <span class="print-logo-cross">✝</span>
        Acólitos &amp; Coroinhas
      </div>
    </div>

    <div class="print-section">
      <div class="print-section-title">Missas da Semana</div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Missa</th><th>Data</th><th>Participantes</th><th>Chegada</th><th>Obs.</th>
          </tr>
        </thead>
        <tbody>${massRows}</tbody>
      </table>
    </div>

    <div class="print-notice">
      ⚠️ <strong>Importante:</strong> Todos os escalados deverão chegar <strong>1 hora antes</strong>
      da celebração. A organização do altar e dos materiais litúrgicos é responsabilidade dos
      acólitos e coroinhas escalados para servir naquela missa.
    </div>

    <div class="print-footer">
      <span>Impresso em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
      <span>Portal dos Acólitos e Coroinhas</span>
    </div>
  `;

  window.print();
}

export const Escalas = { init };
