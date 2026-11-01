# Halloween Jam III

Jeu web (Phaser 4 + Vite) pour la Halloween Jam, déployé sur GitHub Pages.

**Lien jouable :** https://squidhell.github.io/HalloweenJamIII/

## Dev

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # génère dist/
```

Les assets statiques vont dans `public/assets/` et se chargent avec `assets/...`.

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` (build + publication Pages).
Réglage unique : *Settings → Pages → Source : GitHub Actions*.
