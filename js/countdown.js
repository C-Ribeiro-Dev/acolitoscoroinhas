/**
 * countdown.js — Contador regressivo para a próxima celebração
 *
 * Calcula qual celebração (regular ou especial) está por vir e exibe um
 * contador em tempo real, atualizando a cada segundo.
 *
 * Os horários das missas regulares vêm de `App.getConfig().masses` (o
 * mesmo config.json usado pelo gerador de escalas) — antes este arquivo
 * tinha uma cópia própria e hardcoded desses horários, que podia ficar
 * dessincronizada se alguém atualizasse config.json sem lembrar de
 * atualizar aqui também.
 *
 * Acólitos & Coroinhas — Sistema de Gerenciamento de Escalas
 */
import { App } from './app.js';
import { parseLocalDate } from './shared/date-utils.js';

let _intervalId = null;

// ── Cálculo da próxima celebração ─────────────────────────────
/**
 * Encontra o próximo evento (missa regular OU especial) a partir de agora.
 * @returns {{ date: Date, mass: object } | null}
 */
function getNextMass() {
  const now = new Date();
  let nearest = null;

  // 1. Missas regulares semanais (próximos 7 dias), lidas de config.json
  const regularMasses = App.getConfig()?.masses ?? [];
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + daysAhead);

    for (const mass of regularMasses) {
      if (candidate.getDay() !== mass.day) continue;

      const massDate = new Date(candidate);
      massDate.setHours(mass.timeHour ?? 0, mass.timeMinute ?? 0, 0, 0);

      if (massDate > now && (!nearest || massDate < nearest.date)) {
        nearest = { date: massDate, mass };
      }
    }

    if (nearest && daysAhead === 0) break;
  }

  // 2. Missas especiais (avulsas) cadastradas em missas-especiais.json
  const especiais = App.getMissasEspeciais?.() ?? [];

  for (const m of especiais) {
    if (m.active === false) continue;

    const [h, min] = m.time.split(':').map(Number);
    const d = parseLocalDate(m.date, m.time);

    if (d > now && (!nearest || d < nearest.date)) {
      nearest = {
        date: d,
        mass: {
          id: m.id,
          label: m.name,
          day: d.getDay(),
          timeHour: h,
          timeMinute: min,
          isSpecial: true,
          data: m,
        },
      };
    }
  }

  return nearest;
}

// ── Formatação de dígitos ─────────────────────────────────────
function pad(n) {
  return String(Math.max(0, n)).padStart(2, '0');
}

// ── Atualização do DOM ────────────────────────────────────────
function updateDisplay() {
  const next = getNextMass();

  const elDays = document.getElementById('countdown-days');
  const elHours = document.getElementById('countdown-hours');
  const elMinutes = document.getElementById('countdown-minutes');
  const elSeconds = document.getElementById('countdown-seconds');
  const elLabel = document.getElementById('heroNextMass');

  if (!elDays) return; // Elemento não existe nesta página

  if (!next) {
    [elDays, elHours, elMinutes, elSeconds].forEach(el => { el.textContent = '00'; });
    if (elLabel) elLabel.textContent = 'Nenhuma missa nos próximos dias.';
    return;
  }

  const now = new Date();
  const diff = next.date - now; // milissegundos

  if (diff <= 0) {
    // Missa começando agora — reinicia imediatamente
    clearInterval(_intervalId);
    _intervalId = null;
    setTimeout(start, 1500);
    [elDays, elHours, elMinutes, elSeconds].forEach(el => { el.textContent = '00'; });
    if (elLabel) {
      elLabel.innerHTML = '';
      elLabel.append('🔔 ');
      const strong = document.createElement('strong');
      strong.textContent = next.mass.label;
      elLabel.append(strong, ' está começando agora!');
    }
    return;
  }

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  elDays.textContent = pad(days);
  elHours.textContent = pad(hours);
  elMinutes.textContent = pad(minutes);
  elSeconds.textContent = pad(seconds);

  if (elLabel) {
    const dateFormatted = next.date.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const prefix = next.mass.isSpecial ? 'Próxima celebração' : 'Próxima missa';
    elLabel.innerHTML = '';
    elLabel.append(`${prefix}: `);
    const strong = document.createElement('strong');
    strong.textContent = next.mass.label;
    elLabel.append(strong, ` — ${dateFormatted}`);
  }

  elDays.closest('.countdown-item')?.classList.toggle('highlight', days === 0);
}

// ── Início / parada do contador ────────────────────────────────
function start() {
  stop();
  updateDisplay();
  _intervalId = setInterval(updateDisplay, 1000);
}

function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

// ── Pausa ao esconder a aba (economia de recursos) ────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else start();
});

export const Countdown = { start, stop, getNextMass };
