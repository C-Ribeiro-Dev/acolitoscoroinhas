/**
 * partials.js — injeta fragmentos HTML compartilhados (navbar, footer).
 *
 * Antes navbar/footer/meta tags eram copiados e colados em cada uma das
 * 4 páginas — mudar um link do menu exigia editar 4 arquivos. Mantém a
 * filosofia "zero build step" do projeto (README): em vez de um passo de
 * build que gera HTML final, os fragmentos são buscados via fetch() em
 * tempo de execução, igual aos dados de data/*.json.
 *
 * Uso: <div data-partial="navbar"></div> no HTML, e chamar
 * `await injectPartials()` ANTES de `App.init()` (que consulta #navbar,
 * #navToggle, #navMenu, .nav-link — precisam existir no DOM primeiro).
 */
export async function injectPartials() {
  const slots = [...document.querySelectorAll('[data-partial]')];

  await Promise.all(slots.map(async slot => {
    const name = slot.dataset.partial;
    try {
      const res = await fetch(`partials/${name}.html`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      slot.outerHTML = await res.text();
    } catch (err) {
      console.warn(`[partials] Falha ao carregar "${name}":`, err.message);
    }
  }));
}
