# ALFRED — Agent OS — Full Specification Blueprint

> **Version:** 2.0  
> **Date:** 2026-05-12  
> **Auteur:** AutoClaw (Alfred)  
> **Base:** VOANH AI v3.0 (refactor complet)  
> **Paradigme:** Single-file distribué en modules ES — zero build step, zero breaking change fonctionnel

---

## 1. Architecture Technique Globale

### 1.1 Paradigme Architectural

**SPA modulaire sans framework** — V1 est un `index.html` monolithique. V2 conserve ce paradigme (zero build, déploiement par copie) mais refactor en modules ES6 natifs via `<script type="module">`.

**Justification :**
- V1 fonctionne sans bundler, sans npm, sans serveur — c'est un atout pour la distribution
- Les ES modules natifs permettent la séparation sans build step
- `importmap` standardise les imports internes
- Compatible avec le déploiement statique actuel (Netlify, GitHub Pages, file://)

### 1.2 Couches

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │ TabEngine│ │ ChatView │ │ AgentUI  │ │ MemoryUI  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
│       │             │            │              │       │
│  ┌────┴─────────────┴────────────┴──────────────┴────┐  │
│  │              UIEventBus (pub/sub intra-fenêtre)    │  │
│  └────────────────────────┬──────────────────────────┘  │
├───────────────────────────┼─────────────────────────────┤
│                    LOGIQUE MÉTIER                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │AgentMan  │ │ChatMan   │ │Orchestr  │ │MemoryMan  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌─────┴─────┐ │
│  │TaskEngine│ │FilePipe  │ │SearchEng │ │CmdPalette │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘ │
├───────────────────────────┼─────────────────────────────┤
│                    PERSISTANCE                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              AlfredDB (IndexedDB abstraction)     │   │
│  │  stores: tabs, chats, agents, memories, tasks,   │   │
│  │         files, settings, command_history           │   │
│  └──────────────────────────────────────────────────┘   │
├───────────────────────────┼─────────────────────────────┤
│                    INFRASTRUCTURE                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │APIBridge │ │ EventBus │ │Logger    │ │Settings   │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Module System (ES Modules)

```html
<!-- index.html — point d'entrée minimal -->
<script type="importmap">
{
  "imports": {
    "@alfred/": "./modules/"
  }
}
</script>
<script type="module" src="./modules/app.js"></script>
```

Chaque module exporte une interface propre. Aucun globals sauf les CSS custom properties et le `window.Alfred` bootstrap.

### 1.4 Communication Inter-Modules

**EventBus** central — pattern pub/sub avec typed events :

```js
// Types d'événements (enum)
const EVT = {
  TAB_CREATED: 'tab:created',
  TAB_CLOSED: 'tab:closed',
  TAB_SWITCHED: 'tab:switched',
  TAB_UPDATED: 'tab:updated',
  AGENT_CREATED: 'agent:created',
  AGENT_DELETED: 'agent:deleted',
  AGENT_UPDATED: 'agent:updated',
  AGENT_INVOKED: 'agent:invoked',
  CHAT_MESSAGE: 'chat:message',
  CHAT_STREAMING: 'chat:streaming',
  CHAT_ERROR: 'chat:error',
  MEMORY_ADDED: 'memory:added',
  MEMORY_DELETED: 'memory:deleted',
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_COMPLETED: 'task:completed',
  FILE_UPLOADED: 'file:uploaded',
  FILE_PARSED: 'file:parsed',
  SETTINGS_CHANGED: 'settings:changed',
  ORCHESTRATOR_ACTION: 'orchestrator:action',
  COMMAND_EXECUTED: 'command:executed',
};
```

### 1.5 Compatibilité Ascendante

| Feature V1 | Traitement V2 |
|---|---|
| IndexedDB `VOANH_AI_DB` v3 | Migration automatique → `AlfredDB` v4, données préservées |
| Cookie `mistral_api_key` | Conservé, fallback localStorage (même logique) |
| Stores `chats`, `agents`, `settings`, `global_memory` | Préfixes conservés, nouveaux stores ajoutés |
| Modèle single-chat | Premier onglet restauré automatiquement |
| Agent schema existant | Extensible, champ `version` ajouté pour compat |
| API Mistral direct | Wrappé dans `APIBridge` (ajout d'autres providers sans toucher V1) |

**Migration script** (dans `db-migrate.js`) :
1. Ouvre `VOANH_AI_DB`
2. Lit tous les stores V1
3. Écrit dans `AlfredDB` avec mapping de schéma
4. Ne supprime pas l'ancienne DB (sécurité)
5. Set un flag `settings.migrated_v2 = true`

---

## 2. Arborescence Complète du Projet

```
alfred/
├── index.html                          # Point d'entrée HTML minimal
├── manifest.json                       # PWA manifest (future)
│
├── modules/                            # ⬅ REFACTOR CIBLE
│   ├── app.js                          # Bootstrap, init orchestrator
│   │
│   ├── core/                           # Infrastructure
│   │   ├── event-bus.js                # EventBus typed pub/sub
│   │   ├── logger.js                   # Structured console logger
│   │   ├── db.js                       # IndexedDB abstraction layer
│   │   ├── db-migrate.js               # V1 → V2 migration
│   │   ├── settings.js                 # Settings manager (persisted)
│   │   └── api-bridge.js               # Multi-provider API abstraction
│   │
│   ├── agents/                         # Agent system
│   │   ├── agent-manager.js            # CRUD, lifecycle, isolation
│   │   ├── agent-schema.js             # JSON schema validation
│   │   ├── agent-runner.js             # Execution context per agent
│   │   ├── orchestrator.js             # Chef d'orchestre (plan → execute)
│   │   └── agent-prompt-builder.js     # System prompt construction
│   │
│   ├── chat/                           # Conversation engine
│   │   ├── chat-manager.js             # Message history, context window
│   │   ├── chat-stream.js              # SSE/streaming response handler
│   │   ├── chat-renderer.js            # DOM rendering, markdown-lite
│   │   └── chat-actions.js             # Copy, export .md, export .txt, rating
│   │
│   ├── tabs/                           # Multi-tab system
│   │   ├── tab-engine.js               # Tab CRUD, state isolation, session restore
│   │   ├── tab-renderer.js             # Tab bar DOM
│   │   └── tab-keybindings.js          # Ctrl+N, Ctrl+W, Ctrl+Tab, etc.
│   │
│   ├── memory/                         # Document memory
│   │   ├── memory-manager.js           # CRUD, versioning léger
│   │   ├── memory-index.js             # Full-text search (Lunr-style homemade)
│   │   └── memory-filters.js           # Tag, type, date, owner, confidence
│   │
│   ├── files/                          # File pipeline
│   │   ├── file-upload.js              # Drag-and-drop, file input, validation
│   │   ├── file-parser.js              # PDF, DOCX, TXT, CSV, JSON parsing
│   │   ├── file-segmenter.js           # Chunking strategy (token-aware)
│   │   └── file-summarizer.js          # AI-powered summarization → memory injection
│   │
│   ├── tasks/                          # Task graph / workspace
│   │   ├── task-engine.js              # Task lifecycle (pending/running/done/failed)
│   │   ├── task-kanban.js              # Kanban board renderer
│   │   ├── task-graph.js               # DAG visualization (dependency graph)
│   │   └── task-sync.js                # Agent ↔ Task synchronization
│   │
│   ├── commands/                       # Command palette
│   │   ├── command-palette.js          # Ctrl+K, fuzzy search, UI
│   │   ├── command-registry.js         # Extensible command registration
│   │   └── builtin-commands.js         # Built-in commands
│   │
│   └── ui/                             # Shared UI components
│       ├── modal.js                    # Modal factory
│       ├── toast.js                    # Toast notification system
│       ├── dropdown.js                 # @agent mention dropdown
│       ├── progress.js                 # Progress bar/spinner for long ops
│       ├── keyboard.js                 # Global keyboard shortcut manager
│       └── theme-engine.js             # Theme switcher + custom themes
│
├── themes/                             # CSS theme files
│   ├── cyber.css                       # V1 cyber theme (preserved)
│   ├── midnight.css                    # V1 midnight theme (preserved)
│   ├── light.css                       # V1 light theme (preserved)
│   └── custom-theme-template.css       # Template for user themes
│
├── assets/                             # Static assets
│   ├── fonts/                          # Orbitron, Share Tech Mono, Exo 2
│   └── icons/                          # SVG icons (inline-ready)
│
├── docs/
│   ├── SPECIFICATION.md                # This file
│   ├── ARCHITECTURE.md                 # Detailed architecture decisions
│   └── CHANGELOG.md                    # Version history
│
├── tests/                              # Manual test matrix (no framework)
│   └── test-checklist.md
│
└── dist/                               # Build-free — just copy this folder
    └── ...                             # (mirror of root, gitignored for dev)
```

**Justification du découpage :**
- Chaque dossier = domaine fonctionnel isolé
- Les modules dans un domaine partagent un contexte conceptuel
- Aucune dépendance circulaire (top → bottom : `ui` → `chat` → `agents` → `core`)
- `core/` est le seul dossier sans dépendances internes
- `app.js` est l'orchestrateur d'initialisation (initialise core, puis domaines, puis UI)

---

## 3. Design System Complet

### 3.1 Principes

Le V1 possède un design system cyber/2advanced fort et distinctif. **Il est conservé et étendu**, pas remplacé. Les thèmes V1 (cyber, midnight, light) sont migrés en fichiers CSS séparés.

### 3.2 Token System (CSS Custom Properties)

```css
/* === BASE TOKENS === */
:root {
  /* Surface (6 levels, darkest → lightest) */
  --surface-0: #020509;   /* void */
  --surface-1: #050d18;   /* deep */
  --surface-2: #091525;   /* hull */
  --surface-3: #0d1e33;   /* plate */
  --surface-4: #122540;   /* grid */
  --surface-5: #1a3455;   /* wire */

  /* Accent */
  --accent-primary: #00e5ff;
  --accent-secondary: #00ff9d;
  --accent-tertiary: #ff6b35;
  --accent-quaternary: #7c3aed;

  /* Semantic */
  --color-danger: #ff3366;
  --color-warning: #f59e0b;
  --color-success: #00ff9d;
  --color-info: #00e5ff;

  /* Text */
  --text-primary: #b8d4f0;
  --text-bright: #e8f4ff;
  --text-dim: #4a6b8a;
  --text-code: #00e5ff;

  /* Typography */
  --font-display: 'Orbitron', monospace;
  --font-mono: 'Share Tech Mono', monospace;
  --font-body: 'Exo 2', sans-serif;

  /* Spacing (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Radius */
  --radius-sm: 3px;
  --radius-md: 6px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Border */
  --border-default: 1px solid var(--surface-5);
  --border-accent: 1px solid rgba(0, 229, 255, 0.3);
  --border-subtle: 1px solid var(--surface-4);

  /* Shadow */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.7);
  --shadow-glow: 0 0 15px var(--accent-primary-dim);

  /* Motion */
  --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* === DENSITY TOKENS === */
[data-density="compact"] {
  --space-1: 2px; --space-2: 4px; --space-3: 8px; --space-4: 12px;
  --msg-padding: 8px 12px; --msg-font-size: 13px;
}
[data-density="normal"] {
  --msg-padding: 14px 18px; --msg-font-size: 14px;
}
[data-density="spacious"] {
  --space-2: 12px; --space-3: 16px; --space-4: 24px;
  --msg-padding: 18px 24px; --msg-font-size: 15px;
}
```

### 3.3 Component Library

#### 3.3.1 Tab Bar

```
┌─ [×] Conversation 1  │  [×] Conversation 2  │  [×] Research  │  [+]  ──────────────────────────────────────┐
       ^ active (cyan underline)                        ^ ghost "+" button
```

- Tab width: `min-content` + `max-width: 180px`, `text-overflow: ellipsis`
- Active tab: `border-bottom: 2px solid var(--accent-primary)`, background `surface-2`
- Close button: visible on hover, `×` icon
- Ctrl+N: new tab
- Ctrl+W: close active tab
- Ctrl+Tab / Ctrl+Shift+Tab: cycle tabs
- Tab reorder: drag-and-drop (native HTML drag API)
- Max tabs: configurable (default 20), hard cap 50 (memory guard)
- Middle-click tab: close

#### 3.3.2 Chat Message

```
┌─────────────────────────────────────────────┐
│ ▸ AGENT_NAME                    14:23:05    │
│ ─────────────────────────────────────────── │
│ Response content with markdown-lite support │
│                                             │
│ [⬡ MEM×2]                                   │
│ ─────────────────────────────────────────── │
│ ⎘ COPIER  ⬡ MÉMO  ⬇ .MD  ⬇ .TXT  🖨 PDF  │
│ ★★★★☆ QUALITÉ                               │
└─────────────────────────────────────────────┘
```

- Pliable: click on message header to collapse body
- Max width: configurable (default 82%)
- File attachments rendered inline (image preview, file card for PDFs)

#### 3.3.3 @ Agent Mention Dropdown

```
┌─────────────────────────────┐
│ 🔍 Rechercher un agent...   │
│─────────────────────────────│
│  ◈ CodeForge    code       │
│  ◈ ResearchBot  research   │
│  ◈ WriterPro    writing    │
└─────────────────────────────┘
```

- Triggered by `@` in prompt
- Fuzzy search across name, tags, desc
- Keyboard navigation (↑↓ Enter)
- Insert agent mention token on select
- Shows agent avatar/emoji + name + primary tag

#### 3.3.4 Command Palette (Ctrl+K)

```
┌─────────────────────────────────────────────┐
│ ◈  Recherche de commande ou agent...       │
│─────────────────────────────────────────────│
│  > Nouvelle conversation     Ctrl+N        │
│  > Ouvrir la mémoire          Ctrl+M        │
│  > Paramètres                 Ctrl+,        │
│  > Basculer le thème                       │
│  > Exporter la conversation                 │
│  ─────────────────────────────────────────  │
│  @ CodeForge                               │
│  @ ResearchBot                             │
│  ─────────────────────────────────────────  │
│  # Télécharger en PDF                      │
│  # Vider le cache                          │
└─────────────────────────────────────────────┘
```

#### 3.3.5 Task Graph / Kanban

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  PENDING     │  │  RUNNING     │  │  DONE        │  │  FAILED      │
│──────────────│  │──────────────│  │──────────────│  │──────────────│
│ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │  │              │
│ │ Task A   │ │  │ │ Task B   │ │  │ │ Task D   │ │  │  (empty)     │
│ │ Agent:CF │ │  │ │ Agent:RB │ │  │ │ Agent:CF │ │  │              │
│ │ ↺  Retry │ │  │ │ ⟳ 60%   │ │  │ │ ✓ Done   │ │  │              │
│ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

- Columns: Pending → Running → Done → Failed
- Cards show: task name, assigned agent, progress, actions (retry, cancel)
- Drag between columns
- Side panel: DAG dependency graph (optional view)

#### 3.3.6 Settings Panel

```
┌─────────────────────────────────────────────┐
│ ⚙ PARAMÈTRES                               │
│─────────────────────────────────────────────│
│                                             │
│ AFFICHAGE                                   │
│  Densité:    [Compact] [Normal] [Spacious]  │
│  Largeur messages:  [────●────] 82%         │
│  Taille police:  [────●────] 14px           │
│  Mode focus:    [toggle]                    │
│  Raisonnement:  [toggle] afficher/cacher    │
│  Avatar agent:  [emoji] [label] [aucun]     │
│                                             │
│ THÈME                                      │
│  [◈ Cyber] [◈ Midnight] [◈ Light] [○ Custom]│
│                                             │
│ NAVIGATION                                  │
│  Persistance onglets: [toggle]              │
│  Raccourcis: [⌘K: commande] [⌘N: nouveau]  │
│                                             │
│ INDICATEURS                                 │
│  Contexte actif: [toggle]                   │
│  Suggestions: [toggle]                      │
│  Feedback longues opérations: [toggle]      │
│                                             │
│ AVANCÉ                                      │
│  Exporter les paramètres                    │
│  Importer des paramètres                    │
│  Réinitialiser                              │
└─────────────────────────────────────────────┘
```

### 3.4 Responsive Breakpoints

| Breakpoint | Cible |
|---|---|
| `> 1024px` | Desktop complet — sidebar + tabs + chat + panels |
| `769-1024px` | Tablet — tabs condensés, panels overlay |
| `≤ 768px` | Mobile — burger menu, single column, bottom sheet modals |

### 3.5 Animation Guidelines

- **Entrée** : `transition-spring` (scale 0.97 → 1, translateY 12px → 0)
- **Sortie** : `opacity 0.15s`, pas d'animation de sortie complexe (performance)
- **Loading** : spin-ring (CSS-only), pas de JS animation
- **Feedback** : `transition-base` sur hover/focus, glow effect sur interactive elements
- **Respect** : `prefers-reduced-motion: reduce` → désactive toutes les animations

---

## 4. Spécification Fonctionnelle par Module

### 4.1 TabEngine (`modules/tabs/`)

#### Fonctionnalités

| Feature | Spec |
|---|---|
| Création | `Ctrl+N` ou bouton `+` → nouvel onglet avec chat vide + agent par défaut |
| Fermeture | `Ctrl+W` ou bouton `×` ou middle-click. Si dernier onglet → en créer un nouveau (jamais vide) |
| Switch | `Ctrl+Tab` (next), `Ctrl+Shift+Tab` (prev), click on tab |
| Reorder | Native HTML5 drag-and-drop sur les tabs |
| Persistance | Tous les tabs sauvés dans IndexedDB → restaurés au reload |
| Limite mémoire | Max 20 tabs actifs (configurable), hard cap 50. Au-delà: archivage automatique du moins récent |
| Titre dynamique | Auto-titré à partir du premier message utilisateur (tronqué à 30 chars) |
| Renommage | Double-click sur tab → inline edit |
| Pinning | Right-click → Pin/Unpin (pinned tabs ne peuvent pas être fermés par accident) |

#### Isolation d'État

Chaque tab possède un état isolé :
```js
TabState = {
  id: string,               // UUID
  title: string,
  agentId: string | null,   // Agent actif pour ce tab
  model: string,            // Modèle actif pour ce tab
  messages: Message[],      // Historique propre
  memoryFilter: string[],   // Filtres mémoire actifs
  pinned: boolean,
  createdAt: timestamp,
  updatedAt: timestamp,
  order: number             // Position dans la barre
}
```

#### Anti-nouvelle-fenêtre

```js
// Interception de tout lien/ouverture qui tenterait window.open
window.open = () => {
  toast('Alfred fonctionne en onglets. Utilisez Ctrl+N pour une nouvelle conversation.', 'info');
  return null;
};
```

#### Restauration de Session

Au chargement :
1. Lire `tabs` store dans IndexedDB
2. Trier par `order`
3. Restituer chaque tab avec son `TabState`
4. Activer le tab qui était actif au dernier `updated`

### 4.2 ChatView (`modules/chat/`)

#### Prompt Composer Auto-Grow

```css
#user-input {
  min-height: 46px;
  max-height: 160px;
  resize: none;
  field-sizing: content;  /* CSS-native auto-grow (2025+) */
  /* Fallback JS: observer sur input event */
}
```

- `@` trigger → Agent mention dropdown
- `Shift+Enter` → newline
- `Enter` → send
- `Ctrl+Enter` → send (alternative)
- Placeholder contextuel : dépend de l'agent actif

#### Suggestions Agent

Dans le prompt composer, afficher des chips contextuels :
- Basées sur les tags de l'agent actif
- Dernières questions fréquentes
- Agents disponibles (si aucun agent actif)

#### Réponses Pliables

Chaque message assistant possède un header cliquable. Click → toggle `max-height: 0` / `max-height: 5000px` avec `transition-slow`. État persisté dans `TabState.collapsedMessages: Set<id>`.

#### Actions Message

| Action | Implementation |
|---|---|
| Copier | `navigator.clipboard.writeText(content)` + fallback `execCommand('copy')` |
| Export .md | `new Blob([markdownContent])` → download link |
| Export .txt | `new Blob([plainText])` → download link |
| Export PDF | `window.print()` avec `@media print` stylesheet |
| Sauver en mémoire | Inject dans `global_memory` via `MemoryManager.add()` |
| Rating | 1-5 étoiles, persisté dans `Message.rating` |

### 4.3 AgentManager (`modules/agents/`)

#### Schema Agent (V2)

```typescript
Agent = {
  id: string,                    // UUID
  version: 2,                    // Schema version pour migration
  name: string,                  // Nom court, unique (validation à la création)
  role: string,                  // Rôle & domaine d'expertise
  desc: string,                  // Description courte (max 100 chars)
  instructions: string,          // Instructions comportementales détaillées
  primer: string,                // Phrase d'amorce / contexte initial
  tags: string[],                // Tags mémoire et filtre
  style: 'concis' | 'detaille' | 'formel' | 'creatif' | 'pedagogique' | '',
  temperature: number,           // 0-2, step 0.05
  maxTokens: number,             // 256-16000
  modelPref: string,             // Modèle préféré (ID)
  forbidden: string,             // Instructions interdites
  memPrio: 1-5,                  // Priorité mémoire (1=ignore, 5=max)
  
  // V2 — Nouveaux champs
  avatar: string,                // Emoji ou URL
  color: string,                 // Couleur d'accent (#hex)
  systemPromptTemplate: string,  // Template Jinja-lite pour le system prompt
  tools: string[],               // IDs des outils autorisés (future plugin system)
  isOrchestrator: boolean,       // Flag: peut créer/déléguer à d'autres agents
  parentAgentId: string | null,  // Si créé par un orchestrateur
  lifecycle: 'active' | 'archived' | 'draft',
  createdAt: timestamp,
  updatedAt: timestamp,
  usageCount: number,            // Nombre de fois utilisé
  avgRating: number,             // Moyenne des ratings de ses réponses
}
```

#### Cycle de Vie

```
[Draft] → [Active] → [Archived]
   ↑         │
   └─────────┘ (reactivate)
```

- **Draft** : créé manuellement, pas encore utilisé
- **Active** : utilisé au moins une fois dans une conversation
- **Archived** : masqué des sélections, données préservées

#### Isolation Stricte

Chaque agent :
- Possède son propre `systemPrompt` construit dynamiquement
- Ne peut pas accéder aux messages d'un autre agent
- Partage uniquement la `global_memory` (filtrée par `memPrio` et `tags`)
- Son historique est lié au `TabState` dans lequel il est actif

#### Validation

```js
const AGENT_CONSTRAINTS = {
  name: { min: 2, max: 30, pattern: /^[a-zA-Z0-9À-ÿ\s\-_]+$/, unique: true },
  role: { min: 10, max: 500 },
  instructions: { max: 5000 },
  temperature: { min: 0, max: 2 },
  maxTokens: { min: 256, max: 16000 },
  tags: { max: 10, each: { max: 20 } },
};
```

#### CRUD Operations

| Operation | Validation | Side Effects |
|---|---|---|
| Create | Schema validation + name uniqueness | Emit `AGENT_CREATED`, update agent select |
| Update | Schema validation (name uniqueness si changé) | Emit `AGENT_UPDATED`, refresh active tabs using this agent |
| Delete | Confirm dialog, vérifier si utilisé dans un tab actif | Emit `AGENT_DELETED`, désassigner des tabs |
| Duplicate | Pre-fill form avec `(copie)` suffix | Même que create |
| Export | Sérialize en JSON | Download `.agent.json` |
| Import | Validate schema, assign new UUID | Same as create |

### 4.4 Orchestrator (`modules/agents/orchestrator.js`)

#### Responsabilité

L'orchestrateur est un agent spécial (`isOrchestrator: true`) qui :
1. Reçoit une tâche de l'utilisateur
2. La décompose en sous-tâches
3. Crée ou sélectionne des agents pour chaque sous-tâche
4. Délègue et collecte les résultats
5. Synthétise une réponse finale

#### JSON Caché Parsing

L'orchestrateur produit parfois un JSON dans sa réponse qu'Alfred doit intercepter :

```json
{
  "action": "create_agent",
  "name": "DataAnalyst",
  "role": "Analyste de données senior",
  "instructions": "Tu analyses les datasets avec rigueur...",
  "tags": ["data", "analysis", "python"]
}
```

**Parser** (`orchestrator.js`) :
```js
function parseOrchestratorAction(text) {
  // 1. Chercher des blocs JSON dans la réponse
  // 2. Valider le schéma de l'action
  // 3. Retourner { actions: Action[], cleanText: string }
}

const ACTION_SCHEMAS = {
  create_agent: {
    required: ['name', 'role', 'instructions'],
    optional: ['tags', 'temperature', 'style', 'modelPref'],
    validate: (data) => {
      // Validate against AGENT_CONSTRAINTS
      // Check name collision → auto-suffix if needed
      // Sanitize instructions (no prompt injection)
    },
    execute: async (data) => {
      // Create agent via AgentManager
      // Emit AGENT_CREATED
      // Return feedback to user
    }
  },
  delegate_task: {
    required: ['agent_id', 'task'],
    optional: ['context'],
    validate: (data) => { /* check agent exists */ },
    execute: async (data) => { /* create task, assign to agent */ }
  },
  // Future actions extensible
};
```

#### Gestion d'Erreurs

| Scénario | Traitement |
|---|---|
| JSON corrompu | Log l'erreur, afficher le texte brut, ne pas crasher |
| Action inconnue | Ignorer, log, toast info à l'utilisateur |
| Collision de noms | Auto-suffix: `DataAnalyst` → `DataAnalyst-2` |
| Validation échouée | Afficher les erreurs de validation dans un toast + feedback inline |
| Hallucination (prompt injection dans le JSON) | Sanitize tous les string fields, limiter la taille, rejeter les instructions qui contiennent des commandes systèmes |
| Agent cible introuvable | Toast erreur + proposer de créer l'agent |

#### Rollback

Chaque action orchestrateur est wrappée dans une transaction :
```js
async function executeOrchestratorAction(action) {
  const snapshot = await captureState(); // snapshot agents + tasks avant action
  try {
    const result = await ACTION_SCHEMAS[action.type].execute(action.data);
    return { success: true, result };
  } catch (err) {
    await restoreState(snapshot); // rollback
    return { success: false, error: err.message };
  }
}
```

### 4.5 MemoryManager (`modules/memory/`)

#### Schema Memory Entry

```typescript
MemoryEntry = {
  id: string,                    // UUID
  content: string,               // Contenu textuel (max 5000 chars)
  source: 'manual' | 'file' | 'conversation' | 'agent',
  date: timestamp,
  type: 'fact' | 'preference' | 'instruction' | 'document' | 'summary',
  owner: string,                 // Agent ID ou 'global'
  confidence: 0-1,               // 0=user input, 0.5=inferred, 1=confirmed
  tags: string[],
  status: 'active' | 'archived' | 'deprecated',
  
  // Versioning léger
  version: number,
  previousVersion: string | null, // ID de la version précédente
  
  // Metadata
  createdAt: timestamp,
  updatedAt: timestamp,
  accessCount: number,
  lastAccessed: timestamp,
}
```

#### Indexation & Recherche

**Approche :** Inverted index maison (pas de dépendance externe).

```js
class MemoryIndex {
  constructor() {
    this.index = new Map(); // token → Set<MemoryEntry.id>
  }
  
  indexEntry(entry) {
    const tokens = this.tokenize(entry.content + ' ' + entry.tags.join(' '));
    for (const token of tokens) {
      if (!this.index.has(token)) this.index.set(token, new Set());
      this.index.get(token).add(entry.id);
    }
  }
  
  search(query, filters = {}) {
    const queryTokens = this.tokenize(query);
    const scores = new Map();
    for (const token of queryTokens) {
      const entryIds = this.index.get(token);
      if (!entryIds) continue;
      for (const id of entryIds) {
        scores.set(id, (scores.get(id) || 0) + 1);
      }
    }
    // Apply filters (type, tag, owner, status)
    // Sort by score desc, return top N
  }
  
  tokenize(text) {
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .split(/[\s,;.!?()]+/)
      .filter(t => t.length > 2); // skip short tokens
  }
}
```

Le `MemoryIndex` est reconstruit au démarrage depuis le store `memories`. Index persisté dans `settings.memory_index` pour accélérer les cold starts.

#### Filtres

| Filtre | Type | Exemples |
|---|---|---|
| tag | string[] | `["code", "research"]` |
| type | string[] | `["fact", "preference"]` |
| owner | string | Agent ID ou `"global"` |
| status | string | `"active"`, `"archived"` |
| date | range | `{ from: timestamp, to: timestamp }` |
| confidence | range | `{ min: 0.5, max: 1 }` |
| search | string | Full-text search via MemoryIndex |

#### Versioning

- Chaque modification d'une entrée crée une nouvelle version
- `version` est incrémenté
- `previousVersion` pointe vers l'ancien ID
- Historique accessible via la UI (timeline)

### 4.6 FilePipeline (`modules/files/`)

#### Pipeline Complet

```
[Upload] → [Validation] → [Parsing] → [Segmentation] → [Summarization] → [Memory Injection]
   │           │             │             │                  │                  │
   │           │             │             │                  │              MemoryManager.add()
   │           │             │             │                  │
   │           │           PDF.js        chunkSplit()     APIBridge.chat()
   │           │           Mammoth.js    (token-aware)    (summarize prompt)
   │           │
   │         size, type, 
   │         malware check (heuristic)
   │
 drag-and-drop, 
 file input, @file mention
```

#### Upload (`file-upload.js`)

- **Drag-and-drop** : zone sur le chat container + input file classique
- **Multi-fichier** : support batch upload
- **Validation** :
  - Max file size: 50MB (configurable)
  - Accepted types: `.pdf`, `.docx`, `.txt`, `.csv`, `.json`, `.md`, images (`.png`, `.jpg`, `.gif`, `.webp`)
  - Filename sanitization
- **Progression UI** : progress bar + pourcentage + filename
- **Retry** : bouton retry sur échec, max 3 tentatives
- **Fallback** : si le parsing échoue, raw text extraction → memory injection directe

#### Parsing (`file-parser.js`)

```js
const PARSER_REGISTRY = {
  'application/pdf': parsePDF,    // PDF.js (CDN)
  'text/plain': parseText,
  'text/csv': parseCSV,
  'application/json': parseJSON,
  'text/markdown': parseMarkdown,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseDOCX, // Mammoth.js (CDN)
  'image/*': parseImage,          // EXIF metadata + description
};

async function parseFile(file) {
  const parser = findParser(file.type);
  if (!parser) throw new Error(`Format non supporté: ${file.type}`);
  return await parser(file);
}
```

#### Segmentation (`file-segmenter.js`)

```js
function segmentText(text, options = {}) {
  const {
    maxChunkTokens = 500,       // ~1500 chars en français
    overlapTokens = 50,         // overlap pour contexte
    separator = /\n\n+|\n/,     // priorité paragraphes puis lignes
  } = options;
  
  // 1. Split par séparateurs naturels
  // 2. Si un chunk dépasse maxChunkTokens, split par phrases
  // 3. Si une phrase dépasse, split par mots avec overlap
  // 4. Retourner Chunk[] avec metadata (index, startOffset, tokenCount)
}
```

#### Summarization (`file-summarizer.js`)

- Utilise l'API configurée (Mistral) pour résumer chaque chunk
- Prompt template : `"Résume ce texte en français. Maximum 200 mots. Conserve les faits clés, les chiffres et les noms propres:\n\n{chunk}"`
- Les résumés sont injectés dans la mémoire via `MemoryManager.add()` avec `type: 'document'`, `source: 'file'`, `confidence: 0.5`
- Coût API : ~100-500 tokens par chunk de 500 tokens → coût négligeable sur free tier

### 4.7 TaskEngine (`modules/tasks/`)

#### Schema Task

```typescript
Task = {
  id: string,
  title: string,
  description: string,
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled',
  agentId: string | null,
  tabId: string | null,
  
  // Dependencies
  dependencies: string[],       // Task IDs that must complete first
  dependsOn: string[],          // Alias
  
  // Progress
  progress: 0-100,
  result: string | null,
  error: string | null,
  
  // Timing
  createdAt: timestamp,
  startedAt: timestamp | null,
  completedAt: timestamp | null,
  retryCount: number,
  maxRetries: number,
  
  // Metadata
  priority: 'low' | 'normal' | 'high' | 'critical',
  tags: string[],
}
```

#### Kanban Board

- 4 colonnes : Pending, Running, Done, Failed
- Drag-and-drop entre colonnes (changements de statut)
- Cards affichent : titre, agent assigné, progress bar, priorité badge
- Actions par card : retry, cancel, view details, delete

#### Task Graph (DAG)

- Vue optionnelle : graphe de dépendances
- Rendu via SVG inline (pas de lib externe)
- Nœuds = tasks, arêtes = dépendances
- Coloration par statut
- Clic sur nœud → focus sur la task dans le kanban

#### Sync Agent ↔ Task

Quand un agent travaille sur une tâche :
1. `TaskEngine` crée la task → `status: 'running'`
2. L'agent (via `ChatManager`) envoie sa réponse
3. `TaskEngine` reçoit la réponse → `status: 'done'`, `progress: 100`
4. Si erreur → `status: 'failed'`, bouton retry disponible
5. Si une task a des dépendances non terminées → reste en `pending`

### 4.8 CommandPalette (`modules/commands/`)

#### Invocation

`Ctrl+K` → ouvre la palette. Fuzzy search en temps réel.

#### Command Registry

```js
const commandRegistry = {
  // Built-in commands
  'new-tab': { label: 'Nouvelle conversation', shortcut: 'Ctrl+N', icon: '+', action: () => TabEngine.create() },
  'close-tab': { label: 'Fermer l\'onglet', shortcut: 'Ctrl+W', icon: '×', action: () => TabEngine.closeActive() },
  'open-memory': { label: 'Ouvrir la mémoire', shortcut: 'Ctrl+M', icon: '⬡', action: () => UI.openMemoryPanel() },
  'open-settings': { label: 'Paramètres', shortcut: 'Ctrl+,', icon: '⚙', action: () => UI.openSettings() },
  'open-tasks': { label: 'Task graph', shortcut: 'Ctrl+T', icon: '▸', action: () => UI.openTaskGraph() },
  'toggle-theme': { label: 'Basculer le thème', icon: '◈', action: () => ThemeEngine.cycle() },
  'export-chat': { label: 'Exporter la conversation', icon: '⬇', action: () => ChatActions.exportCurrent() },
  'clear-chat': { label: 'Vider la conversation', icon: '⌫', action: () => ChatManager.clear() },
  'focus-mode': { label: 'Mode focus', shortcut: 'Ctrl+Shift+F', icon: '◉', action: () => Settings.toggle('focusMode') },
  
  // Agent commands (dynamiques)
  // '@agent-name': invoke agent in current tab
  
  // Plugin-ready: external commands registered via commandRegistry.register()
};
```

#### Fuzzy Search

```js
function fuzzyMatch(query, target) {
  // Simple scoring: 
  // - exact match = 100
  // - starts with = 80
  // - contains = 60
  // - each consecutive char match = +10
  // Sort by score desc, return top 10
}
```

#### Plugin Architecture

Les plugins (future) peuvent enregistrer des commandes :
```js
import { commandRegistry } from '@alfred/commands/command-registry.js';
commandRegistry.register('my-plugin:action', {
  label: 'Mon Action',
  category: 'plugin',
  action: () => { /* ... */ }
});
```

### 4.9 Settings (`modules/core/settings.js`)

#### Schema Settings

```typescript
Settings = {
  // Affichage
  density: 'compact' | 'normal' | 'spacious',       // default: 'normal'
  messageMaxWidth: number,                           // default: 82 (%)
  fontSize: number,                                   // default: 14 (px)
  focusMode: boolean,                                 // default: false
  showReasoning: boolean,                             // default: false
  agentDisplay: 'avatar' | 'label' | 'both' | 'none', // default: 'both'
  
  // Thème
  theme: 'cyber' | 'midnight' | 'light' | string,    // default: 'cyber'
  customTheme: object | null,                         // CSS override object
  
  // Navigation
  persistTabs: boolean,                               // default: true
  maxTabs: number,                                    // default: 20
  
  // Clavier
  shortcuts: Record<string, string>,                  // override des raccourcis
  
  // Indicateurs
  showContextIndicator: boolean,                      // default: true
  showSuggestions: boolean,                           // default: true
  showLongOpFeedback: boolean,                        // default: true
  
  // Persisté dans IndexedDB store 'settings'
}
```

#### Persistence UI State

Tous les paramètres UI sont persistés dans `settings`. Au rechargement :
1. Lire `settings` store
2. Appliquer les tokens CSS correspondants
3. Restaurer les états UI (panels ouverts/fermés, theme, density)

#### Shortcuts Personnalisables

Interface de remapping dans Settings :
```
Raccourcis personnalisés:
  ⌘K  Commande        [modifier]
  ⌘N  Nouveau tab     [modifier]
  ⌘W  Fermer tab      [modifier]
  ⌘M  Mémoire         [modifier]
  ⌘,  Paramètres      [modifier]
  ⌘T  Task graph      [modifier]
```

Click sur [modifier] → capture le prochain key combo → assigne.

---

## 5. Modèle de Données Complet

### 5.1 IndexedDB Schema (`AlfredDB`)

```
Database: AlfredDB
Version: 4

Object Stores:

┌─────────────────────────────────────────────────────────────┐
│ Store: tabs                   Key: id (UUID)                │
│─────────────────────────────────────────────────────────────│
│ id, title, agentId, model, messages[], memoryFilter[],     │
│ pinned, collapsedMessages[], createdAt, updatedAt, order   │
├─────────────────────────────────────────────────────────────┤
│ Store: agents                 Key: id (UUID)                │
│─────────────────────────────────────────────────────────────│
│ V2 Agent schema complet (cf section 4.3)                  │
│ Index: name (unique)                                        │
│ Index: lifecycle                                            │
│ Index: tags (multiEntry)                                    │
├─────────────────────────────────────────────────────────────┤
│ Store: memories                Key: id (UUID)               │
│─────────────────────────────────────────────────────────────│
│ V2 MemoryEntry schema (cf section 4.5)                    │
│ Index: type                                                 │
│ Index: owner                                                │
│ Index: status                                               │
│ Index: tags (multiEntry)                                    │
├─────────────────────────────────────────────────────────────┤
│ Store: tasks                   Key: id (UUID)                │
│─────────────────────────────────────────────────────────────│
│ V2 Task schema (cf section 4.7)                           │
│ Index: status                                               │
│ Index: agentId                                              │
│ Index: priority                                             │
├─────────────────────────────────────────────────────────────┤
│ Store: files                   Key: id (UUID)                │
│─────────────────────────────────────────────────────────────│
│ id, name, type, size, data (ArrayBuffer/Blob),             │
│ parsedContent, chunks[], memoryIds[],                       │
│ uploadedAt, status ('pending'|'parsed'|'error')             │
├─────────────────────────────────────────────────────────────┤
│ Store: settings                Key: id (string)             │
│─────────────────────────────────────────────────────────────│
│ id, value (any), updatedAt                                 │
├─────────────────────────────────────────────────────────────┤
│ Store: command_history         Key: id (auto-increment)     │
│─────────────────────────────────────────────────────────────│
│ id, command, args, result, executedAt                     │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Migration V1 → V2

```js
// db-migrate.js

async function migrateV1toV2() {
  const MIGRATION_FLAG = 'migrated_v2';
  const flag = await db.get('settings', MIGRATION_FLAG);
  if (flag?.value) return; // Already migrated
  
  // 1. Try to open V1 database
  const v1db = await openDB('VOANH_AI_DB', 3);
  
  // 2. Read V1 stores
  const v1Chats = await v1db.getAll('chats');
  const v1Agents = await v1db.getAll('agents');
  const v1Memories = await v1db.getAll('global_memory');
  const v1Settings = await v1db.getAll('settings');
  
  // 3. Transform and write to V2 stores
  for (const chat of v1Chats) {
    // Create a tab from each chat
    await db.put('tabs', {
      id: chat.id,
      title: chat.title || 'Imported conversation',
      agentId: chat.agentId || null,
      model: chat.model || 'codestral-2508',
      messages: chat.messages || [],
      pinned: false,
      collapsedMessages: [],
      createdAt: chat.updated || Date.now(),
      updatedAt: chat.updated || Date.now(),
      order: 0, // Will be recalculated
    });
  }
  
  for (const agent of v1Agents) {
    // Upgrade agent schema
    await db.put('agents', {
      ...agent,
      version: 2,
      avatar: '◈',
      color: '#00e5ff',
      systemPromptTemplate: '',
      tools: [],
      isOrchestrator: false,
      parentAgentId: null,
      lifecycle: agent.created ? 'active' : 'draft',
      usageCount: 0,
      avgRating: 0,
    });
  }
  
  for (const mem of v1Memories) {
    // Upgrade memory schema
    await db.put('memories', {
      id: mem.id,
      content: mem.content,
      source: 'manual',
      date: mem.created || Date.now(),
      type: 'fact',
      owner: 'global',
      confidence: 1,
      tags: mem.tags || [],
      status: 'active',
      version: 1,
      previousVersion: null,
      createdAt: mem.created || Date.now(),
      updatedAt: mem.created || Date.now(),
      accessCount: 0,
      lastAccessed: mem.created || Date.now(),
    });
  }
  
  // 4. Copy settings
  for (const setting of v1Settings) {
    await db.put('settings', setting);
  }
  
  // 5. Set migration flag
  await db.put('settings', { id: MIGRATION_FLAG, value: true, updatedAt: Date.now() });
  
  console.log('Migration V1 → V2 completed');
}
```

### 5.3 ER Diagram (conceptual)

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│   TAB    │──1:N──│  MESSAGE │       │  AGENT   │
│          │       │          │       │          │
│ agentId──┼───────┤          │       │ id       │
│ model    │       │ role     │       │ name     │
│ messages[]       │ content  │       │ role     │
│          │       │ ts       │       │ tags[]   │
└────┬─────┘       └──────────┘       └────┬─────┘
     │                                      │
     │ 1:N                                  │ 1:N
     ▼                                      ▼
┌──────────┐                           ┌──────────┐
│   TASK   │                           │  MEMORY  │
│          │                           │          │
│ agentId──┼───(references)────────────┤ owner    │
│ tabId────┼───(references)────────────┤          │
│ status   │                           │ tags[]   │
│ deps[]   │                           │ type     │
└────┬─────┘                           └────┬─────┘
     │                                      │
     │ N:1                                  │ N:1
     ▼                                      ▼
┌──────────┐                           ┌──────────┐
│   FILE   │                           │ SETTINGS │
│          │                           │          │
│ memoryIds┼───(references)            │ key/value│
│ chunks[] │                           └──────────┘
└──────────┘
```

---

## 6. Flows Utilisateur Critiques

### 6.1 Premier Lancement

```
1. User ouvre index.html
2. DB init → migration V1 si détectée
3. Check settings.aiConfig
   ├─ Existe → skip wizard, restaurer tabs
   └─ N'existe pas → Setup Wizard
       ├─ Step 1: API Key
       ├─ Step 2: Nom IA + Objectif
       └─ Step 3: Génération agents (Mistral)
4. Tab par défaut créé
5. Welcome message affiché
```

### 6.2 Création de Conversation Multi-Agent

```
1. User: Ctrl+N → nouveau tab
2. Tab créé avec agent = null (mode libre)
3. User tape @ → dropdown agents
4. User sélectionne un agent → agent assigné au tab
5. User envoie un message
6. System prompt construit avec agent context
7. Réponse streaming → affichée
8. User peut changer d'agent mid-conversation (@mention)
```

### 6.3 Orchestration Multi-Agent

```
1. User active l'orchestrateur (agent spécial)
2. User décrit une tâche complexe
3. Orchestrateur répond avec plan + JSON actions
4. Parser détecte les JSON → extrait les actions
5. Pour chaque action:
   ├─ create_agent → créer l'agent, feedback UI
   ├─ delegate_task → créer task, assigner agent
   └─ Erreur → rollback, feedback
6. Orchestrateur synthétise les résultats
7. User voit les tâches dans le task graph
```

### 6.4 Import de Fichier avec Memory Injection

```
1. User drag-and-drop un PDF sur le chat
2. Upload: progress bar affichée
3. Validation: taille, type OK
4. Parsing: PDF.js extrait le texte
5. Segmentation: texte découpé en chunks de 500 tokens
6. Summarization: chaque chunk envoyé à Mistral pour résumé
7. Memory injection: chaque résumé → MemoryManager.add()
8. Feedback UI: "12 segments extraits, 12 mémoires créées"
9. User peut maintenant interroger sur le contenu du document
```

### 6.5 Export de Conversation

```
1. User hover sur message → actions visibles
2. Click "⬇ .MD" →:
   - Build markdown string (header + messages formatés)
   - Create Blob → download link → auto-click
   - Fichier: alfred-conversation-2026-05-12.md
3. Alternative: Click "🖨 PDF" →:
   - window.print() avec @media print stylesheet
   - Navigation/panels/input masqués, messages seuls visibles
```

### 6.6 Command Palette Workflow

```
1. User: Ctrl+K → palette s'ouvre
2. User tape "nou" → fuzzy search → "Nouvelle conversation" highlighted
3. User: Enter → nouveau tab créé
4. Palette fermée, focus sur le nouveau tab

Alternative:
1. User: Ctrl+K
2. User tape "code" → agents filtrés → "@CodeForge" visible
3. User: Enter → CodeForge activé dans le tab courant
```

---

## 7. Risques d'Implémentation

### 7.1 Risques Critiques

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Migration V1 → V2 casse les données** | Moyenne | Critique | Script idempotent, ne supprime jamais l'ancienne DB, backup automatique avant migration, rollback possible |
| R2 | **IndexedDB quota dépassé** | Faible | Critique | Monitorer `navigator.storage.estimate()`, avertissement à 80%, archivage automatique des vieux tabs/chats, compression des gros blobs |
| R3 | **Memory leak dans les tabs** | Moyenne | Haut | Limiter le nombre de messages chargés en mémoire (sliding window), garbage collect des tabs archivés, surveiller `performance.memory` |
| R4 | **JSON orchestrateur malformé → crash** | Haute | Moyen | Try-catch systématique, schema validation, fallback vers texte brut, logging structuré |

### 7.2 Risques Moyens

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R5 | **Performance dégradation avec 50+ tabs** | Moyenne | Moyen | Virtual scrolling des messages, lazy rendering des tabs inactifs, Web Worker pour les opérations lourdes |
| R6 | **Parsing de fichiers complexes (PDF corrompu, DOCX chiffré)** | Moyenne | Faible | Validation à l'upload, fallback raw text, toast d'erreur clair, pas de crash |
| R7 | **Race condition entre onglets concurrents** | Faible | Moyen | IndexedDB est transactionnel, mais les états en mémoire JS doivent être synchronisés via EventBus |
| R8 | **Thème custom cassé** | Faible | Faible | Template CSS bien documenté, validation des couleurs, fallback sur thème par défaut |

### 7.3 Risques Faibles

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R9 | **Raccourcis clavier en conflit avec le navigateur** | Faible | Faible | Détecter `navigator.platform`, avertissement si conflit, override `preventDefault()` |
| R10 | **Fuzzy search trop lent** | Faible | Faible | Limiter à 100 commandes/agents, debounce 100ms sur l'input, scoring O(n) simple |

---

## 8. Plan d'Implémentation par Phases

### Phase 1 — Foundation (Semaine 1-2)

**Objectif :** Refactor monolithique → modules ES, migration V1, persistance V2.

| # | Tâche | Estimation | Priorité |
|---|---|---|---|
| 1.1 | Créer la structure de dossiers `modules/` | 2h | P0 |
| 1.2 | Extraire `core/`: EventBus, Logger, DB abstraction | 4h | P0 |
| 1.3 | Implémenter `db-migrate.js` (V1 → V2) | 3h | P0 |
| 1.4 | Extraire `core/settings.js` | 2h | P0 |
| 1.5 | Extraire `core/api-bridge.js` (wrapper Mistral) | 3h | P0 |
| 1.6 | Migrer les CSS en fichiers séparés `themes/` | 2h | P0 |
| 1.7 | Migrer `index.html` → point d'entrée minimal + importmap | 2h | P0 |
| 1.8 | Extraire `ui/`: modal, toast, dropdown, keyboard, theme-engine | 4h | P0 |
| 1.9 | Tests manuels : migration, compatibilité V1 | 2h | P0 |

**Livrable :** Architecture modulaire fonctionnelle, V1 migré, zéro regression visuelle.

### Phase 2 — Multi-Tab (Semaine 3)

**Objectif :** TabEngine complet, isolation d'état, persistence.

| # | Tâche | Estimation | Priorité |
|---|---|---|---|
| 2.1 | `tab-engine.js` : CRUD, state isolation | 6h | P0 |
| 2.2 | `tab-renderer.js` : barre d'onglets DOM | 4h | P0 |
| 2.3 | `tab-keybindings.js` : Ctrl+N/W/Tab, anti-new-window | 2h | P0 |
| 2.4 | Drag-and-drop reorder des tabs | 2h | P1 |
| 2.5 | Pin/unpin tabs | 1h | P2 |
| 2.6 | Double-click rename | 1h | P2 |
| 2.7 | Session restore au reload | 2h | P0 |

**Livrable :** Multi-tab fonctionnel avec Ctrl+N, persistance, isolation complète.

### Phase 3 — Chat UX (Semaine 3-4)

**Objectif :** ChatView refactoré, @mentions, export, prompt composer amélioré.

| # | Tâche | Estimation | Priorité |
|---|---|---|---|
| 3.1 | `chat-manager.js` refactor | 4h | P0 |
| 3.2 | `chat-renderer.js` refactor (messages pliables) | 3h | P0 |
| 3.3 | `chat-actions.js` : copy, export .md, export .txt | 2h | P0 |
| 3.4 | `dropdown.js` : @agent mention menu | 4h | P0 |
| 3.5 | Prompt composer auto-grow + suggestions | 2h | P1 |
| 3.6 | Keyboard navigation dans la dropdown | 2h | P1 |

**Livrable :** Chat UX complet avec @mentions, export multi-format, pliables.

### Phase 4 — Agent System V2 (Semaine 4-5)

**Objectif :** Agent schema V2, lifecycle, orchestration.

| # | Tâche | Estimation | Priorité |
|---|---|---|---|
| 4.1 | `agent-schema.js` : validation V2 | 3h | P0 |
| 4.2 | `agent-manager.js` : CRUD avec lifecycle | 4h | P0 |
| 4.3 | `agent-runner.js` : execution context isolé | 3h | P0 |
| 4.4 | `agent-prompt-builder.js` : template system | 3h | P1 |
| 4.5 | `orchestrator.js` : JSON parsing + action execution | 6h | P0 |
| 4.6 | Rollback + error handling orchestrateur | 3h | P0 |
| 4.7 | UI feedback pour actions orchestrateur | 2h | P0 |

**Livrable :** Agent V2 complet, orchestrateur fonctionnel, feedback UI.

### Phase 5 — Memory & Files (Semaine 5-6)

**Objectif :** Memory documentaire, file pipeline complet.

| # | Tâche | Estimation | Priorité |
|---|---|---|---|
| 5.1 | `memory-manager.js` : CRUD V2 + versioning | 4h | P0 |
| 5.2 | `memory-index.js` : inverted index + search | 4h | P0 |
| 5.3 | `memory-filters.js` : filtres avancés | 2h | P1 |
| 5.4 | `file-upload.js` : drag-and-drop + validation + progress | 4h | P0 |
| 5.5 | `file-parser.js` : PDF, DOCX, TXT, CSV, JSON | 6h | P0 |
| 5.6 | `file-segmenter.js` : token-aware chunking | 3h | P0 |
| 5.7 | `file-summarizer.js` : AI summarization + memory injection | 3h | P0 |
| 5.8 | Memory UI panel refactor | 3h | P1 |

**Livrable :** Système mémoire complet, pipeline fichiers fonctionnel.

### Phase 6 — Tasks & Commands (Semaine 6-7)

**Objectif :** Task graph, kanban, command palette.

| # | Tâche | Estimation | Priorité |
|---|---|---|---|
| 6.1 | `task-engine.js` : CRUD + lifecycle | 4h | P0 |
| 6.2 | `task-kanban.js` : kanban board renderer | 4h | P0 |
| 6.3 | `task-sync.js` : agent ↔ task synchronization | 3h | P1 |
| 6.4 | `task-graph.js` : DAG SVG visualization | 4h | P2 |
| 6.5 | `command-palette.js` : UI + fuzzy search | 4h | P0 |
| 6.6 | `command-registry.js` + `builtin-commands.js` | 3h | P0 |
| 6.7 | Custom shortcuts in settings | 2h | P2 |

**Livrable :** Task kanban fonctionnel, command palette, plugins-ready.

### Phase 7 — Settings & Polish (Semaine 7-8)

**Objectif :** Settings complets, densité, focus mode, polish final.

| # | Tâche | Estimation | Priorité |
|---|---|---|---|
| 7.1 | Settings panel complet (tous les params) | 4h | P0 |
| 7.2 | Density tokens + switch UI | 2h | P1 |
| 7.3 | Focus mode (masque panels, agrandit chat) | 2h | P1 |
| 7.4 | Show/hide reasoning | 2h | P1 |
| 7.5 | Context indicators UI | 2h | P2 |
| 7.6 | Feedback visuel opérations longues (progress) | 3h | P1 |
| 7.7 | Export/import settings | 1h | P2 |
| 7.8 | Navigation fluide entre conversations | 2h | P1 |
| 7.9 | Polish responsive mobile | 4h | P1 |

**Livrable :** UX complète, paramètres fonctionnels, mobile responsive.

### Phase 8 — QA & Release (Semaine 8)

| # | Tâche | Estimation | Priorité |
|---|---|---|---|
| 8.1 | Test matrix complet (desktop + mobile) | 4h | P0 |
| 8.2 | Performance audit (Lighthouse, DevTools) | 2h | P0 |
| 8.3 | Migration V1 → V2 edge cases | 2h | P0 |
| 8.4 | Fix bugs critiques | 4h | P0 |
| 8.5 | Documentation utilisateur | 3h | P1 |
| 8.6 | Tag version + release notes | 1h | P1 |

**Total estimé : ~160h (8 semaines à 20h/sem)**

---

## 9. Améliorations Futures

### 9.1 Court Terme (Post-V2.0)

| Feature | Description | Complexité |
|---|---|---|
| **Multi-provider API** | Support OpenAI, Anthropic, Ollama local en plus de Mistral | Moyenne |
| **Plugin System** | API publique pour enregistrer des modules externes | Haute |
| **Collaborative Editing** | Partage de conversation en temps réel (WebRTC/CRDT) | Haute |
| **Voice Agent** | Conversations vocales bidirectionnelles (Web Speech API) | Moyenne |
| **Image Generation** | Intégrer Stable Diffusion / DALL-E dans le pipeline | Moyenne |

### 9.2 Moyen Terme (V3.0)

| Feature | Description | Complexité |
|---|---|---|
| **PWA Offline** | Service Worker + cache API pour usage hors-ligne | Moyenne |
| **Embedded Vector DB** | Recherche sémantique dans la mémoire (transformers.js) | Haute |
| **Agent Marketplace** | Partage d'agents entre utilisateurs | Haute |
| **Workflow Automation** | Macros d'actions agent (si X alors Y) | Moyenne |
| **Canvas/Whiteboard** | Espace de travail visuel pour les agents | Haute |
| **Git Integration** | Agents peuvent lire/écrire dans des repos | Moyenne |

### 9.3 Long Terme

| Feature | Description |
|---|---|
| **Multi-User** | Comptes utilisateurs, sync cloud |
| **Agent-to-Agent Communication** | Protocole inter-agent standardisé |
| **Self-Evolving Agents** | Agents qui s'améliorent via leurs propres retours d'expérience |
| **Desktop App** | Electron/Tauri wrapper |
| **IDE Integration** | VS Code extension, JetBrains plugin |

---

## Annexe A — Compatibility Matrix

| Navigateur | ES Modules | IndexedDB | ImportMap | Drag&Drop | Speech API |
|---|---|---|---|---|---|
| Chrome 89+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Firefox 108+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Safari 16.4+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edge 89+ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Annexe B — Token Budget Estimation

| Composant | Taille estimée (KB) |
|---|---|
| index.html (entry) | ~5 |
| core/* (6 modules) | ~30 |
| agents/* (5 modules) | ~45 |
| chat/* (4 modules) | ~25 |
| tabs/* (3 modules) | ~15 |
| memory/* (3 modules) | ~20 |
| files/* (4 modules) | ~25 |
| tasks/* (4 modules) | ~30 |
| commands/* (3 modules) | ~15 |
| ui/* (7 modules) | ~25 |
| themes/* (4 CSS) | ~20 |
| **Total** | **~255 KB** |

## Annexe C — API Cost Estimation (Mistral Free Tier)

| Opération | Tokens input | Tokens output | Fréquence estimée |
|---|---|---|---|
| Chat message | ~500-2000 | ~500-2000 | 10-50/jour |
| Agent generation (wizard) | ~200 | ~4000 | 1 fois |
| File summarization | ~500/chunk | ~200/chunk | 5-20 chunks/jour |
| Orchestration | ~1000 | ~2000 | 1-5/jour |

**Total quotidien estimé : ~50K-150K tokens** — bien dans les limites du free tier Mistral.

---

*End of Specification.*
