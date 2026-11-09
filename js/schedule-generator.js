/**
 * schedule-generator.js — Gerador Automático de Escalas v2.1
 *
 * Algoritmo de distribuição equilibrada e inteligente:
 *
 * RESTRIÇÕES HARD (desclassificam o participante):
 *   1. active === false
 *   2. restrictions.days   → dias da semana bloqueados
 *   3. restrictions.massIds → missas permanentemente bloqueadas
 *   4. availability.massIds → whitelist: se preenchida, só serve nessas missas
 *   5. dias consecutivos    → acólito que serviu sábado não serve domingo
 *   6. restrictions.monthly / config.defaultMonthlyLimits → limite mensal
 *
 * SELEÇÃO JUSTA (scoring):
 *   • Score base = serviços nas últimas N semanas (ponderado por recência)
 *   • Penalidade de 50 pts por já servir outra missa neste fim de semana
 *   • Penalidade adicional pelo uso mensal da missa atual
 *   • Menor score = maior prioridade (menos sobrecarregado)
 *
 * FALLBACK PROGRESSIVO (quando pool primário é insuficiente):
 *   Tier 1: elegíveis + não servem neste fim de semana
 *   Tier 2: elegíveis + já servem uma vez neste fim de semana
 *   (garante que a escala nunca fique completamente vazia)
 *
 * Datas: toda leitura/escrita de "YYYY-MM-DD" usa shared/date-utils.js
 * (sempre horário local) — nunca `.toISOString()`, que serializa em UTC
 * e pode devolver o dia errado num fuso negativo como o do Brasil.
 *
 * Acólitos & Coroinhas — Sistema de Gerenciamento de Escalas
 */
import { App } from './app.js';
import { parseLocalDate, toLocalDateString } from './shared/date-utils.js';

// ════════════════════════════════════════════════════════════
// UTILITÁRIOS DE DATA LOCAIS AO ALGORITMO
// ════════════════════════════════════════════════════════════

/** Adiciona N dias a uma Data. */
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Retorna a segunda-feira (início ISO da semana) da semana que contém `date`.
 * @param {Date} date
 * @returns {Date}
 */
function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = dom, 6 = sáb
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Gera um ID de semana ISO no formato "YYYY-Www" (algoritmo ISO 8601, via UTC).
 * @param {Date} mondayDate - Segunda-feira da semana
 * @returns {string} Ex: "2026-W24"
 */
function getWeekId(mondayDate) {
  const d = new Date(Date.UTC(
    mondayDate.getFullYear(),
    mondayDate.getMonth(),
    mondayDate.getDate()
  ));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ════════════════════════════════════════════════════════════
// CONTAGEM MENSAL
// ════════════════════════════════════════════════════════════

/**
 * Conta quantas vezes um participante foi escalado em uma missa específica
 * dentro de um mês. Considera tanto as escalas salvas quanto as já
 * alocadas na semana em geração (evita dupla contagem).
 * @returns {number}
 */
function getMonthlyCount(participantId, massId, year, month, allSchedules, weekMasses = []) {
  let count = 0;

  for (const week of allSchedules) {
    for (const mass of (week.masses ?? [])) {
      if (mass.massId !== massId) continue;
      if (!(mass.participants ?? []).includes(participantId)) continue;
      const d = parseLocalDate(mass.date, '00:00');
      if (d.getFullYear() === year && d.getMonth() === month) count++;
    }
  }

  for (const mass of weekMasses) {
    if (mass.massId !== massId) continue;
    if (!(mass.participants ?? []).includes(participantId)) continue;
    const d = parseLocalDate(mass.date, '00:00');
    if (d.getFullYear() === year && d.getMonth() === month) count++;
  }

  return count;
}

// ════════════════════════════════════════════════════════════
// VERIFICAÇÃO DE ELEGIBILIDADE (hard constraints)
// ════════════════════════════════════════════════════════════

/**
 * Retorna `true` se o participante PODE servir nesta missa nesta data.
 * @param {object} participant
 * @param {object} massConfig
 * @param {Date}   targetDate
 * @param {Array}  allSchedules
 * @param {Array}  weekMasses
 * @param {object} config
 * @returns {boolean}
 */
function isEligible(participant, massConfig, targetDate, allSchedules, weekMasses, config) {
  if (!participant.active) return false;

  const dayOfWeek = targetDate.getDay();

  const blockedDays = participant.restrictions?.days ?? [];
  if (blockedDays.includes(dayOfWeek)) return false;

  const blockedMasses = participant.restrictions?.massIds ?? [];
  if (blockedMasses.includes(massConfig.id)) return false;

  const availabilityList = participant.availability?.massIds ?? [];
  if (availabilityList.length > 0 && !availabilityList.includes(massConfig.id)) {
    return false;
  }

  // Acólito que já serviu no sábado desta semana não serve no domingo
  if (participant.type === 'acolito' && targetDate.getDay() === 0) {
    const servedSaturday = weekMasses.some(m => {
      const mDate = parseLocalDate(m.date, '00:00');
      return mDate.getDay() === 6 && (m.participants ?? []).includes(participant.id);
    });
    if (servedSaturday) return false;
  }

  // Limite mensal individual (ex: restrictions.monthly.dom-19 = 1)
  const personalMonthly = participant.restrictions?.monthly ?? {};
  if (Object.prototype.hasOwnProperty.call(personalMonthly, massConfig.id)) {
    const limit = personalMonthly[massConfig.id];
    if (limit !== null && limit !== undefined) {
      const count = getMonthlyCount(
        participant.id, massConfig.id,
        targetDate.getFullYear(), targetDate.getMonth(),
        allSchedules, weekMasses
      );
      if (count >= limit) return false;
    }
  } else {
    // Limite mensal global, só quando não há configuração individual
    const globalMonthly = config?.scheduleSettings?.defaultMonthlyLimits ?? {};
    if (Object.prototype.hasOwnProperty.call(globalMonthly, massConfig.id)) {
      const limit = globalMonthly[massConfig.id];
      if (limit !== null && limit !== undefined) {
        const count = getMonthlyCount(
          participant.id, massConfig.id,
          targetDate.getFullYear(), targetDate.getMonth(),
          allSchedules, weekMasses
        );
        if (count >= limit) return false;
      }
    }
  }

  return true;
}

// ════════════════════════════════════════════════════════════
// SISTEMA DE PONTUAÇÃO (scoring para seleção justa)
// ════════════════════════════════════════════════════════════

/**
 * Mapa participantId → score de serviços recentes, com peso decrescente
 * (semanas mais recentes pesam mais).
 * @returns {Map<number, number>}
 */
function buildRecentScoreMap(allSchedules, weeksBack = 6) {
  const scoreMap = new Map();
  const now = new Date();
  const cutoff = addDays(now, -(weeksBack * 7));

  for (const week of allSchedules) {
    const weekDate = parseLocalDate(week.weekStart, '00:00');
    if (weekDate < cutoff) continue;

    const daysAgo = Math.max(0, (now - weekDate) / 86400000);
    const maxDays = weeksBack * 7;
    const weight = (maxDays - daysAgo) / maxDays;

    for (const mass of (week.masses ?? [])) {
      for (const pid of (mass.participants ?? [])) {
        scoreMap.set(pid, (scoreMap.get(pid) ?? 0) + weight);
      }
    }
  }

  return scoreMap;
}

/** Quantas missas o participante já tem alocadas nesta semana (same-weekend penalty). */
function getWeekAssignments(participantId, weekMasses) {
  return weekMasses.reduce((count, mass) =>
    count + ((mass.participants ?? []).includes(participantId) ? 1 : 0),
  0);
}

// ════════════════════════════════════════════════════════════
// SELEÇÃO DE PARTICIPANTES
// ════════════════════════════════════════════════════════════

/**
 * Seleciona os N melhores participantes para uma missa específica.
 * @param {Array}  participants
 * @param {object} massConfig
 * @param {Date}   targetDate
 * @param {Array}  allSchedules
 * @param {Array}  weekMasses
 * @param {number} needed
 * @param {object} config
 * @returns {number[]} IDs selecionados
 */
function selectParticipants(participants, massConfig, targetDate, allSchedules, weekMasses, needed, config) {
  const weeksBack = config?.scheduleSettings?.fairnessWeekLookback ?? 6;
  const scoreMap = buildRecentScoreMap(allSchedules, weeksBack);

  const minByType = config?.scheduleSettings?.minByType ?? {};
  const minByMassId = config?.scheduleSettings?.minByMassId ?? {};
  const massMin = minByMassId[massConfig.id] ?? {};
  const minAcolito = massMin['acolito'] ?? minByType['acolito'] ?? 0;
  const minCoroinha = massMin['coroinha'] ?? minByType['coroinha'] ?? 0;

  /** Score composto — menor = maior prioridade (menos sobrecarregado). */
  function computeScore(p) {
    const recentScore = scoreMap.get(p.id) ?? 0;
    const weekCount = getWeekAssignments(p.id, weekMasses);
    const personalMonthly = p.restrictions?.monthly ?? {};
    let monthlyUsage = 0;
    if (Object.prototype.hasOwnProperty.call(personalMonthly, massConfig.id)) {
      monthlyUsage = getMonthlyCount(
        p.id, massConfig.id,
        targetDate.getFullYear(), targetDate.getMonth(),
        allSchedules, weekMasses
      );
    }
    return (recentScore * 100) + (weekCount * 50) + (monthlyUsage * 10);
  }

  const eligible = participants.filter(p =>
    isEligible(p, massConfig, targetDate, allSchedules, weekMasses, config)
  );

  const selectedIds = new Set();

  // Fase 0: participantes fixos (config.scheduleSettings.fixedParticipants[massId])
  const fixedPids = (config?.scheduleSettings?.fixedParticipants ?? {})[massConfig.id] ?? [];
  for (const fid of fixedPids) {
    const fp = participants.find(p => p.id === fid);
    if (fp && isEligible(fp, massConfig, targetDate, allSchedules, weekMasses, config)) {
      selectedIds.add(fid);
    }
  }

  /** Seleciona os N melhores de um pool (Tier 1 antes de Tier 2). */
  function pickBest(pool, n) {
    if (n <= 0) return;
    const available = pool.filter(p => !selectedIds.has(p.id));
    const tier1 = available
      .filter(p => getWeekAssignments(p.id, weekMasses) === 0)
      .sort((a, b) => computeScore(a) - computeScore(b));
    const tier2 = available
      .filter(p => getWeekAssignments(p.id, weekMasses) > 0)
      .sort((a, b) => computeScore(a) - computeScore(b));
    [...tier1, ...tier2].slice(0, n).forEach(p => selectedIds.add(p.id));
  }

  // Fase 1/2: preenche mínimo de acólitos e coroinhas (descontando fixos)
  const fixedAcolitos = [...selectedIds].filter(id => participants.find(p => p.id === id && p.type === 'acolito'));
  const fixedCoroinhas = [...selectedIds].filter(id => participants.find(p => p.id === id && p.type === 'coroinha'));
  pickBest(eligible.filter(p => p.type === 'acolito'), Math.max(0, minAcolito - fixedAcolitos.length));
  pickBest(eligible.filter(p => p.type === 'coroinha'), Math.max(0, minCoroinha - fixedCoroinhas.length));

  // Fase 3: preenche slots restantes com o melhor score geral
  const remaining = needed - selectedIds.size;
  if (remaining > 0) {
    pickBest(eligible, remaining);
  }

  const selected = [...selectedIds];

  if (selected.length < needed) {
    console.warn(
      `[ScheduleGenerator] Pool insuficiente para "${massConfig.label}" em ` +
      `${toLocalDateString(targetDate)}: ` +
      `${selected.length}/${needed} participantes selecionados.`
    );
  }

  return selected;
}

// ════════════════════════════════════════════════════════════
// GERAÇÃO DE UMA SEMANA
// ════════════════════════════════════════════════════════════

/**
 * Gera a escala completa de um fim de semana. Cada missa usa como contexto
 * as missas já geradas anteriormente na mesma semana (penalidade de
 * "mesmo fim de semana" aplicada corretamente).
 * @param {Date}   mondayDate
 * @param {Array}  participants
 * @param {object} config
 * @param {Array}  existingSchedules
 * @returns {object} Semana no formato do escalas.json
 */
function generateWeek(mondayDate, participants, config, existingSchedules) {
  const weekStart = toLocalDateString(mondayDate);
  const weekEnd = toLocalDateString(addDays(mondayDate, 6));
  const weekId = getWeekId(mondayDate);
  const defaultNeeded = config?.scheduleSettings?.participantsPerMass?.default ?? 3;
  const byMassId = config?.scheduleSettings?.participantsPerMass?.byMassId ?? {};

  const weekMasses = []; // acumula as missas já geradas desta semana

  for (const massConfig of (config?.masses ?? [])) {
    // Segunda (day=1) → +0 dias; Sábado (day=6) → +5; Domingo (day=0) → +6
    const daysToAdd = massConfig.day === 0 ? 6 : massConfig.day - 1;
    const massDate = addDays(mondayDate, daysToAdd);
    const needed = byMassId[massConfig.id] ?? defaultNeeded;

    const selectedIds = selectParticipants(
      participants,
      massConfig,
      massDate,
      existingSchedules,
      weekMasses, // passado por referência: muta conforme avançamos
      needed,
      config
    );

    weekMasses.push({
      massId: massConfig.id,
      date: toLocalDateString(massDate),
      participants: selectedIds,
      observations: '',
    });
  }

  return {
    weekId,
    weekStart,
    weekEnd,
    status: 'upcoming',
    generatedAt: new Date().toISOString(),
    masses: weekMasses,
  };
}

// ════════════════════════════════════════════════════════════
// ATUALIZAÇÃO DE STATUS
// ════════════════════════════════════════════════════════════

/**
 * Reclassifica o status de cada semana com base na data atual
 * ('past' | 'current' | 'upcoming').
 * @param {Array} schedules
 * @returns {Array}
 */
function refreshStatuses(schedules) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return schedules.map(week => {
    const start = parseLocalDate(week.weekStart, '00:00');
    const end = parseLocalDate(week.weekEnd, '23:59');

    let status;
    if (end < today) status = 'past';
    else if (start <= today) status = 'current';
    else status = 'upcoming';

    return { ...week, status };
  });
}

// ════════════════════════════════════════════════════════════
// GERAÇÃO AUTOMÁTICA
// ════════════════════════════════════════════════════════════

/**
 * Gera semanas futuras vazias ou faltantes, em ordem cronológica.
 * @param {Array}  schedules    - Escalas com status atualizado
 * @param {Array}  participants - Participantes ativos
 * @param {object} config
 * @returns {{ schedules: Array, generated: number }}
 */
function autoGenerate(schedules, participants, config) {
  const aheadWeeks = config?.scheduleSettings?.scheduleAheadWeeks ?? 4;
  const sorted = [...schedules].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  let generated = 0;
  const result = []; // acumula semanas processadas (histórico para scoring)

  // Fase 1: processa semanas existentes em ordem
  for (const week of sorted) {
    if (week.status === 'past') {
      result.push(week);
      continue;
    }

    const hasParticipants = (week.masses ?? []).some(m => (m.participants ?? []).length > 0);

    if (!hasParticipants) {
      const mondayDate = parseLocalDate(week.weekStart, '00:00');
      const newWeek = generateWeek(mondayDate, participants, config, result);
      result.push({
        ...week,
        masses: newWeek.masses,
        generatedAt: newWeek.generatedAt,
      });
      generated++;
    } else {
      result.push(week);
    }
  }

  // Fase 2: adiciona semanas novas até atingir `aheadWeeks`
  const upcomingCount = result.filter(w => w.status !== 'past').length;

  if (upcomingCount < aheadWeeks) {
    const lastWeek = result[result.length - 1];
    let nextMonday = lastWeek
      ? getWeekStart(addDays(parseLocalDate(lastWeek.weekEnd, '00:00'), 1))
      : getWeekStart(new Date());

    const toGenerate = aheadWeeks - upcomingCount;

    for (let i = 0; i < toGenerate; i++) {
      const weekStr = toLocalDateString(nextMonday);
      const exists = result.some(w => w.weekStart === weekStr);

      if (!exists) {
        const newWeek = generateWeek(nextMonday, participants, config, result);
        result.push(newWeek);
        generated++;
      }

      nextMonday = addDays(nextMonday, 7);

      if (result.length > 60) break; // proteção contra loop infinito
    }
  }

  return { schedules: result, generated };
}

// ════════════════════════════════════════════════════════════
// PONTO DE ENTRADA PRINCIPAL
// ════════════════════════════════════════════════════════════

/**
 * Executa o ciclo completo: carrega dados do App, atualiza status,
 * gera semanas faltantes (se houver participantes cadastrados).
 * @returns {{ schedules: Array, generated: number }}
 */
function run() {
  const allParticipants = App.getParticipants() ?? [];
  const config = App.getConfig();
  const rawSchedules = App.getSchedules() ?? [];

  if (!config) {
    console.warn('[ScheduleGenerator] config.json não carregado.');
    return { schedules: rawSchedules, generated: 0 };
  }

  const updatedSchedules = refreshStatuses(rawSchedules);
  const activeParticipants = allParticipants.filter(p => p.active !== false);

  if (activeParticipants.length === 0) {
    return { schedules: updatedSchedules, generated: 0 };
  }

  return autoGenerate(updatedSchedules, activeParticipants, config);
}

// ── API pública ────────────────────────────────────────────────
export const ScheduleGenerator = {
  run,
  generateWeek,
  refreshStatuses,
  autoGenerate,
  isEligible,
  getMonthlyCount,
  getWeekStart,
  toDateString: toLocalDateString,
  getWeekId,
};
