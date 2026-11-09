/**
 * dom-utils.js — utilitários pequenos de DOM reutilizados por várias páginas.
 */

/**
 * Escapa texto vindo de dados editáveis (JSON de participantes/notícias)
 * antes de interpolar em innerHTML. Sempre usar em nome/apelido/título/
 * conteúdo/autor — esses arquivos são editados manualmente por voluntários
 * sem validação, então texto com `<`, `>`, `&`, `"` precisa ser neutralizado.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Abrir/fechar/vincular-dismissal de modal — comportamento único
 * reutilizado por todos os modais do site (antes reimplementado em cada
 * arquivo de página com pequenas variações).
 */
export const Modal = {
  open(overlay) {
    if (!overlay) return;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  },

  close(overlay) {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  },

  /**
   * Vincula fechamento por clique fora e tecla Escape.
   * Idempotente: pode ser chamado várias vezes para o mesmo overlay sem
   * duplicar listeners (evita o double-bind que existia no modal antigo).
   * @param {HTMLElement} overlay
   * @param {() => void} onClose
   */
  bindDismiss(overlay, onClose) {
    if (!overlay || overlay.dataset.dismissBound === 'true') return;
    overlay.dataset.dismissBound = 'true';
    overlay.addEventListener('click', e => {
      if (e.target === overlay) onClose();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) onClose();
    });
  },
};

/**
 * Debounce simples — atrasa a chamada de `fn` até `wait` ms sem nova chamada.
 * @param {Function} fn
 * @param {number} wait
 */
export function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Remove acentos e normaliza para minúsculas — usado para comparação de
 * texto em buscas (ex.: "José" e "jose" devem casar).
 * @param {string} str
 */
export function normalizeText(str) {
  return (str ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
