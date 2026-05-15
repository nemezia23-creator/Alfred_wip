# Test checklist — Phase 1

> Tests manuels (pas de framework). À cocher avant de passer à Phase 2.
>
> **Avant de commencer** : assure-toi d'avoir lancé Alfred en suivant les 3 étapes du [README](../README.md#-démarrer-alfred-en-3-étapes-zéro-connaissance-technique). Si tu vois "Your app will live here" → tu es sur la preview Lovable, pas sur Alfred. Relis le README.

## Pré-requis (à valider en premier)

- [ ] J'ai ouvert un terminal **dans le dossier `alfred/`** (pas à la racine)
- [ ] La commande `python3 -m http.server 8080` (ou équivalent) tourne, terminal ouvert
- [ ] J'accède à `http://localhost:8080` dans le navigateur (PAS la preview Lovable)
- [ ] La page n'est pas blanche : je vois la barre **ALFRED** en haut et un panneau "Système initialisé"

## Boot

- [ ] `python3 -m http.server 8080` dans `alfred/`, ouvrir `http://localhost:8080`
- [ ] La page se charge sans erreur dans la console
- [ ] Boot log affiche : settings → DB → migration → thème → prêt
- [ ] `#footer-db` montre les compteurs des 8 stores
- [ ] `#footer-api` indique l'état de la clé Mistral

## Thèmes

- [ ] Switcher entre cyber / midnight / light met à jour la page sans reload
- [ ] Le choix persiste après un refresh (lu depuis `settings`)
- [ ] Switcher de densité change `--msg-padding` (vérifiable au DevTools)

## Settings + DB

- [ ] DevTools → Application → IndexedDB → `AlfredDB` v4 contient les 8 stores
- [ ] `settings` contient au moins `theme`, `density`, `migrated_v2`
- [ ] Refresh : tout est rechargé

## Migration V1

Cas A — pas de `VOANH_AI_DB` :
- [ ] Boot log : `pas de données V1 à migrer`
- [ ] `migrated_v2 = true` posé

Cas B — avec `VOANH_AI_DB` v3 préexistante :
- [ ] Boot log : `migration OK (chats:N, agents:N, ...)`
- [ ] `AlfredDB.chats/agents/memories/settings` contiennent les données
- [ ] `VOANH_AI_DB` non supprimée (toujours visible en DevTools)
- [ ] Refresh : pas de re-migration (idempotence)

## API key

- [ ] Click sur "⚙ Réglages" → prompt
- [ ] Saisir une clé bidon → footer passe à `Mistral ✓`
- [ ] Refresh → clé toujours présente (cookie)
- [ ] Effacer DevTools cookies → clé absente
- [ ] Vérifier qu'aucun log console ne contient la clé en clair

## EventBus

Dans la console :
```js
Alfred.bus.on('boot:ready', () => console.log('READY'));
```
- [ ] Recharger → "READY" affiché

---

# Test checklist — Phase 2

## Chat de base

- [ ] Saisir un message + Entrée → message user affiché, réponse Alfred streamée token par token
- [ ] Maj+Entrée insère un saut de ligne sans envoyer
- [ ] Compteur "N car · ~M tok" se met à jour en tapant
- [ ] Sélecteur de modèle change `chat.model` (persisté après refresh)
- [ ] Sans clé API → toast d'erreur, pas d'envoi

## Streaming & contrôle

- [ ] Bouton "■ Stop" apparaît pendant la génération, disparaît à la fin
- [ ] Stop interrompt et conserve le contenu partiel marqué `[interrompu]`
- [ ] Erreur 401 → toast "Clé API invalide…"
- [ ] Erreur réseau → toast lisible

## Rendu markdown

- [ ] Bloc ```js …``` rendu avec fond, mono, bouton "copy" fonctionnel
- [ ] **gras**, *italique*, `code inline`, listes, blockquotes, headings rendus
- [ ] XSS test : envoyer `<img src=x onerror=alert(1)>` → texte affiché tel quel, pas d'alerte

## Persistance

- [ ] Refresh → conversation restaurée (messages + ratings)
- [ ] DevTools IndexedDB `AlfredDB.chats` contient les messages

## Actions message

- [ ] Hover message → barre d'actions visible
- [ ] Copier → toast "Copié."
- [ ] Note ★ persistée (re-cliquer même note = retire)
- [ ] Éditer un message user → tronque la suite et relance Alfred
- [ ] Regénérer un message Alfred → supprime et relance
- [ ] Supprimer un message → confirmation + retiré

## Export / Reset

- [ ] Export .md télécharge un fichier lisible avec horodatages
- [ ] Export .txt fonctionne
- [ ] "⟲ Nouveau" → confirmation + chat vidé

---

# Test checklist — Phase 3 (Multi-onglets)

## Création / fermeture

- [ ] Au premier boot, un onglet "Conversation 1" existe par défaut
- [ ] Bouton `+` → crée un nouvel onglet, switch automatique dessus
- [ ] `Ctrl/Cmd + N` → idem (peut être intercepté par le navigateur)
- [ ] `Alt + N` → idem (toujours fonctionnel)
- [ ] Bouton `×` sur un onglet → confirmation puis fermeture
- [ ] Middle-click sur un onglet → confirmation puis fermeture
- [ ] `Alt + W` → ferme l'onglet actif
- [ ] Fermer le dernier onglet → un nouvel onglet vide est recréé
- [ ] Au-delà de `max_tabs` (default 20), le plus ancien non-épinglé est archivé

## Switch / cycle

- [ ] Click sur un onglet → switch, le chat affiche les messages de ce tab
- [ ] `Alt + →` cycle vers l'onglet suivant
- [ ] `Alt + ←` cycle vers l'onglet précédent
- [ ] `Ctrl/Cmd + Tab` cycle (si non intercepté par le navigateur)
- [ ] Streaming en cours → switch d'onglet : la génération est interrompue proprement

## Rename / pin / reorder

- [ ] Double-click sur un titre → prompt de renommage → persiste après refresh
- [ ] Right-click → menu (1=pin, 2=rename, 3=close)
- [ ] Onglet épinglé : pas de bouton ×, refus de fermeture
- [ ] Drag-and-drop entre onglets → l'ordre est persisté après refresh

## Auto-titre

- [ ] Sur un onglet "Conversation N", le premier message user (>0 char) renomme
      l'onglet (≤30 chars)
- [ ] Si l'onglet a déjà été renommé manuellement, l'auto-titre n'écrase rien

## Isolation

- [ ] Les messages d'un onglet n'apparaissent pas dans un autre
- [ ] DevTools → Database → `chats` : chaque message a `chatId === tab.id`
- [ ] DevTools → Database → `tabs` : la liste reflète l'UI

## Persistance / restauration

- [ ] Refresh → tous les onglets reviennent dans le même ordre
- [ ] L'onglet actif au moment du refresh est restauré
- [ ] `settings.tabs.activeId` = id de l'onglet actif (vérifiable DevTools)

## Anti-nouvelle-fenêtre

- [ ] Dans la console : `window.open('https://example.com')` → toast info
      "Alfred fonctionne en onglets…", retourne `null`, n'ouvre rien

## EventBus

- [ ] `Alfred.bus.on('tab:switched', console.log)` puis click sur un onglet → log
- [ ] `tab:created`, `tab:closed`, `tab:updated` émis aux bons moments

---

# Phase 4 — Système d'agents

## Boot & seed

- [ ] Premier boot d'une DB vierge → 4 agents créés automatiquement
      (Généraliste, CodeForge, WriterPro, ResearchBot), `settings.agents_seeded = true`
- [ ] Reboot → pas de re-seed (idempotence)
- [ ] DevTools → Database → `agents` contient bien les 4 lignes avec `version: 2`

## Ouverture du gestionnaire

- [ ] Bouton header `◈ Agents` ouvre la modal
- [ ] La liste de gauche affiche les 4 agents, leur couleur en bord gauche
- [ ] Click sur un agent affiche le formulaire d'édition à droite
- [ ] `Escape` ferme la modal ; click hors de la carte ferme aussi

## CRUD

- [ ] Bouton `+ Nouveau` ouvre un formulaire vide
- [ ] Soumettre sans nom → erreur visible (toast rouge)
- [ ] Créer un agent valide → apparaît dans la liste, toast succès
- [ ] Éditer un agent existant → enregistre, le toast s'affiche, la modale reste
- [ ] Dupliquer → crée une copie suffixée `(copie)` en `draft`
- [ ] Archiver → l'agent passe en `archived`, il disparaît du sélecteur de la
      toolbar mais reste visible (grisé) dans la modal
- [ ] Désarchiver → repasse en `active`
- [ ] Supprimer → confirmation puis disparition de la liste et de la DB

## Import / export

- [ ] Export JSON → télécharge un `.agent.json` valide
- [ ] Import du même fichier → crée un nouvel agent (nouvel id), nom suffixé
      manuellement si conflit (sinon erreur affichée)

## Sélecteur dans le chat

- [ ] La toolbar du chat affiche un select avec « — sans agent — » + les agents
      actifs
- [ ] Sélectionner un agent persiste sur l'onglet (refresh → toujours actif)
- [ ] Switch d'onglet → le sélecteur reflète l'agent du nouvel onglet

## System prompt effectif

- [ ] Avec un agent sélectionné, envoyer un message →
      DevTools → onglet EventBus / Logs → l'API reçoit un `system` construit à
      partir du `name`, `role`, `instructions`, `style`, `forbidden`, `tags`
- [ ] Sans agent, le system prompt est celui de `chat.system_prompt` (settings)
      ou aucun si vide
- [ ] La température et `max_tokens` envoyés correspondent à ceux de l'agent
- [ ] Si `modelPref` est défini sur l'agent, c'est ce modèle qui est utilisé
      (et non celui du select de la toolbar)

## @ Mention dropdown

- [ ] Taper `@` dans le textarea ouvre le dropdown
- [ ] Taper `@cod` filtre sur "CodeForge"
- [ ] `↑/↓` navigue, `Entrée` insère `@CodeForge ` et lie l'onglet à cet agent
- [ ] `Échap` ferme le dropdown sans rien insérer
- [ ] Click souris sur un item équivaut à Entrée

## Compatibilité

- [ ] Anciens agents V1 sans `version` → migrés silencieusement au prochain boot
- [ ] Aucun agent supprimé par la migration

## EventBus

- [ ] `Alfred.bus.on('agent:created', console.log)` puis création → log
- [ ] `agent:updated` / `agent:deleted` émis aux bons moments

---

# Test checklist — v6 (correctifs UX + mémoire éditable par les agents)

## DevTools — Logs généraux

- [ ] Onglet **Logs** : la zone occupe toute la largeur disponible
- [ ] Chaque ligne aligne ts / niveau / namespace / message en colonnes
- [ ] Les longues lignes sont cliquables → `<details>` révèle le payload complet
- [ ] Fond lisible (pas noir profond), texte contraste correct sur cyber/midnight/light

## DevTools — EventBus

- [ ] Onglet **EventBus** : même mise en page lisible que les Logs (pas de fond noir)
- [ ] Colonnes alignées : ts / type / payload résumé
- [ ] Click sur une ligne → `<details>` montre le payload JSON complet
- [ ] Le filtre `chat:streaming` fonctionne toujours

## Mémoire — saisie manuelle

- [ ] Le textarea accepte jusqu'à **10 000** caractères (limite remontée depuis 5 000)
- [ ] Un compteur **N/10000** apparaît sous l'invite et s'incrémente en tapant
- [ ] À ≥ 90 % de la limite, le compteur passe en orange
- [ ] À 100 %, le compteur passe en rouge ; pas de troncature silencieuse
- [ ] Tenter de coller > 10 000 caractères → bloqué par `maxlength` (pas de perte silencieuse)

## Mémoire — filtres

- [ ] Champ **Tag…** visible dans la toolbar, filtre la liste à la frappe
- [ ] Plusieurs tags séparés par virgule fonctionnent (OR)
- [ ] Curseur **conf ≥ N%** visible, ajuste dynamiquement la liste et affiche le % live
- [ ] À conf = 0 %, aucune mémoire n'est filtrée
- [ ] Filtres tag + confiance + type/source/statut se combinent

## Mémoire — recherche

- [ ] Recherche d'**1 caractère** retourne des résultats (anciennement il fallait ≥ 4)
- [ ] Recherche d'2-3 caractères : résultats par sous-chaîne quand le tokenizer ne matche pas
- [ ] Les résultats sont **classés** : score décroissant, puis date décroissante (les plus récents en haut à score égal)
- [ ] Une recherche vide retourne la liste complète triée par date

## Mémoire — édition par les agents

- [ ] Sélectionner un agent dans un onglet, lui demander : « Mémorise que je préfère le vouvoiement. »
- [ ] L'agent émet une balise `<memory:create …>` qui est **exécutée** (toast « Mémoire : 1 opération appliquée »)
- [ ] La balise est remplacée dans la réponse par `_[mémoire créée · …]_`
- [ ] La nouvelle entrée apparaît dans le module Mémoire avec `source: agent`
- [ ] Demander « Modifie la mémoire m_xxx avec ce nouveau contenu » → exécution `update`
- [ ] Demander « Supprime la mémoire m_xxx » → exécution `delete`, l'entrée disparaît
- [ ] Le bloc « MÉMOIRE PERTINENTE » injecté en system prompt contient `[id:m_xxx]` pour chaque entrée (vérifiable DevTools → EventBus si log activé)
- [ ] Setting `memory.tools = false` désactive l'injection des instructions d'écriture

---

# Test checklist — v7 / Phase 6 — Pipeline fichiers

## Upload (drag-and-drop + bouton 📎)

- [ ] La barre d'input affiche le bouton **📎** à gauche de « Envoyer »
- [ ] Glisser un fichier `.txt` sur la zone d'input → contour pointillé accent visible
- [ ] Drop → toast de progression `📥 fichier.txt : extraction…` puis `✂ segmentation…` puis `✨ extrait i/N…`
- [ ] Click sur 📎 → sélecteur natif, multi-sélection autorisée
- [ ] Drop d'un fichier de type non supporté (`.png`) → toast rouge « Type non supporté »
- [ ] Drop d'un fichier > 20 Mo → toast rouge « Fichier trop volumineux »
- [ ] Le bandeau `#chat-file-status` sous l'input affiche les étapes en live, puis se vide après 4 s

## Parsing par format

- [ ] `.txt` / `.md` / `.csv` : extrait conservé tel quel
- [ ] `.json` : pretty-printé (indenté 2 espaces)
- [ ] `.pdf` : PDF.js téléchargé depuis le CDN au 1er import (DevTools → Network),
      texte extrait avec marqueurs `--- page N ---`
- [ ] `.docx` : mammoth chargé via CDN, texte brut extrait
- [ ] Un PDF scanné (image-only) renvoie un texte vide → status `parsed`, pas de crash

## Segmentation

- [ ] DevTools → Database → `files` : chaque enregistrement contient `chunks: [{i, text, tokens}]`
- [ ] Pour un texte de ~ 5000 caractères : 2-3 chunks (avec overlap)
- [ ] Settings `files.chunkTokens = 200` → re-import : nombre de chunks plus élevé

## Résumé + mémoire

- [ ] Avec une clé Mistral valide : N entrées `memories` créées (N = nombre de chunks)
      + 1 entrée `type:summary` agrégée
- [ ] Chaque mémoire a `source: 'file'`, tags `['file', '<ext>']`, `meta.fileId` pointe vers
      l'enregistrement `files`
- [ ] Sans clé Mistral : le fichier passe en `status: 'parsed'`, AUCUNE mémoire créée,
      pas d'erreur
- [ ] Setting `files.autoSummarize = false` : skip du résumé, toast « Fichier importé »
- [ ] Modal Mémoire : les nouvelles entrées apparaissent, type `document` / `summary` visible

## Robustesse

- [ ] Couper la connexion en plein résumé → l'erreur est captée, le fichier passe en `status: 'error'`
      (champ `error` rempli), toast rouge
- [ ] Ré-importer le même fichier deux fois → 2 enregistrements distincts (id différent),
      doublon de mémoires (comportement attendu, pas de dédup auto)
- [ ] Supprimer une mémoire issue d'un fichier dans la modal Mémoire → la mémoire disparaît
      mais le fichier reste dans `files` (lien orphelin toléré)

## EventBus

- [ ] `Alfred.bus.on('file:uploaded', console.log)` → log à chaque drop accepté
- [ ] `Alfred.bus.on('file:parsed', console.log)` → log avec `{ name, mime, size, ext, length }`

---

# Test checklist — v8 / Phase 7 — Réglages + outils agents + correctifs

## Panneau Réglages (nouveau)

- [ ] Bouton « ⚙ Réglages » du header ouvre une modal (plus le `prompt()`)
- [ ] Onglets : Général, API, Chat, Mémoire, Agents, Fichiers
- [ ] Onglet **Mémoire** : toggles `memory.inject` et `memory.tools` visibles, fonctionnels
- [ ] Onglet **Agents** : toggle `agents.tools` visible, fonctionnel
- [ ] Onglet **Fichiers** : toggles `attachToChat`, `autoSummarize`, `perChunkMemory` + tailles
- [ ] Onglet **API** : saisie + effacement de la clé Mistral, footer mis à jour
- [ ] Toute modification émet un toast ✓ et persiste après refresh

## Mémoire — suppression par l'agent (correctif)

- [ ] Demander : « Supprime la mémoire m_xxx » → la balise `<memory:delete id="m_xxx"/>`
      est effectivement exécutée et l'entrée disparaît de la modal Mémoire
- [ ] Idem avec guillemets simples : `<memory:delete id='m_xxx'/>`
- [ ] Idem en forme non-auto-fermante : `<memory:delete id="m_xxx"></memory:delete>`

## DevTools — EventBus (correctif)

- [ ] Ouvrir DevTools APRÈS avoir envoyé plusieurs messages → l'onglet EventBus
      affiche bien les événements émis avant l'ouverture (capture démarrée au boot)
- [ ] Le filtre `chat:streaming` reste muet par défaut

## Pipeline fichiers — drop = pièce jointe (correctif)

- [ ] Drop d'un `.txt` : il apparaît comme chip « 📎 nom (taille) » sous l'input,
      PAS dans la mémoire automatiquement
- [ ] Bouton « ✦ Mémoriser » sur la chip → déclenche le pipeline Phase 6
- [ ] Bouton « ✕ » → retire la pièce jointe sans mémoriser
- [ ] Cliquer « Envoyer » : le contenu du fichier est inliné dans le message user
      (visible dans la bulle), l'agent reçoit le texte
- [ ] La bulle user affiche le chip 📎 au-dessus du contenu
- [ ] Désactiver `files.attachToChat` dans Réglages → drop ingère immédiatement (ancien comportement)

## Pipeline fichiers — explosion des mémoires (correctif)

- [ ] PDF de 2 pages → 1 seule mémoire `type:summary` créée (avant : ~9)
- [ ] Activer `files.perChunkMemory` dans Réglages → comportement Phase 6 restauré
      (1 mémoire par chunk + 1 globale)
- [ ] `files.chunkTokens` par défaut = 2000 (vérifiable dans Réglages → Fichiers)

## Outils agents (nouveau)

- [ ] Demander à un agent : « Crée un nouvel agent expert en cuisine »
- [ ] L'agent émet `<agent:create name="..." role="..." ...>instructions</agent:create>`
- [ ] La balise est remplacée par `_[agent créé · Nom · ag_xxx]_`
- [ ] Le nouvel agent apparaît dans le sélecteur du chat et dans le gestionnaire
- [ ] Toast « Agents : 1 opération appliquée »
- [ ] Demander « Modifie l'agent ag_xxx, change son rôle » → exécution `update`
- [ ] Demander « Archive l'agent ag_xxx » → exécution `archive`
- [ ] Désactiver `agents.tools` dans Réglages → l'agent ne reçoit plus les
      instructions, ne sait plus créer d'agents

## Phase 8 — v9

- [ ] Boutons ▲ / ▼ visibles à droite de la conversation, défilent en haut/bas.
- [ ] Une réponse en cours continue après changement d'onglet ; revenir sur l'onglet d'origine montre la réponse complète.
- [ ] Fermer l'onglet d'origine pendant un stream l'annule proprement.
- [ ] Glisser un fichier seul ne déclenche pas l'envoi ; il faut taper un prompt.
- [ ] Bouton « ✦ Mémoriser » sur une pièce jointe : fonctionne avec ET sans clé API (création d'une mémoire `document`).
- [ ] Agent peut supprimer une mémoire ancienne (id récupéré du bloc « MÉMOIRES RÉCENTES »). Si l'id est faux, message d'échec explicite.
- [ ] Onglet EventBus du DevTools affiche soit des événements, soit le message « aucun événement capturé ». Plus de page blanche.
- [ ] Agent peut créer un agent plusieurs fois de suite (vérifier dans ◈ Agents).
