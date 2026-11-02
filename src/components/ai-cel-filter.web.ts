/**
 * The cel-shaded look for AI avatars on web (owner, Nov 2): a little colour taken out, posterized to a few tones, and
 * dark ink where the picture has strong edges (the person's outline and features). One SVG filter, added to the
 * document once, used as `filter: url(#…)`. Edges come from the photo itself; there is no person segmentation, so a
 * busy background can pick up lines too.
 */
export const AI_CEL_FILTER = 'url(#wl-ai-cel)';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0">
<filter id="wl-ai-cel" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox">
  <feGaussianBlur in="SourceGraphic" stdDeviation="0.006" result="flat"/>
  <feColorMatrix in="flat" type="saturate" values="0.6" result="tone"/>
  <feComponentTransfer in="tone" result="poster">
    <feFuncR type="discrete" tableValues="0.06 0.3 0.55 0.8 0.96"/>
    <feFuncG type="discrete" tableValues="0.06 0.3 0.55 0.8 0.96"/>
    <feFuncB type="discrete" tableValues="0.06 0.3 0.55 0.8 0.96"/>
  </feComponentTransfer>
  <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>
  <feGaussianBlur in="lum" stdDeviation="0.009" result="near"/>
  <feGaussianBlur in="lum" stdDeviation="0.02" result="wide"/>
  <!-- Difference of Gaussians on luminance (kept in alpha): positive where a pixel is darker than its surroundings. -->
  <feComposite in="wide" in2="near" operator="arithmetic" k2="1" k3="-1" result="dog"/>
  <feComponentTransfer in="dog" result="ink"><feFuncA type="linear" slope="14" intercept="-0.12"/></feComponentTransfer>
  <feFlood flood-color="#160F24" result="inkColour"/>
  <feComposite in="inkColour" in2="ink" operator="in" result="lines"/>
  <feMerge><feMergeNode in="poster"/><feMergeNode in="lines"/></feMerge>
</filter>
</svg>`;

if (typeof document !== 'undefined' && !document.getElementById('wl-ai-cel')) {
  const host = document.createElement('div');
  host.innerHTML = SVG;
  const svg = host.firstElementChild;
  if (svg) document.body.appendChild(svg);
}
