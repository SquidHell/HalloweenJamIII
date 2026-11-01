// Charge la police Waelek depuis public/fonts/ si elle est présente (sinon police de secours).
const NAMES = ['waelek', 'Waelek', 'Waelek-Regular', 'waelek-regular', 'Waelek Regular'];
const EXTS = ['ttf', 'otf', 'woff2', 'woff'];
const FILES = NAMES.flatMap((n) => EXTS.map((e) => `${n}.${e}`));

export async function loadFont() {
  if (!('FontFace' in window)) return false;
  const base = new URL('fonts/', document.baseURI).href;
  for (const file of FILES) {
    try {
      const res = await fetch(base + encodeURIComponent(file));
      const type = res.headers.get('content-type') || '';
      if (!res.ok || type.includes('text/html')) continue; // absent (404 ou fallback SPA)
      const face = new FontFace('Waelek', await res.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      return true;
    } catch (e) { /* fichier invalide : on essaie le suivant */ }
  }
  console.info('[font] Waelek introuvable dans public/fonts - police de secours utilisee.');
  return false;
}
