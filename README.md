# StackCraft Studio

> **Studio web interactif de Pseudo-3D par Sprite Stacking** (empilement de couches pixel-art 2D sans aucun mesh 3D) — 100 % HTML5 Canvas / Vanilla JS, zéro dépendance, 60+ FPS.

🔗 **Démo en ligne (GitHub Pages)** : [https://deady31.github.io/stackcraft-studio/](https://deady31.github.io/stackcraft-studio/)

---

## ✨ Fonctionnalités

- **Moteur Sprite Stacking HD pixel-perfect** (`engine.js`)
  - Échantillonnage inverse *nearest-neighbor* sans trous ni flou jusqu'en **HD 112 px** à 120–300+ FPS.
  - **Contour pixel 1px** fin, **lignes de relief interne**, **Cel-Shading 3D directionnel + Rim Light** et option **Lissage HD**.
  - **Vue éclatée (*Exploded View*)** et **coupe verticale** pour observer l'empilement couche par couche en direct.
  - **5 modes d'animation** : `Pendule`, `Toupie 360°`, `Lévitation`, `Rebond`, `Manuel`.
  - Décors (`Grille Claire`, `Studio Noir`, `Blueprint`), socle circulaire lumineux avec ombre dynamique et particules pixelisées (étincelles, pétales de sakura, runes).

- **Convertisseur Image → 3D HD instantané** (`importer.js`)
  - **Glisser-déposer**, bouton **`Image → 3D`** ou simple **`Ctrl+V`** depuis le presse-papiers.
  - Préréglages rapides **`Rétro (38px)` · `Fin (60px)` · `HD (76px)` · `Ultra (104–112px)`** avec quantification **Median-Cut** jusqu'à **96 couleurs**.
  - **Dos intelligent** (plus de visage dupliqué derrière la tête quand ton personnage tourne à 360°).
  - **Détourage auto du fond** + **baguette magique au clic** directement sur l'aperçu pour effacer les zones résiduelles.
  - **Gonflage 3D organique** (4 styles : `Peluche 3D`, `Relief Lumière`, `Figurine Épaisse`, `Révolution 360°`) en orientation **Debout (Perso)** ou **À plat (Badge)**.

- **Éditeur de couches 2D temps réel** (`editor.js`)
  - Pinceau (`1/2/3 px`), Gomme, Pot de peinture, Pipette, **Symétrie X/Y**, **Pelure d'oignon** (`Z-1` / `Z+1`), Copier couche `↑/↓`, Miroir X, palette extensible et Annuler/Rétablir (`Ctrl+Z` / `Ctrl+Y`).

- **Modèles intégrés** (`models.js`)
  - 🦈 **Requin Peluche HD** (84 couches HD · hommage Blåhaj en pendule)
  - ⛩️ **Sanctuaire Torii Kyoto** (40 couches · lanterne, bassin & sakura)
  - 🚗 **Kei Drift Rétro** (20 couches · Panda AE86)
  - 🤖 **Neko-Bot Rétro** (38 couches · robot flottant)
  - 💎 **Relique Alchimique** (42 couches · cristal facetté & runes)

- **Exports intégrés**
  - **Sprite-Sheet PNG** (bande horizontale de toutes les couches empilées)
  - **Capture PNG** du rendu
  - **Clip vidéo WebM** (boucle 4s directement depuis le canvas)
  - **Import / Export JSON** des projets

---

## 🚀 Lancer en local

Aucune installation ni étape de build requise :

1. Clone le dépôt :
   ```bash
   git clone https://github.com/Deady31/stackcraft-studio.git
   cd stackcraft-studio
   ```
2. Ouvre simplement `index.html` dans ton navigateur (ou lance un petit serveur local : `python -m http.server 8765`).

---

## ⌨️ Raccourcis clavier

| Raccourci | Action |
| --- | --- |
| **Glisser** (viewport) | Pivoter la caméra (Yaw / Pitch) |
| **Molette** | Zoom pixel |
| **`Espace`** | Lecture / Pause de l'animation |
| **`E`** | Ouvrir / Fermer l'éditeur de couches 2D |
| **`Ctrl + V`** | Coller une image → conversion 3D instantanée |
| **`↑` / `↓`** | Changer de couche Z (dans l'éditeur) |
| **`B` / `X` / `G` / `I`** | Pinceau / Gomme / Pot / Pipette |
| **`Ctrl + Z` / `Ctrl + Y`** | Annuler / Rétablir |

---

## 📁 Architecture

```text
├── index.html     # Interface du studio & panneau Image → 3D
├── styles.css     # Design responsive sombre + viewport pixel-art
├── engine.js      # Moteur de rendu Sprite Stacking & post-process outlines
├── models.js      # Générateurs procéduraux des 5 modèles empilés + JSON I/O
├── importer.js    # Convertisseur Image → Sprite-Stack 3D (détourage, K-Means, volume 3D)
├── editor.js      # Éditeur de tranches 2D avec pelure d'oignon & undo/redo
└── app.js         # Contrôleur UI, caméra, exports PNG/WebM/JSON & drag-and-drop
```

## 📄 Licence

Distribué sous licence [MIT](LICENSE).
