/**
 * mass-render.js — COMPONENTE ÚNICO de renderização de participantes/missas.
 *
 * Fonte de verdade para exibir participantes escalados em TODAS as telas:
 * home, escalas, calendário, modais e cards de missa especial. Antes vivia
 * dentro de escalas.js junto com lógica de páginas inteiras; agora é um
 * módulo próprio, sem estado, importável de onde precisar.
 */
import { App } from '../app.js';
import { AbsenceModal } from './absence-modal.js';
import { escapeHtml } from './dom-utils.js';
import { parseLocalDate, formatDateBR, getArrivalTime } from './date-utils.js';
import { WA_ICON_SVG } from './constants.js';

/** Chip simples de participante (nome curto + tipo). */
export function buildParticipantItem(name, tipo, sm = false) {
  const smCls = sm ? ' sm' : '';
  return `<span class="participant-chip ${tipo}${smCls}" title="${escapeHtml(name)}">${escapeHtml(App.getShortName(name))}</span>`;
}

/**
 * Botão único de "Comunicar ausência" por celebração. Registra o contexto
 * no AbsenceModal e devolve um botão com `data-absence-idx` — a abertura do
 * modal é feita por delegação de evento (ver absence-modal.js), não por
 * onclick inline (que não funcionaria com ES modules).
 */
export function buildAbsenceActionBtn(massCtx, pids) {
  if (!pids || pids.length === 0) return '';
  const idx = AbsenceModal.register(massCtx, [...pids]);
  return `<button type="button" class="absence-action-btn" data-absence-idx="${idx}"
    title="Não poderá servir nesta celebração?"
    aria-label="Comunicar ausência para ${escapeHtml(massCtx.celebracao)}"
  >${WA_ICON_SVG}<span>Comunicar ausência</span></button>`;
}

/**
 * Renderiza o bloco de participantes de uma missa (chips agrupados por
 * tipo + botão de ausência).
 * @param {number[]} pids
 * @param {{celebracao:string,data:string,horario:string}|null} ctx
 * @param {boolean} sm - chips compactos (cards pequenos)
 */
export function renderMassParticipants(pids, ctx, sm = false) {
  if (!pids || pids.length === 0) {
    return '<span class="participants-empty">A definir</span>';
  }

  const parts = pids.map(id => App.getParticipantById(id)).filter(Boolean);
  if (parts.length === 0) {
    return '<span class="participants-empty">A definir</span>';
  }

  const acolitos = parts.filter(p => p.type === 'acolito');
  const coroinhas = parts.filter(p => p.type === 'coroinha');
  const smCls = sm ? ' sm' : '';

  const makeGroup = (lista, tipo) => {
    if (!lista.length) return '';
    const label = tipo === 'acolito' ? 'Acólitos' : 'Coroinhas';
    const chips = lista.map(p =>
      `<span class="participant-chip ${tipo}${smCls}" title="${escapeHtml(p.name)}">${escapeHtml(App.getShortName(p.name))}</span>`
    ).join('');
    return `<div class="mass-part-group">
      <span class="mass-part-label">${label}</span>
      <div class="mass-part-chips">${chips}</div>
    </div>`;
  };

  const absBtn = ctx ? buildAbsenceActionBtn(ctx, pids) : '';

  return `<div class="mass-participants-block">
    ${makeGroup(acolitos, 'acolito')}
    ${makeGroup(coroinhas, 'coroinha')}
    ${absBtn}
  </div>`;
}

/**
 * Constrói o HTML do card de uma missa especial (Corpus Christi, etc.).
 * Retorna string vazia se a missa já ocorreu há mais de 1 dia.
 * @param {object} missa
 * @param {{compact?: boolean}} [opts]
 */
export function buildMissaEspecialCard(missa, opts = {}) {
  const { compact = false } = opts;

  const now = new Date();
  const massDate = parseLocalDate(missa.date, missa.time);
  const daysPast = (now - massDate) / 86400000;
  if (daysPast > 1) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDay = parseLocalDate(missa.date, '00:00');
  const diffDays = Math.round((targetDay - today) / 86400000);

  let daysLabel;
  if (daysPast >= 0) daysLabel = `<span class="badge badge-blue">Realizada</span>`;
  else if (diffDays === 0) daysLabel = `<span class="badge badge-gold">Hoje!</span>`;
  else if (diffDays === 1) daysLabel = `<span class="badge badge-gold">Amanhã</span>`;
  else daysLabel = `<span class="badge badge-purple">Em ${diffDays} dias</span>`;

  const smCtx = {
    celebracao: missa.name,
    data: formatDateBR(missa.date),
    horario: missa.time,
  };

  const definedRoles = (missa.roles?.defined ?? []).map(r => `
    <div class="role-item defined">
      <span class="role-name">${escapeHtml(r.role)}</span>
      <div class="role-person">
        ${buildParticipantItem(r.participantName, r.type, true)}
      </div>
    </div>`).join('');

  const tbdRoles = compact ? '' : (missa.roles?.tbd ?? []).map(r => `
    <div class="role-item tbd">
      <span class="role-name">${escapeHtml(r)}</span>
      <span class="participants-empty" style="font-size:0.75rem;">A definir</span>
    </div>`).join('');

  const specialPids = (missa.roles?.defined ?? []).map(r => r.participantId);
  const rolesSection = (definedRoles || tbdRoles) ? `
    <div class="smc-roles">
      <span class="smc-section-label">Funções</span>
      <div class="smc-roles-grid">
        ${definedRoles}
        ${tbdRoles}
      </div>
      ${buildAbsenceActionBtn(smCtx, specialPids)}
    </div>` : '';

  const mandatoryAlert = missa.mandatoryAttendance ? `
    <div class="smc-mandatory">
      <span class="smc-mandatory-icon" aria-hidden="true">⚠️</span>
      <div>
        <strong>Presença Obrigatória</strong>
        <p>${escapeHtml(missa.mandatoryMessage)}</p>
      </div>
    </div>` : '';

  const procissaoNote = missa.procissao
    ? `<p class="arrival-extra">🚶 Após a Santa Missa haverá a Procissão de Corpus Christi. Todos deverão permanecer presentes até o encerramento das atividades.</p>`
    : '';

  return `
    <div class="special-mass-card theme-${escapeHtml(missa.theme ?? 'gold')}" role="region"
         aria-label="Celebração especial: ${escapeHtml(missa.name)}">
      <div class="smc-top-bar"></div>
      <div class="smc-header">
        <div class="smc-header-main">
          <div class="smc-badges">
            <span class="smc-badge-special">${missa.icon ?? '✨'} Celebração Especial</span>
            ${daysLabel}
          </div>
          <h3 class="smc-name">${escapeHtml(missa.name)}</h3>
          <p class="smc-subtitle">${escapeHtml(missa.subtitle)}</p>
        </div>
        <div class="smc-meta">
          <div class="smc-meta-day">${escapeHtml(missa.dayName)}</div>
          <div class="smc-meta-date">${formatDateBR(missa.date)}</div>
          <div class="smc-meta-time">${escapeHtml(missa.time)}</div>
        </div>
      </div>
      <div class="smc-body">
        ${rolesSection}
        ${arrivalInfoHtml(missa.time, procissaoNote)}
        ${mandatoryAlert}
      </div>
    </div>
  `;
}

/**
 * Bloco HTML de "Horário de Chegada" (1 hora antes da missa).
 * @param {string} massTime - "HH:MM"
 * @param {string} [extra] - HTML extra opcional (ex.: aviso de procissão)
 */
export function arrivalInfoHtml(massTime, extra = '') {
  const arrival = getArrivalTime(massTime);
  if (!arrival) return '';
  return `
    <div class="arrival-info">
      <div class="arrival-time">
        <span class="arrival-clock" aria-hidden="true">🕖</span>
        <span><strong>Horário de Chegada:</strong> ${arrival} <span class="arrival-time-detail">(1 hora antes)</span></span>
      </div>
      <p class="arrival-note">Período destinado à preparação da missa, organização do altar, conferência dos objetos litúrgicos e alinhamento das funções.</p>
      <div class="arrival-resp">
        <span aria-hidden="true">⛪</span>
        <span><strong>Responsabilidade dos escalados:</strong> organizar o altar e preparar os materiais litúrgicos antes da celebração.</span>
      </div>
      ${extra}
    </div>
  `;
}

/** Missas especiais ativas e ainda relevantes (até 1 dia após a celebração). */
export function getUpcomingMissasEspeciais() {
  return (App.getMissasEspeciais() ?? []).filter(m => {
    if (m.active === false) return false;
    const d = parseLocalDate(m.date, m.time);
    const daysPast = (new Date() - d) / 86400000;
    return daysPast <= 1;
  });
}
