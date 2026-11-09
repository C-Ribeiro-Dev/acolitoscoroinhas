/**
 * pages/search.js — Busca de participante (escalas.html)
 * Encontra todas as escalas (próximas e passadas) de um acólito ou coroinha.
 */
import { App } from '../app.js';
import { ScheduleGenerator } from '../schedule-generator.js';
import { formatDateFull, getArrivalTime } from '../shared/date-utils.js';
import { escapeHtml, debounce, normalizeText } from '../shared/dom-utils.js';

function init() {
  const input = document.getElementById('participantSearch');
  if (!input) return;

  const debouncedSearch = debounce(q => doSearch(q), 280);

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q.length < 2) { clearResults(); return; }
    debouncedSearch(q);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; clearResults(); }
  });

  document.getElementById('searchClearBtn')?.addEventListener('click', () => {
    input.value = '';
    clearResults();
    input.focus();
  });
}

// ── Busca principal ───────────────────────────────────────────
function doSearch(query) {
  const q = normalizeText(query);
  const participants = App.getParticipants() ?? [];

  const matches = participants.filter(p =>
    normalizeText(p.name).includes(q) ||
    (p.nickname && normalizeText(p.nickname).includes(q))
  );

  if (matches.length === 0) { showNoResults(query); return; }

  const result = ScheduleGenerator.run();
  const schedules = result.schedules;
  const config = App.getConfig();
  const especiais = App.getMissasEspeciais() ?? [];
  const now = new Date();

  const participantResults = matches.map(participant => {
    const upcoming = [];
    const past = [];

    for (const week of schedules) {
      for (const mass of (week.masses ?? [])) {
        if (!(mass.participants ?? []).includes(participant.id)) continue;
        const mc = config?.masses?.find(m => m.id === mass.massId);
        const massDate = new Date(`${mass.date}T00:00:00`);
        massDate.setHours(mc?.timeHour ?? 0, mc?.timeMinute ?? 0, 0, 0);
        const entry = {
          date: mass.date,
          massId: mass.massId,
          massLabel: mc?.label ?? mass.massId,
          shortLabel: mc?.shortLabel ?? mass.massId,
          time: mc?.time ?? '',
          arrival: mc?.time ? getArrivalTime(mc.time) : '',
        };
        if (massDate >= now) upcoming.push(entry);
        else past.push(entry);
      }
    }

    const specialUpcoming = [];
    for (const m of especiais) {
      if (m.active === false) continue;
      const defined = m.roles?.defined ?? [];
      const role = defined.find(r => r.participantId === participant.id);
      if (!role) continue;
      const md = new Date(`${m.date}T${m.time}:00`);
      if (md >= now) {
        specialUpcoming.push({ name: m.name, date: m.date, time: m.time, role: role.role, icon: m.icon ?? '✨' });
      }
    }

    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    past.sort((a, b) => b.date.localeCompare(a.date));

    return { participant, upcoming, past, specialUpcoming };
  });

  renderResults(participantResults, query);
}

// ── Renderização dos resultados ───────────────────────────────
function renderResults(results, query) {
  const container = document.getElementById('searchResults');
  if (!container) return;

  let html = `
    <div class="search-results-header">
      <span class="search-results-label">
        <strong>${results.length}</strong> participante${results.length !== 1 ? 's' : ''} encontrado${results.length !== 1 ? 's' : ''} para
        <em>"${escapeHtml(query)}"</em>
      </span>
      <button type="button" class="btn btn-ghost btn-sm" id="searchClearInlineBtn">
        Limpar
      </button>
    </div>
  `;

  for (const { participant, upcoming, past, specialUpcoming } of results) {
    const initials = App.getInitials(participant.name);
    const typeLabel = participant.type === 'acolito' ? 'Acólito' : 'Coroinha';
    const totalNext = upcoming.length + specialUpcoming.length;

    let upcomingHtml = '';
    if (totalNext > 0) {
      const regularRows = upcoming.slice(0, 10).map(e => `
        <div class="sr-row">
          <span class="mass-time-badge ${e.massId}">${escapeHtml(e.shortLabel)}</span>
          <span class="sr-row-date">${formatDateFull(e.date)}</span>
          <span class="sr-row-time">🕐 ${escapeHtml(e.time)}</span>
          <span class="sr-row-arrival">Chegada: ${e.arrival}</span>
        </div>`).join('');

      const specialRows = specialUpcoming.map(e => `
        <div class="sr-row sr-row-special">
          <span class="smc-badge-special" style="font-size:0.67rem;padding:2px 7px;">${e.icon} Especial</span>
          <span class="sr-row-date">${escapeHtml(e.name)} · ${formatDateFull(e.date)}</span>
          <span class="sr-row-time">🕐 ${escapeHtml(e.time)}</span>
          <span class="sr-row-arrival">${escapeHtml(e.role)}</span>
        </div>`).join('');

      upcomingHtml = `
        <div class="sr-section">
          <div class="sr-section-label">
            <span class="sr-section-dot sr-dot-upcoming"></span>
            Próximas participações (${totalNext})
          </div>
          ${regularRows}${specialRows}
          ${upcoming.length > 10 ? `<p class="sr-more">+${upcoming.length - 10} escalas adicionais</p>` : ''}
        </div>`;
    } else {
      upcomingHtml = `
        <div class="sr-section">
          <div class="sr-section-label">
            <span class="sr-section-dot sr-dot-upcoming"></span>Próximas participações
          </div>
          <p class="sr-empty">Nenhuma escala futura no momento.</p>
        </div>`;
    }

    let pastHtml = '';
    if (past.length > 0) {
      const rows = past.slice(0, 6).map(e => `
        <div class="sr-row sr-row-past">
          <span class="mass-time-badge ${e.massId}" style="opacity:0.55;">${escapeHtml(e.shortLabel)}</span>
          <span class="sr-row-date">${formatDateFull(e.date)}</span>
          <span class="sr-row-time">🕐 ${escapeHtml(e.time)}</span>
        </div>`).join('');

      pastHtml = `
        <div class="sr-section sr-section-past">
          <div class="sr-section-label">
            <span class="sr-section-dot sr-dot-past"></span>
            Histórico (${past.length})
          </div>
          ${rows}
          ${past.length > 6 ? `<p class="sr-more">+${past.length - 6} escalas no histórico</p>` : ''}
        </div>`;
    }

    html += `
      <div class="sr-card">
        <div class="sr-participant">
          <div class="avatar avatar-lg ${participant.type}">${initials}</div>
          <div class="sr-info">
            <div class="sr-name">${escapeHtml(participant.name)}</div>
            <div class="sr-type">${typeLabel}${!participant.active ? ' · <span class="sr-inactive">Inativo</span>' : ''}</div>
          </div>
          <div class="sr-summary">
            <span class="sr-badge ${totalNext > 0 ? 'sr-badge-active' : 'sr-badge-empty'}">
              ${totalNext > 0 ? `${totalNext} escalas` : 'Sem escalas'}
            </span>
          </div>
        </div>
        ${upcomingHtml}
        ${pastHtml}
      </div>`;
  }

  container.innerHTML = html;
  container.style.display = '';
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  document.getElementById('searchClearInlineBtn')?.addEventListener('click', () => {
    const input = document.getElementById('participantSearch');
    if (input) input.value = '';
    clearResults();
  });
}

function showNoResults(query) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  container.innerHTML = `
    <div class="search-no-results">
      <div class="empty-state-icon" style="font-size:2rem;">🔍</div>
      <h3>Nenhum participante encontrado</h3>
      <p>Sem resultado para "<strong>${escapeHtml(query)}</strong>".<br>Verifique a grafia do nome.</p>
    </div>`;
  container.style.display = '';
}

function clearResults() {
  const container = document.getElementById('searchResults');
  if (container) { container.innerHTML = ''; container.style.display = 'none'; }
}

export const Search = { init };
