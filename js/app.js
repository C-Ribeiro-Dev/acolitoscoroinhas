/**
 * app.js — Módulo principal da aplicação
 * Responsável por: carregamento de dados, cache, navegação e utilitários
 * de texto/UI que não são específicos de nenhuma página.
 *
 * Utilitários de data ficam em shared/date-utils.js — importe de lá
 * diretamente em vez de esperar encontrá-los aqui.
 *
 * Acólitos & Coroinhas — Sistema de Gerenciamento de Escalas
 */
import { WA_NUMBER } from './shared/constants.js';

// ── Cache de dados carregados ──────────────────────────────────
const _cache = {
  config: null,
  participants: null,
  schedules: null,
  noticias: null,
  missasEspeciais: null,
};

// ── Carregamento de JSON via fetch ─────────────────────────────
/**
 * Carrega um arquivo JSON. Retorna null (com aviso no console) se a
 * requisição falhar — nunca lança, para não travar o carregamento das
 * outras fontes de dados carregadas em paralelo.
 * @param {string} path - Caminho relativo ao arquivo JSON
 * @returns {Promise<object|null>}
 */
async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[App] Falha ao carregar ${path}:`, err.message);
    return null;
  }
}

// ── Carregamento de todos os dados ─────────────────────────────
async function loadAllData() {
  const [config, participantsData, schedulesData, noticiasData, missasEspeciaisData] = await Promise.all([
    loadJSON('data/config.json'),
    loadJSON('data/participants.json'),
    loadJSON('data/escalas.json'),
    loadJSON('data/noticias.json'),
    loadJSON('data/missas-especiais.json'),
  ]);

  _cache.config = config;

  // Filtra entradas que sejam objetos de participante válidos
  _cache.participants = (participantsData?.participants ?? []).filter(
    p => p && typeof p.id === 'number' && typeof p.name === 'string'
  );

  _cache.schedules = schedulesData?.schedules ?? [];
  _cache.noticias = noticiasData?.items ?? [];
  _cache.missasEspeciais = missasEspeciaisData?.items ?? [];

  return _cache;
}

// ── Getters de dados ───────────────────────────────────────────
const getData = () => _cache;
const getConfig = () => _cache.config;
const getParticipants = () => _cache.participants;
const getSchedules = () => _cache.schedules;
const getNoticias = () => _cache.noticias;
const getMissasEspeciais = () => _cache.missasEspeciais ?? [];

/** Configuração de uma missa específica pelo ID (ex.: "dom-19"). */
function getMassConfig(massId) {
  return _cache.config?.masses?.find(m => m.id === massId) ?? null;
}

/** Participante pelo ID numérico. */
function getParticipantById(id) {
  return _cache.participants?.find(p => p.id === id) ?? null;
}

// ── Navegação ──────────────────────────────────────────────────
function setActiveNavLink() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === currentPage);
  });
}

function initNavbarScroll() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initMobileMenu() {
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', isOpen);
  });

  menu.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', false);
    });
  });

  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', false);
    }
  });
}

// ── Utilitários de texto ───────────────────────────────────────

/**
 * Iniciais de um nome (até 2 letras). Ex: "João da Silva" → "JS"
 * @param {string} name
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Primeiro nome + último sobrenome. Ex: "João da Silva Pereira" → "João Pereira"
 * @param {string} name
 */
function getShortName(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Trunca um texto ao número máximo de caracteres, adicionando "…". */
function truncate(text, max = 120) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

// ── Toast notifications ────────────────────────────────────────
/**
 * Exibe uma notificação toast temporária.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} type
 * @param {number} duration - ms
 */
function showToast(message, type = 'info', duration = 4000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = 'toast';
  const iconSpan = document.createElement('span');
  iconSpan.textContent = icons[type] ?? 'ℹ️';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.append(iconSpan, msgSpan);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── WhatsApp — comunicação de ausência ────────────────────────
// Fonte única da mensagem/URL de ausência (antes duplicada aqui e dentro
// do modal de ausência com o número de telefone hardcoded de novo).
function buildAbsenceWhatsappUrl(nome, celebracao, data, horario) {
  const msg =
    `Olá!\n\nGostaria de informar que o(a) acólito(a)/coroinha *${nome}* não poderá servir na celebração *${celebracao}* do dia *${data}*, às *${horario}*.\n\nPeço, por gentileza, que seja providenciada uma substituição.\n\nObrigado(a)!`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// ── Inicialização global ───────────────────────────────────────
async function init() {
  initNavbarScroll();
  initMobileMenu();
  setActiveNavLink();
  await loadAllData();
}

// ── API pública ────────────────────────────────────────────────
export const App = {
  init,
  loadAllData,
  getData,
  getConfig,
  getParticipants,
  getSchedules,
  getNoticias,
  getMissasEspeciais,
  getMassConfig,
  getParticipantById,
  getInitials,
  getShortName,
  truncate,
  showToast,
  buildAbsenceWhatsappUrl,
};
