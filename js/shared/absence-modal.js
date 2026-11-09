/**
 * absence-modal.js — modal de "Comunicar ausência" via WhatsApp.
 *
 * Componente genérico usado por todas as páginas que exibem participantes
 * escalados (home, escalas, calendário). O botão que abre o modal é gerado
 * em massa por `mass-render.js`; aqui só vive o estado e o modal em si.
 */
import { App } from '../app.js';
import { Modal, escapeHtml } from './dom-utils.js';
import { WA_ICON_SVG } from './constants.js';

const _store = []; // { massCtx, pids }[]

function register(massCtx, pids) {
  _store.push({ massCtx, pids: [...pids] });
  return _store.length - 1;
}

function open(idx) {
  const stored = _store[idx];
  if (!stored) return;
  _build(stored.massCtx, stored.pids);
  Modal.open(document.getElementById('absenceModal'));
}

function close() {
  Modal.close(document.getElementById('absenceModal'));
}

function _build(massCtx, pids) {
  const massInfoEl = document.getElementById('absenceModalMassInfo');
  const listEl = document.getElementById('absenceParticipantList');
  const btnEl = document.getElementById('absenceWhatsappBtn');
  if (!massInfoEl || !listEl || !btnEl) return;

  massInfoEl.innerHTML = `
    <div class="absence-mass-info">
      <span class="absence-mass-label">${escapeHtml(massCtx.celebracao)}</span>
      <span class="absence-mass-meta">📅 ${escapeHtml(massCtx.data)} &nbsp;·&nbsp; 🕐 ${escapeHtml(massCtx.horario)}</span>
    </div>`;

  const parts = pids.map(id => App.getParticipantById(id)).filter(Boolean);
  const acolitos = parts.filter(p => p.type === 'acolito');
  const coroinhas = parts.filter(p => p.type === 'coroinha');

  if (parts.length === 0) {
    listEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;margin-top:var(--space-md);">Nenhum participante definido para esta celebração.</p>';
    _setBtnState(btnEl, false, '#');
    return;
  }

  const opts = (lista, label) => {
    if (!lista.length) return '';
    const options = lista.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    return `<optgroup label="${label}">${options}</optgroup>`;
  };

  listEl.innerHTML = `
    <label class="absence-select-label" for="absenceSelect">Participante</label>
    <div class="absence-select-wrap">
      <select id="absenceSelect" class="absence-select" aria-label="Selecione o participante">
        <option value="" disabled selected>Selecione o participante ▾</option>
        ${opts(acolitos, 'Acólitos')}
        ${opts(coroinhas, 'Coroinhas')}
      </select>
      <span class="absence-select-arrow" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </span>
    </div>`;

  _setBtnState(btnEl, false, '#');

  document.getElementById('absenceSelect')?.addEventListener('change', e => {
    const p = App.getParticipantById(Number(e.target.value));
    if (!p) return;
    const url = App.buildAbsenceWhatsappUrl(p.name, massCtx.celebracao, massCtx.data, massCtx.horario);
    _setBtnState(btnEl, true, url);
  });
}

function _setBtnState(btn, enabled, href) {
  btn.href = href;
  btn.style.opacity = enabled ? '' : '0.4';
  btn.style.pointerEvents = enabled ? '' : 'none';
  btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function init() {
  if (!document.getElementById('absenceModal')) {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal-overlay" id="absenceModal" role="dialog" aria-modal="true"
           aria-labelledby="absenceModalTitle">
        <div class="modal-box" style="max-width:460px;">
          <div class="modal-header">
            <div class="modal-header-content">
              <div class="modal-eyebrow">
                <span class="modal-eyebrow-dot"></span><span>Comunicação</span>
              </div>
              <h2 class="modal-title" id="absenceModalTitle">Comunicar ausência</h2>
            </div>
            <button class="modal-close-btn" id="absenceModalClose" aria-label="Fechar">✕</button>
          </div>
          <div class="modal-body">
            <p class="absence-modal-desc">Selecione quem não poderá comparecer nesta celebração.</p>
            <div id="absenceModalMassInfo"></div>
            <div id="absenceParticipantList" style="margin-top:var(--space-lg);"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-sm" id="absenceModalCancel">Cancelar</button>
            <a class="btn btn-primary" id="absenceWhatsappBtn" href="#" target="_blank"
               rel="noopener noreferrer" style="opacity:0.4;pointer-events:none;" aria-disabled="true">
              ${WA_ICON_SVG}&nbsp; Abrir WhatsApp
            </a>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
  }

  const overlay = document.getElementById('absenceModal');
  document.getElementById('absenceModalClose')?.addEventListener('click', close);
  document.getElementById('absenceModalCancel')?.addEventListener('click', close);
  Modal.bindDismiss(overlay, close);

  // Delegação única: os botões "Comunicar ausência" são gerados em massa
  // via mass-render.js com `data-absence-idx`, sem onclick inline (não
  // funcionaria com ES modules, já que o handler não seria mais global).
  if (document.body.dataset.absenceDelegationBound !== 'true') {
    document.body.dataset.absenceDelegationBound = 'true';
    document.addEventListener('click', e => {
      const btn = e.target.closest('.absence-action-btn');
      if (!btn) return;
      e.stopPropagation();
      open(Number(btn.dataset.absenceIdx));
    });
  }
}

export const AbsenceModal = { register, open, close, init };
