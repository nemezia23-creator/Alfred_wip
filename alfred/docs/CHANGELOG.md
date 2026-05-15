# Changelog

Toutes les versions notables du projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### v9.1 — Phase 8.1 · Correctifs UX (fichier seul, agents inter-créés, EventBus)

**Correctifs**
- **Fichier joint envoyé seul.** Le bouton « Envoyer » accepte de
  publier une pièce jointe sans prompt textuel : le fichier apparaît
  dans la conversation (référencé + contenu inliné), mais la réponse
  de l'agent n'est PAS déclenchée. L'utilisateur doit envoyer un prompt
  pour obtenir une réponse — celle-ci dispose alors du fichier dans le
  contexte historique.
- **Agent créé par un autre agent qui n'apparaissait pas.** La modale
  « ◈ Agents » écoute désormais l'évènement `agents:changed` et
  rafraîchit sa liste à chaque création/édition/suppression, y compris
  celles déclenchées par une directive `<agent:create…>` dans une
  réponse d'agent. Plus de liste fantôme après la 1ʳᵉ création.
- **DevTools / EventBus vide au démarrage.** `primeBusCapture()` est
  appelé en tout début de `boot()`, avant la première émission
  `boot:step`. Le panneau EventBus contient désormais un historique
  dès la première ouverture (sans devoir déclencher une action).

### v9 — Phase 8 · Scroll, streaming résilient au switch d'onglet + correctifs Phase 7

**Nouveau**
- Boutons flottants ▲ / ▼ dans la conversation pour aller en haut / bas en un clic.
- `buildMemoryContext` injecte un bloc complémentaire « MÉMOIRES RÉCENTES »
  (jusqu'à 30 entrées avec leur `[id:m_xxx]`) en plus du top-K pertinent,
  pour que les agents puissent cibler une mémoire ancienne à modifier ou
  supprimer même si elle ne matche pas la requête courante.

**Correctifs Phase 7**
- **Mémoire — suppression d'une ancienne mémoire** : `deleteMemory` lève
  désormais une erreur explicite quand l'id est inconnu (au lieu d'un
  `return` silencieux qui faisait croire à l'agent que la suppression
  avait réussi). Combiné au bloc « MÉMOIRES RÉCENTES », les agents peuvent
  enfin cibler n'importe quelle mémoire active.
- **Switch d'onglet n'interrompt plus la réponse en cours.** Le stream
  est épinglé à son `chatId` d'origine ; les `onDelta` ne mettent à jour
  le DOM que si l'utilisateur est encore sur cet onglet, et le
  placeholder est persisté avec son `chatId` explicite. `updateMessage`
  retombe sur la BDD si le message n'est plus dans le cache mémoire
  (cas du switch). Seule la fermeture de l'onglet d'origine annule.
- **Fichier joint : la simple présence d'un fichier ne déclenche plus
  l'envoi.** L'agent attend désormais un prompt textuel non vide ; le
  fichier reste à disposition sous l'input, prêt à être inliné avec la
  prochaine question.
- **Bouton « ✦ Mémoriser » sur les pièces jointes** : fonctionne
  maintenant même sans clé API (parsing + insertion d'une mémoire de
  type `document` à partir du texte extrait). Avec clé API, garde-fou
  qui crée une mémoire basique si le pipeline ne renvoie aucun
  `memoryId`. `type="button"` ajouté pour éviter toute soumission
  parasite.
- **DevTools / EventBus** : un état vide explicite est affiché
  (« aucun événement capturé pour l'instant ») au lieu d'une page
  blanche trompeuse.
- **Agents qui créent des agents** : les instructions `agent-tools`
  restent injectées tant que `settings.agents.tools` n'est pas
  explicitement à `false` (déjà actif depuis v8) ; combiné au bloc
  « AGENTS DISPONIBLES » qui liste tous les `[id:ag_xxx]`, la création
  est reproductible d'un échange à l'autre.


### v8 — Phase 7 · Panneau Réglages + outils agents + correctifs Phase 6

**Nouveau panneau Réglages** (`modules/ui/settings-ui.js` + `themes/settings.css`)
- Modal complet remplaçant l'ancien `prompt()` de la clé API.
- Sections : Général (thème, densité, log level), API (Mistral), Chat (modèle,
  température, system prompt par défaut), **Mémoire** (toggles `memory.inject`
  + `memory.tools`), **Agents** (toggle `agents.tools`), **Fichiers**
  (`files.attachToChat`, `files.autoSummarize`, `files.perChunkMemory`,
  taille max, tokens par chunk, overlap).

**Outils agents** (`modules/agents/agent-tools.js`)
- Directives parsées et exécutées comme les directives mémoire :
  `<agent:create>`, `<agent:update id="…">`, `<agent:archive id="…"/>`,
  `<agent:delete id="…"/>`. Bloc « AGENTS DISPONIBLES » injecté avec
  `[id:ag_xxx]`. Désactivable via `settings.agents.tools = false`.

**Pipeline fichiers — UX repensée**
- Par défaut (`files.attachToChat = true`), un fichier glissé devient une
  pièce jointe visible sous l'input avec deux boutons : « ✦ Mémoriser »
  (déclenche le pipeline Phase 6) ou « ✕ ». À l'envoi, le contenu extrait
  est inliné dans le message utilisateur (jusqu'à 8000 car).
- `files.chunkTokens` par défaut **2000** (vs 500). Un PDF de 2 pages = 1
  chunk au lieu de 5.
- `files.perChunkMemory` (nouveau, défaut **false**) : seule une mémoire
  globale est créée par fichier (résout « 9 mémoires pour 2 pages »).

**Correctifs Phase 6**
- `applyMemoryDirectives` : regex de parsing étendue (guillemets simples,
  valeurs nues, espaces en `/>` et tag de fermeture). Les directives
  `<memory:delete id="…"/>` annoncées par l'agent sont maintenant exécutées.
- DevTools / EventBus : capture démarrée au boot (`primeBusCapture()`).
  Le flux n'est plus vide quand on ouvre le devtools après coup.
- Tous les toggles précédemment invisibles (`memory.tools`,
  `files.autoSummarize`, etc.) sont accessibles via Réglages.

### v7 — Phase 6 · Pipeline fichiers (`modules/files/`)

Implémentation du pipeline de fichiers (SPEC §2 et changelog Phase 6) : on peut désormais

Implémentation du pipeline de fichiers (SPEC §2 et changelog Phase 6) : on peut désormais
glisser-déposer un document dans la zone chat ou cliquer sur 📎 pour l'importer ;
Alfred l'extrait, le segmente, le résume par chunks via l'API et injecte le résultat
dans la mémoire en taggant chaque entrée avec un lien vers le fichier source.

**Modules ajoutés**
- `files/file-schema.js` — schéma `files` (id, name, mime, ext, text, chunks, summary,
  memoryIds, status `uploaded|parsed|summarized|error`), `defaultFile()`, `inferExt()`,
  whitelists MIME / extension.
- `files/file-upload.js` — `mountFileUpload(zone, { onFile })`. Drag-and-drop sur la zone
  passée + input fichier caché déclenchable via `pick()`. Filtre MIME (txt, md, csv,
  json, pdf, docx) et taille max configurable (`settings.files.maxSizeMB`, défaut 20).
  Émet `FILE_UPLOADED` avec `{ name, size, mime, ext }`.
- `files/file-parser.js` — extracteurs : TXT/MD/CSV en lecture native, JSON pretty-print,
  PDF via **PDF.js 4.7** (ESM CDN, worker auto-configuré), DOCX via **mammoth 1.8**
  (script CDN, lazy). Émet `FILE_PARSED`.
- `files/file-segmenter.js` — `segmentText(text, { chunkTokens=500, overlapTokens=80 })`.
  Découpe paragraphe → phrase → hard-cut, overlap configurable, `approxTokens()`
  zero-dep (≈ 4 chars / token).
- `files/file-summarizer.js` — `summarizeFile(record)` : un appel `streamMistral` par
  chunk (system "résumeur factuel"), agrégation finale, **création automatique
  d'entrées `memories`** : une entrée `type:document` par chunk + une entrée
  `type:summary` globale. Chaque mémoire porte `source:'file'`, le tag `file` + le
  type d'extension, et est annotée `meta.fileId` / `meta.chunkIndex` pour traçabilité.
- `files/file-pipeline.js` — orchestrateur `ingestFile(file, { signal, onStatus })` :
  parse → store → segment → store → summarize. Émet des messages de statut au fur et
  à mesure (visible dans le footer `chat-file-status`).

**Modifications transverses**
- `chat/chat-ui.js` — ajout du bouton 📎 dans la barre d'actions et du drop-zone sur
  `.chat-input-bar` (overlay accent quand un fichier survole). Bandeau `#chat-file-status`
  sous l'input pour le suivi temps réel.
- `themes/files.css` (nouveau) — overlay drop, bandeau de statut.
- `index.html` — link `themes/files.css`, bump version « v7 · phase 6 · files ».

**Settings exposés**
- `files.maxSizeMB` (défaut 20)
- `files.chunkTokens` (défaut 500)
- `files.overlapTokens` (défaut 80)
- `files.autoSummarize` (défaut `true`) — désactiver pour stocker sans appeler l'API.

**Notes**
- Le store `files` (DB v4) existait déjà depuis Phase 1 — aucune migration de schéma.
- Sans clé Mistral, le fichier est parsé + segmenté + persisté mais le résumé est sauté
  (aucune erreur, le fichier passe en status `parsed`).
- Les CDN (PDF.js, mammoth) sont chargés à la demande au premier import d'un PDF/DOCX.
  Si offline, le parser TXT/MD/CSV/JSON reste opérationnel.

### v6 — Correctifs UX + mémoire éditable par les agents

**Correctifs**
- **DevTools / Logs généraux** : la zone exploite désormais toute la largeur ; les colonnes
  ts / niveau / namespace / message sont alignées (le grid était posé sur le `<li>` mais le
  contenu réel vivait à l'intérieur d'un `<details>` — refactor : grid déplacé sur `<summary>`).
  Fond `--bg-2` (au lieu du noir profond) pour gagner en lisibilité, hover/open distingués.
- **DevTools / EventBus** : même restructuration que les Logs (lisibilité + fond clair, colonnes
  alignées). Plus de zone illisible sur fond noir.
- **Mémoire / saisie manuelle** : le textarea acceptait silencieusement la troncature à
  5 000 caractères. Limite portée à **10 000**, et un compteur live `N/10000` apparaît sous
  l'invite (orange à 90 %, rouge à 100 %).
- **Mémoire / filtres invisibles** : ajout d'un champ **tag** et d'un curseur **confiance ≥ N %**
  dans la toolbar du gestionnaire. Combinables avec type / source / statut.
- **Mémoire / recherche** : le tokenizer rejetait les jetons de moins de 3 caractères ; seuil
  ramené à 1. Ajout d'un fallback **substring** (avec normalisation des accents) quand l'index
  inversé ne matche pas. Tri stable : score desc, puis `updatedAt` desc.

**Nouvelle capacité — agents qui écrivent dans la mémoire**
- `memory-manager.js` expose `MEMORY_TOOLS_INSTRUCTIONS` et `applyMemoryDirectives(content)`.
  Le bloc d'instructions est concaténé au system prompt (désactivable via
  `settings.memory.tools = false`) et explique aux agents comment émettre :
  - `<memory:create type="…" tags="…">contenu</memory:create>`
  - `<memory:update id="m_xxx">nouveau contenu</memory:update>`
  - `<memory:delete id="m_xxx"/>`
- Le bloc « MÉMOIRE PERTINENTE » injecté inclut désormais `[id:m_xxx]` pour chaque entrée,
  afin que l'agent puisse cibler les bonnes mémoires pour `update` / `delete`.
- `chat-ui.js` exécute les directives à la fin du streaming, remplace les balises par
  `_[mémoire créée · …]_` / `_[mémoire mise à jour · …]_` / `_[mémoire supprimée · …]_`,
  et émet un toast récapitulatif. Les mémoires créées portent `source: 'agent'`.
### Phase 5 — Mémoire documentaire

Implémentation du module `modules/memory/` (SPEC §4.5). Chaque message
peut être mémorisé d'un clic ; les mémoires actives sont indexées et
ré-injectées automatiquement dans le system prompt selon les tags et la
priorité (`memPrio`) de l'agent actif.

**Modules ajoutés**
- `memory/memory-schema.js` — schéma V2, `defaultMemory()`, `validateMemory()`
  (validation zero-dep, messages d'erreurs FR). Champs : `content`, `type`
  (`fact|preference|instruction|document|summary`), `source`, `owner`,
  `confidence`, `tags`, `status`, `version`, `previousVersion`, `accessCount`.
- `memory/memory-index.js` — index inversé fait-maison, tokenizer FR
  (strip accents, stop-words FR/EN), score TF + IDF léger. `MemoryIndex`
  reconstruit au boot depuis le store `memories`.
- `memory/memory-manager.js` — CRUD (`addMemory`, `updateMemory`,
  `deleteMemory`, `archiveMemory`, `activateMemory`), filtres composables
  (`type`, `source`, `owner`, `tags`, `status`, `minConfidence`),
  `searchMemories(query, filters)`, `buildMemoryContext({agent, query})`
  pour la pré-injection chat, `exportMemories` / `importMemories`,
  versioning léger (incrément + `previousVersion`).
- `memory/memory-ui.js` — modal CRUD (recherche live, filtres type / source /
  statut, édition complète, archive, import / export JSON).
- `themes/memory.css` — styles tokenisés (modal, liste, formulaire,
  bordure colorée par type).

**Modifications transverses**
- `chat/chat-ui.js` — bouton `⬡ Mémoire` dans la toolbar, action `⬡
  Mémoriser` sur chaque message, injection auto du bloc « MÉMOIRE
  PERTINENTE » dans le system prompt (filtré par tags d'agent + scoring
  sur le dernier message utilisateur). Désactivable via setting
  `memory.inject = false`.
- `app.js` — `bootMemory()` après `bootAgents()`, bouton header
  `#open-memory`, status « Phase 5 ».
- `index.html` — link `themes/memory.css`, bouton « ⬡ Mémoire », bump
  version "phase 5".

**Notes** — Le store `memories` (DB v4) existait déjà depuis Phase 1, donc
aucune migration de schéma. Les anciennes mémoires sans `schemaVersion`
sont complétées automatiquement au premier load (idempotent).

### Phase 4.1 — Correctifs (mise à jour)

- **Bug duplicate / import : pattern de nom trop strict.** Le pattern
  `name` n'autorisait pas `()`, donc `uniquifyName` (« X (2) ») et
  `duplicateAgent` (« X (copie) ») échouaient à la validation. Le pattern
  accepte maintenant `() .`, et la longueur max passe de 30 à 40.
- **Auto-suffix sur création manuelle.** Le formulaire de l'UI agents
  appelle désormais `createAgent(patch, { autoSuffix: true })` : créer
  un second agent avec un nom déjà utilisé ajoute automatiquement ` (2)`,
  ` (3)`… au lieu de rejeter.
- **DevTools : Logs / EventBus exploitent toute la hauteur disponible.**
  `.devtools-body` est désormais en `flex column` ; les listes Logs et
  EventBus ont `flex:1; min-height:0; overflow:auto`. Plus de zone
  microscopique ni de scroll qui se perd dans le body.

### Phase 4.1 — Correctifs

- **Agents : duplication & import résilients aux noms en doublon.**

- **Agents : duplication & import résilients aux noms en doublon.**
  `createAgent({ autoSuffix:true })` ajoute automatiquement ` (2)`, ` (3)`…
  quand le nom est déjà pris. `duplicateAgent` et `importAgent` l'utilisent.
- **EventBus : fix du crash sous charge de streaming.** Le panel DevTools
  capturait des références live aux payloads (`chat:streaming` qui grossit
  token par token) et re-rendait toute la liste à chaque event. Désormais :
  (1) `chat:streaming` filtré par défaut (case à cocher), (2) snapshot +
  troncature de chaque payload, (3) DOM append-only au lieu de full re-render.
- **Logs lisibles.** Lignes longues cliquables → `<details>` qui révèle
  la température et tout le payload d'agent en clair.
- **`@mention` : Enter ne valide plus l'envoi.** Keydown du dropdown en
  `capture:true` + `stopImmediatePropagation()`. `Tab` valide aussi le pick.
- **Logs explicites.** `agent-manager` log `info` à chaque
  `created`/`updated`/`deleted`.

### Phase 4 — Système d'agents

Implémentation complète du module `modules/agents/` (SPEC §4.3). Chaque
onglet peut désormais être lié à un agent ; le system prompt envoyé à
l'API est construit à partir de l'agent actif (température, maxTokens et
modèle préféré peuvent également surcharger ceux du chat).

**Modules ajoutés**
- `agents/agent-schema.js` — schéma V2, `defaultAgent()`, `validateAgent()`
  (validation zero-dep, messages d'erreurs FR).
- `agents/agent-manager.js` — CRUD (`createAgent`, `updateAgent`,
  `deleteAgent`, `archiveAgent`, `activateAgent`, `duplicateAgent`,
  `exportAgent`, `importAgent`, `noteAgentUsed`), seed des 4 agents par
  défaut au premier boot (`agents_seeded` flag), migration douce des
  agents V1 sans champ `version`.
- `agents/agent-prompt-builder.js` — `buildSystemPrompt(agent, opts)` avec
  template Jinja-lite (`{{name}} {{role}} {{primer}} {{instructions}}
  {{forbidden}} {{style}} {{tags}} {{date}}`) et fallback structuré
  (Tu es / Rôle / Primer / Instructions / Style / Interdits / Tags).
- `agents/agent-ui.js` — modal de gestion (liste + édition + import /
  export JSON), sélecteur intégré à la toolbar du chat, dropdown de
  mention `@agent` (fuzzy sur nom/tags/desc, navigation clavier).
- `themes/agents.css` — styles tokenisés (modal, liste, formulaire,
  dropdown mention, bordure colorée par agent).

**Agents par défaut seedés au premier boot**
- ◈ **Généraliste** — assistant polyvalent.
- ⌬ **CodeForge** — ingénieur logiciel senior, temp 0.3.
- ✎ **WriterPro** — rédacteur, temp 0.85, style créatif.
- 🔬 **ResearchBot** — chercheur, temp 0.5, style pédagogique.

**Modifications transverses**
- `tabs/tab-engine.js` — `setTabAgent(tabId, agentId)` ajouté.
- `chat/chat-ui.js` — sélecteur d'agent dans la toolbar (par onglet),
  bouton « ◈ Agents », `@` mention dropdown branché sur le textarea,
  injection du system prompt par l'agent (`buildSystemPrompt`),
  température/maxTokens/modelPref overridés par l'agent quand défini,
  `noteAgentUsed` appelé après chaque réponse.
- `chat/chat-manager.js` — `addMessage` enregistre désormais `agentId`
  pour traçabilité.
- `app.js` — `bootAgents()` après `loadTabs()`, bouton header
  `#open-agents`.
- `index.html` — link `themes/agents.css`, bouton « ◈ Agents », bump
  version "phase 4".

**Tests** — `tests/test-checklist.md` section Phase 4 (CRUD, switch
d'agent en cours de conversation, mention `@`, import / export JSON,
archive / réactivation, propagation du system prompt).

**Notes de compat** — Aucun agent V1 n'est supprimé. Les anciens
enregistrements sont complétés avec les champs manquants au prochain boot
(idempotent grâce au flag `agents_seeded`).

### Phase 3 — Multi-onglets

Implémentation du système d'onglets décrit dans `SPECIFICATION.md` §1.4 et §4.1.
Chaque onglet est une conversation isolée persistée dans le store `tabs` d'AlfredDB.
Les messages restent dans `chats` mais sont filtrés par `chatId === tab.id`,
donc Phase 2 reste 100 % compatible (l'ancien chat `default` se retrouve
simplement comme l'un des tabs après création d'un onglet manuel — ou ré-attribué
au premier tab via migration douce si besoin futur).

**Modules ajoutés** (`modules/tabs/`)
- `tab-engine.js` — CRUD onglets (`createTab`, `closeTab`, `switchTab`,
  `renameTab`, `togglePin`, `reorderTabs`, `cycleTab`), auto-titrage
  (`maybeAutoTitle`), garde-fou `installWindowOpenGuard()` qui neutralise
  `window.open` et redirige l'utilisateur vers Ctrl+N.
- `tab-renderer.js` — barre d'onglets DOM avec drag-and-drop natif HTML5,
  double-click pour renommer, middle-click pour fermer, menu contextuel
  (épingle / renommer / fermer) déclenché au clic droit.
- `tab-keybindings.js` — raccourcis globaux : `Ctrl/Cmd + N`, `Ctrl/Cmd + W`,
  `Ctrl/Cmd + Tab` / `+ Shift + Tab`. Comme le navigateur intercepte souvent
  ces combos, des alternatives **Alt-based** garanties sont fournies :
  `Alt + N`, `Alt + W`, `Alt + ←/→`.

**Persistance & restauration**
- Tab actif mémorisé dans `settings.tabs.activeId` ; restauration au boot.
- Limite douce `max_tabs` (defaut 20) → archivage du plus ancien non-épinglé ;
  hard cap 50 (erreur explicite).
- Auto-titre : le premier message utilisateur (≤30 chars) renomme l'onglet
  si son titre est encore "Conversation N".

**UX**
- Bouton `+` à droite de la barre, onglet actif souligné en accent.
- Onglet épinglé : pas de bouton ×, ne peut pas être fermé par accident.
- Drag-and-drop pour réordonner ; l'ordre est persisté (champ `order`).
- Fermeture d'onglet supprime ses messages associés (confirmation préalable).
- Si on ferme le dernier onglet, un nouvel onglet vide est créé automatiquement.

**Modifications transverses**
- `chat/chat-manager.js` : `loadChat(id)` accepte explicitement un tab id ;
  `addMessage` utilise `currentChatId` (set automatiquement par `loadChat`).
  `setCurrentChatId(id)` exposé pour usage avancé.
- `chat/chat-ui.js` : écoute `TAB_SWITCHED` / `TAB_CLOSED`, recharge la liste
  de messages et coupe tout streaming en cours avant de switcher.
- `app.js` : charge les onglets après les settings, installe la garde
  `window.open`, branche les raccourcis, monte la barre d'onglets au-dessus
  du chat. Bus `toast` global pour notifications inter-modules.
- `themes/tabs.css` : styles tokenisés (zéro couleur en dur, cohérent avec
  les 3 thèmes).
- `index.html` : intègre `tabs.css` et bump version "phase 3".

### Détail des phases à venir

#### Phase 4 — Système d'agents (`modules/agents/`)
- `agent-manager.js` : CRUD agent (schéma v2 selon SPEC §4.3), lifecycle
  draft/active/archived, validation JSON-schema avant persistance.
- `agent-schema.js` : schéma + validateur léger (pas d'AJV pour rester
  zero-dep), messages d'erreurs FR.
- `agent-runner.js` : exécution d'un tour de chat avec contexte agent
  (system prompt construit par `agent-prompt-builder.js`, mémoires filtrées
  par tags de l'agent, température/maxTokens propres à l'agent).
- `agent-prompt-builder.js` : template Jinja-lite — substitution de
  `{{name}}`, `{{role}}`, `{{primer}}`, `{{forbidden}}`, etc.
- Intégration tabs : `TabState.agentId` détermine l'agent actif d'un onglet ;
  sélecteur d'agent ajouté à la chat-toolbar.
- `@` mention dropdown (UI partagée) — utilise `command-palette` style fuzzy.
- Tests : créer/éditer/archiver agent, switch d'agent en cours de conversation
  (n'efface pas l'historique mais change le system prompt à partir de
  l'échange suivant).

#### Phase 5 — Mémoire documentaire (`modules/memory/`)
- `memory-manager.js` : CRUD mémoire (store `memories`), versioning léger
  (champ `version` incrémenté à chaque update, historique optionnel).
- `memory-index.js` : index inversé fait-maison (token → set d'ids), TF-IDF
  léger, tokenizer FR (stop-words). Pas de Lunr (dépendance externe).
- `memory-filters.js` : filtres composables (tags, type, date, owner,
  confidence ≥ X).
- Bouton "⬡ Mémoriser" dans les actions message ; injection auto dans le
  contexte chat selon `agent.memPrio` et `agent.tags`.

#### Phase 6 — Pipeline fichiers (`modules/files/`)
- `file-upload.js` : drag-and-drop sur la zone chat + input fichier, MIME
  whitelist, taille max configurable.
- `file-parser.js` : extracteurs pour PDF (PDF.js), DOCX (mammoth.js via CDN
  ESM), TXT, CSV, JSON, Markdown.
- `file-segmenter.js` : chunking token-aware (overlap configurable).
- `file-summarizer.js` : résumé par chunks via API, agrégation, injection
  dans `memories` avec lien vers le fichier source dans `files`.

#### Phase 7 — Orchestrateur + Tasks (`modules/agents/orchestrator.js` + `modules/tasks/`)
- `orchestrator.js` : agent spécial (`isOrchestrator: true`) qui retourne un
  JSON validé `{plan: [{agentId, prompt, dependsOn}]}` ; exécution via
  `task-engine`, suivi en temps réel sur le kanban.
- `task-engine.js` : machine d'état (`pending → running → done | failed`),
  retries configurables, timeouts.
- `task-kanban.js` : kanban DOM avec colonnes ; `task-graph.js` : vue DAG.
- `task-sync.js` : EventBus → mise à jour visuelle ; agent ↔ task linking.

#### Phase 8 — Command Palette + 8 agents pré-installés (`modules/commands/`)
- `command-palette.js` : Ctrl/Cmd+K, fuzzy search, navigation clavier.
- `command-registry.js` : enregistrement par modules (chaque module expose
  ses commandes au boot).
- `builtin-commands.js` : nouveau chat, ouvrir mémoire, switch thème,
  exporter, etc.
- 8 agents de supervision pré-installés selon `docs/SUPERVISION.md`
  (Architecte, Auditeur, Documenteur, etc.) — seedés au premier boot via
  `agent-manager.seedDefaults()` si `settings.agents_seeded !== true`.

### Phase 1 — Bugfixes (DevTools + accès BDD in-app)
- **Bug** : aucune entrée DevTools dans la barre d'en-tête et aucune façon in-app de visualiser la base IndexedDB. F12 envoyait vers les DevTools du navigateur (ce que tout utilisateur non-tech ne pouvait pas faire).
- **Fix** : panneau DevTools intégré à l'app avec 5 onglets (Logs / Database / Settings / EventBus / API).
  - Bouton **🛠 DevTools** ajouté dans la barre d'en-tête.
  - Raccourci clavier **Ctrl/Cmd + Shift + D** (toggle). `F12` reste tenté en `preventDefault` mais reste non garanti (le navigateur peut l'intercepter avant l'app — c'est pourquoi le combo Ctrl+Shift+D est la voie officielle).
  - `Escape` ferme le panneau.
- **Onglet Logs** : historique en mémoire (ring buffer 500 entrées) avec filtre texte, sélecteur de niveau live, export `.txt`, effacement.
- **Onglet Database** : navigation parmi les 8 stores `AlfredDB`, comptage, vue déroulante JSON par enregistrement, suppression d'enregistrement, vidage de store avec confirmation. Plus besoin d'aller dans DevTools navigateur → Application → IndexedDB.
- **Onglet Settings** : visualisation live + édition + ajout de clés (les clés sensibles type `api_key/secret/token` sont masquées).
- **Onglet EventBus** : sniffer wildcard (`bus.on('*', …)`) qui capture tous les `EVT.*` émis pendant l'ouverture du panneau, avec horodatage et payload résumé.
- **Onglet API** : statut de la clé Mistral, set / replace / clear sans passer par le prompt `⚙ Réglages`.

### Modifications techniques
- `core/logger.js` : ajout d'un ring buffer (`getLogHistory`, `onLog`, `clearLogHistory`) — chaque log console est aussi capturé pour le panneau, sans impact sur les niveaux.
- `core/event-bus.js` : support du wildcard `bus.on('*', (type, payload) => …)` pour permettre l'écoute globale par DevTools.
- `ui/devtools.js` (nouveau) : module du panneau, mount via `installDevTools()` + API `open/close/toggle` exposée sur `window.Alfred.devtools`.
- `themes/devtools.css` (nouveau) : styles theme-agnostic via custom props, surcharges light mode.
- `index.html` : nouveau bouton `#open-devtools` + link CSS.
- `app.js` : `installDevTools()` au boot, click handler sur le bouton.

### Phase 2 (à venir) — Chat mono-onglet
- `chat/chat-manager.js`, `chat-stream.js`, `chat-renderer.js`, `chat-actions.js`
- Streaming SSE Mistral
- Markdown-lite + code blocks
- Export `.md` / `.txt`, rating

### Phase 3 — Multi-onglets
### Phase 4 — Système d'agents
### Phase 5 — Mémoire documentaire
### Phase 6 — Pipeline fichiers
### Phase 7 — Orchestrateur + Tasks
### Phase 8 — Command Palette + 8 agents de supervision pré-installés

---

## [0.1.0] — Phase 1 — Fondations

### Ajouté
- `index.html` minimal avec importmap (`@alfred/` → `./modules/`)
- `modules/app.js` — bootstrap orchestré avec boot log visible
- **Core**
  - `event-bus.js` — pub/sub typed avec enum `EVT`
  - `logger.js` — logger structuré avec niveaux et namespaces
  - `db.js` — wrapper IndexedDB pour `AlfredDB` v4 (8 stores)
  - `db-migrate.js` — migration auto V1 (`VOANH_AI_DB`) → V2, non destructive
  - `settings.js` — settings persistés avec defaults
  - `api-bridge.js` — abstraction multi-provider (Mistral seul pour l'instant)
- **UI**
  - `ui/theme-engine.js` — switcher thème + densité, persistés
- **Thèmes**
  - `themes/_base.css` — tokens de spacing/typo/motion + reset
  - `themes/cyber.css` — héritage VOANH (cyan + scanlines)
  - `themes/midnight.css` — bleus profonds + indigo
  - `themes/light.css` — light mode soigné
- **Docs**
  - `README.md` (lancement local + déploiement VPS)
  - `docs/SPECIFICATION.md` (spec source)
  - `docs/SUPERVISION.md` (8 agents de supervision)
  - `docs/ARCHITECTURE.md` (décisions d'implémentation)
  - `docs/CHANGELOG.md` (ce fichier)

### Compatibilité V1
- Cookie `mistral_api_key` préservé (fallback localStorage)
- IndexedDB V1 lue mais jamais supprimée
- Flag `settings.migrated_v2` ⇒ migration idempotente

## Phase 2 — Chat mono-onglet

- Ajout module `chat/` : chat-manager, chat-stream (SSE Mistral), chat-renderer (markdown-lite + sanitization), chat-actions, chat-ui.
- Ajout `ui/sanitize.js` (escapeHtml, safeUrl) et `ui/toast.js` (notifications ARIA-live).
- Ajout `themes/chat.css` (styles toolbar, messages, markdown, input bar).
- Settings : `chat.model`, `chat.temperature`, `chat.context_window`, `chat.system_prompt`.
- Bonus UX : Stop streaming, Regenerate, Edit user message, Rating ★, Export .md/.txt, sélecteur de modèle, indicateur tokens approx.
- Sécurité : tout contenu IA passe par `escapeHtml` avant transformation markdown ; liens limités à http(s)/mailto.
