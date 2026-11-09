# ✝ Acólitos & Coroinhas — Sistema de Gerenciamento de Escalas

> **Versão de demonstração:** todos os nomes, a paróquia e o endereço deste repositório são fictícios. Os dados reais não fazem parte desta versão.

Sistema web completo para gerenciamento de escalas de acólitos e coroinhas.
Dark mode, layout moderno e responsivo, sem banco de dados ou backend.

---

## 🚀 Como usar

> **Importante:** Por usar `fetch()` para carregar os JSONs e módulos ES
> (`<script type="module">`), o site precisa ser servido por um servidor
> HTTP local. Abrir diretamente como `file://` não funciona.

### Opção 1 — VS Code Live Server
Instale a extensão **Live Server** e clique em _"Go Live"_.

### Opção 2 — Node.js (npx)
```bash
npx serve .
```
> O arquivo `serve.json` na raiz desativa o redirecionamento de "clean URLs"
> desse pacote (`pagina.html` → `pagina`), que quebra o cache do service
> worker. Se usar outro servidor Node, confira se ele não faz esse tipo de
> redirecionamento.

### Opção 3 — Python
```bash
# Python 3
python -m http.server 3000
```

Acesse `http://localhost:3000` no navegador.

---

## 📁 Estrutura do Projeto

```
acolitoscoroinhas/
├── index.html              # Página inicial (countdown + escalas + avisos + notícias)
├── escalas.html             # Página de escalas (detalhe + lista/grade + filtros + busca)
├── calendario.html          # Calendário mensal de missas e celebrações especiais
├── noticias.html            # Página de notícias e avisos
│
├── partials/                # Fragmentos HTML compartilhados entre páginas
│   ├── navbar.html
│   └── footer.html
│
├── css/
│   ├── main.css              # Tokens de design, reset, layout, navbar, hero, responsividade
│   ├── components.css        # Botões, badges, cards, tabelas, filtros, modais etc.
│   └── print.css             # Estilos exclusivos da impressão/exportação de escala
│
├── js/
│   ├── app.js                 # Carregamento/cache de dados, navegação, utilitários de texto
│   ├── countdown.js           # Contador regressivo para a próxima missa
│   ├── schedule-generator.js  # Algoritmo de geração automática de escalas
│   ├── partials.js            # Injeta navbar/footer (partials/) via fetch em cada página
│   │
│   ├── shared/                 # Módulos usados por mais de uma página
│   │   ├── date-utils.js        # Única fonte de parsing/formatação de data (sempre local)
│   │   ├── dom-utils.js         # escapeHtml, helper de modal, debounce, normalização de texto
│   │   ├── constants.js         # Mapas de status/tipo/ícone reutilizados
│   │   ├── mass-render.js       # Renderização de participantes/missas (usado em 3+ páginas)
│   │   └── absence-modal.js     # Modal "Comunicar ausência" via WhatsApp
│   │
│   └── pages/                  # Um módulo por página, importado via <script type="module">
│       ├── home.js
│       ├── escalas.js
│       ├── noticias.js
│       ├── search.js
│       └── calendar.js
│
├── data/
│   ├── config.json            # Configurações globais: paróquia, missas, parâmetros
│   ├── participants.json      # Participantes (estrutura pronta; adicione os dados)
│   ├── escalas.json           # Escalas semanais (geradas automaticamente ou manualmente)
│   ├── noticias.json          # Notícias, avisos e novidades
│   └── missas-especiais.json  # Celebrações especiais/únicas (Corpus Christi etc.)
│
├── scripts/
│   └── validar-dados.js       # `node scripts/validar-dados.js` — valida integridade dos JSONs
│
├── .editorconfig             # Indentação/charset consistentes entre editores
├── .gitignore
└── serve.json                # Config do pacote "serve" (ver Opção 2 acima)
```

Cada arquivo `data/*.json` documenta o próprio formato num bloco `_schema`
no topo — é a referência mais atualizada de quais campos existem.

---

## ⚙️ Configuração

### 1. Dados da Paróquia (`data/config.json`)
Edite os campos:
```json
{
  "paroquia": "Nome da Sua Paróquia",
  "cidade": "Cidade - UF",
  "diocese": "Nome da Diocese"
}
```

### 2. Cadastro de Participantes (`data/participants.json`)

Adicione cada participante no array `participants`:

```json
{
  "participants": [
    {
      "id": 1,
      "name": "João da Silva",
      "nickname": "João",
      "type": "acolito",
      "active": true,
      "availability": { "massIds": [] },
      "restrictions": {
        "days": [],
        "massIds": [],
        "monthly": {}
      },
      "joinDate": "2025-01-01",
      "contact": "",
      "observations": ""
    }
  ]
}
```

Veja o bloco `_schema` do próprio arquivo para o significado de cada campo
(`availability` é whitelist, `restrictions` é blacklist).

**IDs das missas:**
| ID | Missa |
|----|-------|
| `sab-17` | Sábado 17h00 |
| `dom-08` | Domingo 08h00 |
| `dom-10` | Domingo 10h00 |
| `dom-19` | Domingo 19h00 |

Depois de editar `participants.json` ou `config.json`, rode
`node scripts/validar-dados.js` para checar IDs duplicados, referências
inválidas (`massId`/`fixedParticipants`) e contradições entre
`availability` e `restrictions` antes de publicar.

### 3. Notícias e Avisos (`data/noticias.json`)

```json
{
  "items": [
    {
      "id": 10,
      "type": "aviso",
      "priority": "high",
      "pinned": true,
      "title": "Título do aviso",
      "content": "Texto completo...",
      "date": "2026-06-01",
      "author": "Coordenação",
      "imageUrl": ""
    }
  ]
}
```

**Tipos disponíveis:** `"aviso"` · `"noticia"` · `"novidade"`
**Prioridades:** `"high"` · `"normal"` · `"low"`

### 4. Missas Especiais (`data/missas-especiais.json`)

Celebrações únicas fora da escala semanal (Corpus Christi, procissões etc.),
com funções (`roles`) atribuídas a participantes específicos. Veja o
`_schema` do arquivo para o formato completo.

---

## 📋 Funcionalidades

### Página Inicial (`index.html`)
- ⏱ **Contador regressivo** para a próxima missa (atualiza a cada segundo)
- 📊 **Estatísticas rápidas** (participantes, semanas escaladas, avisos)
- 📅 **Próximas 3 escalas** com participantes
- 📢 **Avisos fixados** de alta prioridade
- 📰 **Últimas notícias** e novidades

### Página de Escalas (`escalas.html`)
- 🗓 **Navegação por semana** (botões anterior/próxima)
- 📊 **Tabela detalhada** da semana selecionada com todos os participantes
- 🔲 **Visão em cards** ou **lista compacta** (alternável)
- 🔍 **Filtro por status**: Todas / Próximas & Atual / Histórico
- 🔎 **Busca por participante**, com histórico de escalas passadas e futuras
- 📤 **Compartilhar** a semana via WhatsApp e 🖨️ **imprimir/exportar** como PDF
- 🏷 **Badges de status**: Atual (verde) · Próxima (roxo) · Passada (azul)

### Calendário (`calendario.html`)
- 📅 Grade mensal com as missas e celebrações especiais do mês
- 🖱 Clique num dia para ver detalhes (participantes, horário de chegada)

### Página de Notícias (`noticias.html`)
- 📌 **Avisos fixados** em destaque no topo
- 🔍 **Filtro por tipo**: Todos / Avisos / Notícias / Novidades
- 🃏 **Cards modernos** com indicador de prioridade e categoria
- 📊 **Contadores** de itens por categoria

Em todas as páginas com participantes escalados, cada um pode **comunicar
ausência** via um botão que monta uma mensagem pronta para o WhatsApp da
coordenação.

---

## 🤖 Geração Automática de Escalas

O algoritmo (`js/schedule-generator.js`) funciona assim:

1. **Atualiza** o status de cada semana (past/current/upcoming) com base na data atual
2. **Verifica** se há pelo menos 4 semanas futuras escaladas (configurável em `config.json`)
3. **Gera** automaticamente novas semanas quando faltam ≤ 7 dias para o fim da última escala
4. **Distribui** participantes de forma equilibrada:
   - Filtra participantes elegíveis (ativo + sem restrições)
   - Prioriza quem serviu **menos recentemente** (últimas 4 semanas)
   - Evita escalar o mesmo participante em **2 missas do mesmo fim de semana**
   - Respeita restrições de **dias** e **missas específicas**

---

## 🎨 Design

- **Dark Mode** exclusivo com paleta vinho/dourada
- **Tipografia:** Inter (Google Fonts), com escala de tamanhos em tokens (`--text-*`)
- **Cores principais:**
  - Fundo: `#0b0b12` · Cards: `#18182c`
  - Marca (`--accent-brand`): `#e11d48` (vinho/bordô) — hero, botões, links, foco
  - Secundário (`--accent-gold`): `#f59e0b` (dourado sagrado)
  - Roxo (`--accent-purple`, `#8b5cf6`) continua existindo como cor de **papel
    próprio** (não é mais a cor de marca): participante coroinha, badge de
    status "Próxima semana", celebrações especiais no calendário/busca
- **Sistema de tokens** em `css/main.css` (`:root`) para espaçamento, tipografia,
  cor, raio de borda, sombra e z-index — novas regras de CSS devem usar os
  tokens existentes em vez de valores soltos. Para cor, prefira o token
  **semântico** (`--accent-brand*` para cromo de marca, `--accent-purple*`
  para os papéis específicos acima) em vez do valor bruto
- **Totalmente responsivo** para mobile, tablet e desktop
- **Animações suaves**, respeitando `prefers-reduced-motion`

---

## 🗓 Missas Configuradas

| Dia | Horário | ID |
|-----|---------|-----|
| Sábado | 17h00 | `sab-17` |
| Domingo | 08h00 | `dom-08` |
| Domingo | 10h00 | `dom-10` |
| Domingo | 19h00 | `dom-19` |

---

## 📝 Notas Técnicas

- **Sem backend** — tudo roda no navegador
- **Sem banco de dados** — dados em arquivos JSON
- **Sem frameworks/bundler** — HTML, CSS e JavaScript puro, usando ES Modules
  nativos do browser (`<script type="module">` + `import`/`export`)
- **PWA** com service worker (`sw.js`): cache-first para assets estáticos,
  network-first para os dados em `data/*.json`
- Os arquivos JSON precisam ser editados manualmente para cadastrar
  participantes — rode `node scripts/validar-dados.js` depois de editar
- As escalas são geradas na memória e exibidas dinamicamente (não são salvas
  automaticamente) — para persistir escalas geradas, seria necessário um
  backend ou localStorage

---

*Desenvolvido com ♥ para facilitar a missão dos acólitos e coroinhas.*
