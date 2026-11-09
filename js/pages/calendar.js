/**
 * pages/calendar.js — Calendário mensal interativo (calendario.html)
 * Exibe missas regulares e especiais em um calendário; ao clicar em um
 * dia, abre modal com detalhes da(s) celebração(ões).
 */
import { App } from '../app.js';
import { ScheduleGenerator } from '../schedule-generator.js';
import { formatDateFull, formatDateBR, toLocalDateString, getArrivalTime } from '../shared/date-utils.js';
import { renderMassParticipants, buildAbsenceActionBtn } from '../shared/mass-render.js';
import { escapeHtml, Modal } from '../shared/dom-utils.js';

const now = new Date();
let _year = now.getFullYear();
let _month = now.getMonth();

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function init() {
  if (!document.getElementById('calendarGrid')) return;
  render();
  bindNavEvents();
}

// ── Coleta missas do mês ──────────────────────────────────────
function getMassMap(year, month) {
  const result = ScheduleGenerator.run();
  const config = App.getConfig();
  const especiais = App.getMissasEspeciais() ?? [];
  const map = {}; // YYYY-MM-DD → [mass]

  const push = (date, entry) => {
    if (!map[date]) map[date] = [];
    map[date].push(entry);
  };

  for (const week of result.schedules) {
    for (const mass of (week.masses ?? [])) {
      const [y, m] = mass.date.split('-').map(Number);
      if (y !== year || m - 1 !== month) continue;
      const mc = config?.masses?.find(c => c.id === mass.massId);
      push(mass.date, {
        massId: mass.massId,
        label: mc?.label ?? mass.massId,
        short: mc?.shortLabel ?? mass.massId,
        time: mc?.time ?? '',
        arrival: mc?.time ? getArrivalTime(mc.time) : '',
        participants: mass.participants ?? [],
        isSpecial: false,
      });
    }
  }

  for (const m of especiais) {
    if (m.active === false) continue;
    const [y, mo] = m.date.split('-').map(Number);
    if (y !== year || mo - 1 !== month) continue;
    push(m.date, {
      massId: 'special',
      label: m.name,
      short: m.name,
      time: m.time,
      arrival: getArrivalTime(m.time),
      participants: [],
      isSpecial: true,
      data: m,
    });
  }

  return map;
}

// ── Renderização principal ────────────────────────────────────
function render() {
  const grid = document.getElementById('calendarGrid');
  const monthLbl = document.getElementById('calMonthLabel');
  if (!grid) return;

  if (monthLbl) monthLbl.textContent = `${MONTHS[_month]} ${_year}`;

  const massMap = getMassMap(_year, _month);
  const todayStr = toLocalDateString(new Date());
  const firstDay = new Date(_year, _month, 1).getDay();
  const totalDays = new Date(_year, _month + 1, 0).getDate();

  let html = DAYS.map(d => `<div class="cal-hd">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell"></div>';

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${_year}-${String(_month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const masses = massMap[dateStr] ?? [];
    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;
    const hasMass = masses.length > 0;

    const dots = masses.map(m =>
      `<span class="cal-dot ${m.isSpecial ? 'cal-dot-special' : 'cal-dot-' + m.massId}" title="${escapeHtml(m.label)}"></span>`
    ).join('');

    html += `
      <div class="cal-cell ${isToday ? 'cal-today' : ''} ${isPast ? 'cal-past' : ''} ${hasMass ? 'cal-has-mass' : ''}"
           ${hasMass ? `data-date="${dateStr}" role="button" tabindex="0" aria-label="${formatDateFull(dateStr)} — ${masses.length} celebração(ões)"` : ''}>
        <span class="cal-day-num">${d}</span>
        ${dots ? `<div class="cal-dots">${dots}</div>` : ''}
      </div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-has-mass').forEach(cell => {
    const open = () => openDayModal(cell.dataset.date, massMap[cell.dataset.date]);
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

// ── Modal de dia ──────────────────────────────────────────────
function openDayModal(dateStr, masses) {
  const overlay = document.getElementById('calDayModal');
  const title = document.getElementById('calModalDate');
  const body = document.getElementById('calModalBody');
  if (!overlay || !title || !body) return;

  title.textContent = formatDateFull(dateStr);

  body.innerHTML = masses.map(mass => {
    const massCtx = {
      celebracao: mass.label,
      data: formatDateBR(dateStr),
      horario: mass.time,
    };

    let participantsHtml = '';

    if (mass.isSpecial) {
      const roles = mass.data?.roles?.defined ?? [];
      const specialPids = roles.map(r => r.participantId);

      if (roles.length) {
        participantsHtml = `<div class="cal-modal-roles">${
          roles.map(r => `
            <div class="cal-modal-role-row">
              <span class="participant-chip ${r.type} sm">${escapeHtml(App.getShortName(r.participantName))}</span>
              <span class="cal-modal-role-label">${escapeHtml(r.role)}</span>
            </div>`).join('')
        }</div>`;
      }
      if ((mass.data?.roles?.tbd ?? []).length) {
        participantsHtml += `<p class="cal-modal-tbd">Funções a definir: ${escapeHtml(mass.data.roles.tbd.join(', '))}</p>`;
      }
      if (mass.data?.mandatoryAttendance) {
        participantsHtml += `<div class="cal-modal-mandatory">⚠️ ${escapeHtml(mass.data.mandatoryMessage)}</div>`;
      }
      if (specialPids.length) {
        participantsHtml += buildAbsenceActionBtn(massCtx, specialPids);
      }
    } else {
      participantsHtml = renderMassParticipants(mass.participants, massCtx, false);
    }

    return `
      <div class="cal-modal-mass ${mass.isSpecial ? 'cal-modal-mass-special' : ''}">
        <div class="cal-modal-mass-top">
          ${mass.isSpecial
            ? `<span class="smc-badge-special" style="font-size:0.72rem;">${mass.data?.icon ?? '✨'} ${escapeHtml(mass.label)}</span>`
            : `<span class="mass-time-badge ${mass.massId}">${escapeHtml(mass.short)}</span>`}
          <span class="cal-modal-time">🕐 ${escapeHtml(mass.time)}</span>
        </div>
        <div class="cal-modal-arrival">Chegada: ${mass.arrival} (1 hora antes)</div>
        <div style="margin-top:8px;">${participantsHtml}</div>
      </div>`;
  }).join('');

  Modal.open(overlay);
}

// ── Eventos de navegação ──────────────────────────────────────
function bindNavEvents() {
  document.getElementById('calPrev')?.addEventListener('click', () => {
    _month--; if (_month < 0) { _month = 11; _year--; } render();
  });
  document.getElementById('calNext')?.addEventListener('click', () => {
    _month++; if (_month > 11) { _month = 0; _year++; } render();
  });
  document.getElementById('calToday')?.addEventListener('click', () => {
    _year = new Date().getFullYear(); _month = new Date().getMonth(); render();
  });

  const overlay = document.getElementById('calDayModal');
  const closeModal = () => Modal.close(overlay);
  document.getElementById('calModalClose')?.addEventListener('click', closeModal);
  document.getElementById('calModalCloseFooter')?.addEventListener('click', closeModal);
  Modal.bindDismiss(overlay, closeModal);
}

export const Calendar = { init };
