/**
 * date-utils.js — utilitários únicos de data/hora
 *
 * Regra do módulo: toda leitura/escrita de "YYYY-MM-DD" passa por aqui,
 * sempre em horário local (nunca UTC). Isso evita o bug de "um dia a
 * mais/a menos" que acontece ao misturar `new Date('YYYY-MM-DD')` (lido
 * pelo browser como UTC) com `.toISOString()` (sempre serializa em UTC).
 */

/**
 * Converte "YYYY-MM-DD" (+ "HH:MM" opcional) em Date, sempre em horário local.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} [timeStr] - "HH:MM", padrão meio-dia (evita virada de DST)
 * @returns {Date}
 */
export function parseLocalDate(dateStr, timeStr = '12:00') {
  return new Date(`${dateStr}T${timeStr}:00`);
}

/**
 * Formata um Date como "YYYY-MM-DD" usando os componentes LOCAIS
 * (getFullYear/getMonth/getDate) — nunca `.toISOString()`, que lê em UTC
 * e pode devolver o dia errado para fusos negativos como o do Brasil.
 * @param {Date} date
 * @returns {string}
 */
export function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Formata "YYYY-MM-DD" no padrão brasileiro "DD/MM/YYYY". */
export function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Formata "YYYY-MM-DD" de forma amigável: "6 de junho de 2026". */
export function formatDateFull(dateStr) {
  if (!dateStr) return '';
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Formata data de notícia de forma amigável e curta. */
export function formatNewsDate(dateStr) {
  if (!dateStr) return '';
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Retorna o nome abreviado do dia da semana (ex.: "Sáb", "Dom"). */
export function getDayAbbr(dateStr) {
  if (!dateStr) return '';
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '')
    .replace(/^\w/, c => c.toUpperCase());
}

/** Formata um intervalo "DD/MM – DD/MM" a partir de weekStart/weekEnd. */
export function formatWeekRange(weekStart, weekEnd) {
  return `${formatDateBR(weekStart)} – ${formatDateBR(weekEnd)}`;
}

/** true se o fim do dia informado já passou em relação a agora. */
export function isPast(dateStr) {
  return parseLocalDate(dateStr, '23:59').getTime() < Date.now();
}

/** true se a data informada é hoje, comparando em horário local. */
export function isToday(dateStr) {
  return dateStr === toLocalDateString(new Date());
}

/** Formata data relativa: "hoje", "amanhã", "em 3 dias", "há 2 dias"... */
export function formatRelativeDate(dateStr) {
  const date = parseLocalDate(dateStr);
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  const diffDays = Math.round((date - now) / 86400000);

  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'amanhã';
  if (diffDays === -1) return 'ontem';
  if (diffDays > 0) return `em ${diffDays} dias`;
  return `há ${Math.abs(diffDays)} dias`;
}

/**
 * Calcula o horário de chegada (1 hora antes da missa).
 * @param {string} timeStr - "HH:MM"
 * @returns {string} "HH:MM"
 */
export function getArrivalTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m - 60;
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
