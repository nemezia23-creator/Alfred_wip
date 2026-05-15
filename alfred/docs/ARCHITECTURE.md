# Architecture

> Ce document complète [`SPECIFICATION.md`](./SPECIFICATION.md) avec les décisions
> d'implémentation prises lors du refactor.

## Principes structurants

1. **Zero build** — aucun bundler, aucun npm. Tout est servable en statique.
2. **Modules ES natifs** — un fichier = un module = une responsabilité.
3. **Dépendances unidirectionnelles** : `ui → domaines (chat/agents/...) → core`.
   Aucune dépendance circulaire. `core/` n'importe rien d'autre que lui-même.
4. **CSS custom properties** comme unique source de vérité visuelle.
   Pas de valeur codée en dur dans les composants.
5. **IndexedDB-first** — pas de backend, pas de sync, fonctionne offline.

## Couches

```
┌──────────── ui / ─────────────┐  composants partagés (modal, toast, theme…)
├──────────── chat / tabs / agents / memory / files / tasks / commands ┤
├──────────── core / ────────────┐  event-bus, logger, db, settings, api-bridge
└────────────────────────────────┘
```

## Communication

Toute communication inter-modules transite par **EventBus** (`core/event-bus.js`).
Les types d'événements sont gelés dans `EVT` (enum) pour éviter les typos.

Aucun appel direct entre domaines : `chat-manager` n'appelle pas `agent-manager`,
il émet `CHAT_MESSAGE` et `agent-runner` y réagit s'il est intéressé.

## Persistance

`core/db.js` expose une API promesse minimale (`get`, `put`, `del`, `getAll`,
`clear`, `count`, `dbStats`). Les domaines composent leurs propres opérations
au-dessus, sans toucher à l'API IndexedDB brute.

Stores (`AlfredDB` v4) :

| Store | Clé | Indexes |
|---|---|---|
| `tabs` | `id` | `order`, `updatedAt` |
| `chats` | `id` | `tabId`, `createdAt` |
| `agents` | `id` | `name`, `tag` |
| `memories` | `id` | `type`, `createdAt` |
| `tasks` | `id` | `status`, `agentId` |
| `files` | `id` | `createdAt` |
| `settings` | `key` | — |
| `command_history` | `id` | `ts` |

## Migration V1 → V2

`core/db-migrate.js` :

1. Tente d'ouvrir `VOANH_AI_DB` **sans bumper sa version** (si elle n'existe pas, abort propre).
2. Lit `chats`, `agents`, `settings`, `global_memory`.
3. Réécrit dans `AlfredDB` avec mapping minimal (`version: 1` ajouté quand absent).
4. Ne supprime jamais l'ancienne DB.
5. Pose `settings.migrated_v2 = true` ⇒ idempotent.

## API LLM

`core/api-bridge.js` expose `getApiKey`, `setApiKey`, `clearApiKey`, `hasApiKey`.
La clé est stockée en cookie (compat V1) **et** en localStorage (fallback), jamais
dans IndexedDB, jamais loggée.

L'appel HTTP réel (chat completions, streaming SSE) sera implémenté en Phase 2
dans `chat/chat-stream.js`, qui consommera `getApiKey('mistral')`.

## Sécurité

- Aucune valeur dynamique injectée via `innerHTML` brut. Toujours `textContent`
  ou DOM API + sanitizer dédié pour le markdown (Phase 2).
- Réponses orchestrateur (JSON) : `JSON.parse` en try/catch + validation de
  schéma avant exécution (Phase 7).
- Clé API jamais affichée dans les logs ; uniquement la longueur à `info`.

## Phase 6 / v7 — Pipeline fichiers (`modules/files/`)

```
[drag&drop sur .chat-input-bar]──┐
       │                          │
       ▼                          ▼
file-upload.js (whitelist MIME, max size)
       │ onFile(File)
       ▼
file-pipeline.js : ingestFile(file)
       │
       ├─► file-parser.js : parseFile(file) ──► text (PDF.js / mammoth lazy CDN)
       │
       ├─► file-segmenter.js : segmentText(text, {chunkTokens, overlapTokens})
       │
       ├─► db.put('files', record)         ◄── status: parsed
       │
       └─► file-summarizer.js (si autoSummarize ≠ false et clé API présente)
              │
              ├─► streamMistral × N chunks  ──► résumé partiel
              ├─► streamMistral × 1 agrégat ──► résumé global
              ├─► memory-manager.addMemory × (N + 1)
              │     · source: 'file', tags: ['file', ext]
              │     · meta.fileId pointe vers files/<id>
              └─► db.put('files', record)   ◄── status: summarized
```

Pas de WebWorker pour le parsing : volontaire (zero build, simplicité).
PDF.js et mammoth sont importés dynamiquement depuis un CDN pour rester
compatibles avec un déploiement statique sans `node_modules`.
