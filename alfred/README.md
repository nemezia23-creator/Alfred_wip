# ALFRED — Agent OS

> Refactor modulaire de **VOANH AI v1** (single-file HTML) en SPA vanilla JS sans build.
> Voir [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md) pour la spec complète.

---

## 🚦 Important — Alfred n'est PAS l'app Lovable que tu vois en preview

Lovable affiche la coquille React du projet (page blanche "Your app will live here").
**Alfred vit dans le dossier `alfred/`** et se lance séparément en local sur ta machine.
La preview Lovable ne saura jamais l'afficher : c'est volontaire (zéro build, zéro npm, déployable en pur statique).

---

## 🟢 Démarrer Alfred en 3 étapes (zéro connaissance technique)

### Étape 1 — Récupérer le code sur ta machine

Tu as deux options :

**A. Avec ton GitHub connecté (recommandé)**
```bash
git clone https://github.com/<ton-user>/<ton-repo>.git
cd <ton-repo>
```

**B. Sans GitHub — télécharger un ZIP depuis Lovable**
Sur desktop : ouvre le **Code Editor** (icône `<>` en haut), puis tout en bas du panneau de fichiers, clique **Download codebase**. Décompresse le ZIP.

### Étape 2 — Ouvrir un terminal **dans le dossier `alfred/`**

C'est l'étape la plus importante. Le serveur doit tourner **dans `alfred/`**, PAS à la racine du projet.

```bash
cd alfred       # ⚠️ DANS le sous-dossier alfred/ — pas à la racine !
```

Vérifie que tu es au bon endroit :
```bash
ls
# Tu dois voir : index.html  modules/  themes/  docs/  tests/  README.md
```

Si tu vois `package.json`, `src/`, `vite.config.ts`… **tu n'es pas dans le bon dossier**, refais `cd alfred`.

### Étape 3 — Lancer un serveur HTTP local

Choisis **une seule** des commandes ci-dessous (Python est déjà installé sur Mac/Linux et la plupart des Windows récents) :

```bash
# Option 1 — Python 3 (le plus courant)
python3 -m http.server 8080

# Option 2 — Node.js si tu l'as
npx --yes serve . -p 8080

# Option 3 — PHP si tu l'as
php -S localhost:8080
```

Puis **ouvre ton navigateur** sur :

> http://localhost:8080

Laisse le terminal ouvert tant que tu utilises Alfred. `Ctrl+C` pour arrêter.

---

## ✅ Ce que tu dois voir si tout va bien

Au chargement (fond bleu nuit, thème "Cyber" par défaut) :

1. En haut : barre **ALFRED · v2.0 · phase 4** avec sélecteurs Thème / Densité / bouton ⚙ Réglages
2. Au centre : panneau **"Système initialisé"** avec une liste de logs qui défile :
   ```
   ✓ chargement settings…
   ✓ DB ouverte (AlfredDB v4)
   ✓ pas de données V1 à migrer
   ✓ thème cyber · densité normal
   ```
3. Tout en bas : ligne `DB · tabs:0 · chats:0 · agents:0 …` et `API · Mistral ✗ (cliquer Réglages)`
4. Le statut final affiche en vert : **"Système prêt — Phase 4 opérationnelle."**

---

## ❌ Ce qui veut dire que ça ne marche PAS (et comment réparer)

| Symptôme | Cause probable | Solution |
|---|---|---|
| Page blanche "Your app will live here / Ask Lovable to build it" | Tu as ouvert la preview Lovable, pas Alfred | Suis les 3 étapes ci-dessus en local |
| Page 404 sur `localhost:8080` | Serveur lancé depuis la racine du projet | `cd alfred` puis relance `python3 -m http.server 8080` |
| Page blanche complète, console pleine d'erreurs `Failed to load module` | Tu as ouvert le fichier en `file://...` | Tu dois passer par `http://localhost:8080`, pas double-cliquer sur `index.html` |
| `command not found: python3` | Python pas installé | Essaie `python -m http.server 8080`, ou installe Node : `npx --yes serve . -p 8080` |
| `Address already in use: 8080` | Un autre serveur tourne sur ce port | Change de port : `python3 -m http.server 8081` puis ouvre `http://localhost:8081` |
| Le panneau de boot s'affiche mais rien ne se passe ensuite | Console du navigateur a une erreur | Ouvre les DevTools (F12) → onglet **Console**, copie-colle l'erreur ici |

---

## 🧪 Faire les premiers tests (Phase 1)

Une fois la page ouverte, vérifie dans cet ordre (5 min) :

1. **Thèmes** : change le thème via le menu déroulant en haut. La page doit changer instantanément. Refresh (`F5`) → le choix doit persister.
2. **Densité** : change la densité (compact/normal/spacious) → l'espacement doit varier.
3. **Clé API** : clique **⚙ Réglages**, colle ta clé Mistral (ou n'importe quel texte pour tester). Le footer passe à `API · Mistral ✓`. Refresh → la clé est toujours là.
4. **DB** : ouvre les DevTools (`F12`) → onglet **Application** → **IndexedDB** → tu dois voir `AlfredDB` avec 8 stores (tabs, chats, agents, memories, tasks, files, settings, command_history).

Checklist détaillée : [`tests/test-checklist.md`](tests/test-checklist.md)

---

## 🔑 Obtenir une clé API Mistral

1. Va sur https://console.mistral.ai/
2. Crée un compte (gratuit, pas de CB demandée pour commencer)
3. Menu **API Keys** → **Create new key** → copie-colle dans le bouton ⚙ Réglages d'Alfred

---

## Stack

- **Vanilla JS + ES Modules natifs** (importmap, `<script type="module">`)
- **Zero build, zero npm** — déployable par simple copie de dossier
- **IndexedDB** (`AlfredDB` v4) pour la persistance, migration auto depuis `VOANH_AI_DB` v3
- **API LLM** : Mistral en direct (clé en cookie/localStorage, jamais en DB)

## Déploiement VPS (Nginx) — pour plus tard

```bash
rsync -av alfred/ user@vps:/var/www/alfred/
```

Bloc Nginx :
```nginx
server {
  listen 80;
  server_name alfred.example.com;
  root /var/www/alfred;
  index index.html;

  types { application/javascript js mjs; }

  location / {
    try_files $uri $uri/ =404;
  }
}
```

Avec Caddy :
```caddyfile
alfred.example.com {
  root * /var/www/alfred
  file_server
  encode gzip
}
```

## État actuel — v7 / Phase 6

✓ Shell HTML + importmap
✓ EventBus typed (pub/sub)
✓ Logger structuré (debug/info/warn/error)
✓ AlfredDB v4 (8 stores)
✓ Migration auto V1 → V2
✓ Settings persistés
✓ APIBridge (Mistral, clé via cookie/localStorage)
✓ Theme engine + 3 thèmes (cyber, midnight, light)
✓ Densités (compact / normal / spacious)
✓ Multi-onglets (Phase 3)
✓ Système d'agents + @ mention (Phase 4)
✓ Mémoire documentaire indexée + édition par les agents (Phase 5 / v6)
✓ **Pipeline fichiers — drag-and-drop, parsing PDF/DOCX/TXT/MD/CSV/JSON,
   segmentation token-aware, résumé chunké → injection mémoire (Phase 6 / v7)**

Phases suivantes : voir [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Arborescence

```
alfred/
├── index.html              ← point d'entrée à ouvrir via le serveur HTTP
├── modules/
│   ├── app.js              ← bootstrap
│   ├── core/               ← event-bus, logger, db, db-migrate, settings, api-bridge
│   ├── chat/               ← Phase 2
│   ├── tabs/               ← Phase 3
│   ├── agents/             ← Phase 4
│   ├── memory/             ← Phase 5 / v6
│   ├── files/              ← Phase 6 / v7 (upload, parser, segmenter, summarizer, pipeline)
│   └── ui/                 ← theme-engine, toast, sanitize, devtools
├── themes/                 ← _base, cyber/midnight/light, chat, tabs, devtools,
│                              agents, memory, files
├── tests/test-checklist.md ← tests manuels à cocher (incluant v7 / Phase 6)
└── docs/                   ← SPECIFICATION, SUPERVISION, ARCHITECTURE, CHANGELOG
```

## Compatibilité V1

- Cookie `mistral_api_key` lu en priorité (fallback `localStorage`)
- IndexedDB `VOANH_AI_DB` lue puis copiée vers `AlfredDB` (jamais supprimée)
- Flag `settings.migrated_v2 = true` après migration réussie
