# Alfred Project — Supervision Agents

Ce fichier définit les agents spécialisés nécessaires à la supervision totale du projet Alfred (Agent OS).

## Agents de Supervision

### 1. 🏗️ Architect — `alfred-architect`
- **Rôle :** Garde-fou de l'architecture. Valide que chaque PR respecte la modularité, les dépendances unidirectionnelles, et la compatibilité ascendante.
- **Responsabilités :**
  - Review de chaque nouveau module : vérifie qu'il n'introduit pas de dépendance circulaire
  - Valide le schema IndexedDB avant chaque modification
  - Vérifie que les CSS custom properties sont utilisées (pas de valeurs codées en dur)
  - Assure que l'importmap reste cohérent
- **Actions automatisées :**
  - Lint de la structure de dossiers
  - Génération du dependency graph
  - Vérification de compatibilité navigateur

### 2. 🔍 Code Reviewer — `alfred-reviewer`
- **Rôle :** Revue de code systématique sur chaque changement. Détecte les bugs, les vulnérabilités, les anti-patterns.
- **Responsabilités :**
  - Code review sur les diffs (qualité, performance, sécurité)
  - Détection de memory leaks (closures, event listeners non nettoyés)
  - Vérification des try-catch sur les opérations IndexedDB
  - Validation des sanitize/escape HTML (XSS prevention)
- **Focus :**
  - Performance (pas de re-render inutile)
  - Sécurité (pas de innerHTML non-sanitized)
  - Accessibilité (ARIA labels, keyboard navigation)

### 3. 🧪 QA Lead — `alfred-qa`
- **Rôle :** Gestion de la qualité et des tests. Maintient la matrice de test et vérifie les régressions.
- **Responsabilités :**
  - Matrice de test couvrant chaque feature de la SPECIFICATION.md
  - Tests de migration V1 → V2 (edge cases)
  - Tests responsive (mobile, tablet, desktop)
  - Performance benchmarks (nombre de tabs, taille mémoire, Lighthouse score)
  - Checklist de compatibilité navigateur

### 4. 📋 Project Manager — `alfred-pm`
- **Rôle :** Suivi du planning, des livrables et des dépendances entre phases.
- **Responsabilités :**
  - Tracking des tâches par phase (cf Phase 1-8 dans SPECIFICATION.md)
  - Identification des blockers et des risques
  - Mise à jour du statut de chaque tâche (TODO / IN PROGRESS / DONE / BLOCKED)
  - Coordination entre agents de supervision
- **Outputs :**
  - Rapport hebdomadaire de progression
  - Risk assessment continu
  - Priorisation des tâches en cas de retard

### 5. 🎨 UX Guardian — `alfred-ux`
- **Rôle :** Garant de l'expérience utilisateur. Veille à la cohérence visuelle et à la friction minimale.
- **Responsabilités :**
  - Validation de chaque composant UI contre le Design System (Section 3)
  - Vérification des animations (pas de jank, respect prefers-reduced-motion)
  - Audit des contrastes et de la lisibilité
  - Test des flows critiques (Section 6) end-to-end
  - Vérification de la responsive design à chaque breakpoint

### 6. 🔐 Security Warden — `alfred-security`
- **Rôle :** Sécurité de l'application. Protège contre les vulnérabilités web courantes.
- **Responsabilités :**
  - Audit XSS (sanitization de tout contenu dynamique)
  - Audit injection (JSON parsing de l'orchestrateur, prompt injection)
  - Validation que les clés API ne sont jamais loggées ou exposées
  - Vérification du Content Security Policy (si applicable)
  - Audit IndexedDB (pas de données sensibles en clair si possible)

### 7. 📊 Performance Sentinel — `alfred-perf`
- **Rôle :** Surveillance des performances. Détecte les régressions et optimise.
- **Responsabilités :**
  - Monitoring de la taille des bundles CSS/JS
  - Monitoring de la mémoire utilisée par les tabs
  - Audit des animations (60fps target)
  - Optimisation du rendu (virtual scrolling, lazy rendering)
  - Monitoring du temps de démarrage (cold start)

### 8. 📝 Doc Writer — `alfred-docs`
- **Rôle :** Documentation technique et utilisateur. Maintient la cohérence de la documentation.
- **Responsabilités :**
  - Mise à jour de SPECIFICATION.md à chaque changement majeur
  - Rédaction du CHANGELOG.md
  - Documentation des modules (JSDoc comments)
  - Guide de contribution pour les plugins futurs
  - Documentation utilisateur (guide de démarrage rapide)

---

## Supervision Workflow

```
                     ┌──────────────┐
                     │ alfred-pm    │
                     │ (Project     │
                     │  Manager)    │
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
    ┌─────────▼──────┐ ┌───▼───────┐ ┌──▼──────────┐
    │ alfred-architect│ │alfred-qa  │ │ alfred-ux   │
    │ (Architecture) │ │ (Quality)  │ │ (UX)        │
    └────────────────┘ └───────────┘ └─────────────┘
              │             │             │
    ┌─────────▼──────┐ ┌───▼───────┐ ┌──▼──────────┐
    │ alfred-reviewer│ │alfred-perf│ │ alfred-docs │
    │ (Code Review)  │ │ (Perf)    │ │ (Docs)      │
    └────────────────┘ └───────────┘ └─────────────┘
              │
    ┌─────────▼──────┐
    │ alfred-security│
    │ (Security)     │
    └────────────────┘
```

### Cycle de Supervision

1. **alfred-pm** définit les priorités et assigne les tâches
2. **alfred-architect** valide les décisions architecturales avant implémentation
3. **alfred-reviewer** review le code produit
4. **alfred-qa** teste les changements
5. **alfred-ux** valide l'expérience utilisateur
6. **alfred-security** audit la sécurité
7. **alfred-perf** vérifie les performances
8. **alfred-docs** documente les changements
9. **alfred-pm** met à jour le statut et itère
