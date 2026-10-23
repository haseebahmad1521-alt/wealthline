// Run by scripts/build-pages.mjs after `expo export` (cwd = repo root). Never edit dist/sw.js by hand.
const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');

module.exports = {
  globDirectory: 'dist',
  globPatterns: ['**/*.{html,js,css,json,png,svg,ico,ttf,woff2}'],
  globIgnores: ['sw.js', 'workbox-*.js'],
  swDest: 'dist/sw.js',
  // dist/ is served at `${base}/`, so precache URLs must carry that prefix.
  modifyURLPrefix: { '': `${base}/` },
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  navigateFallback: `${base}/index.html`,
  // Only app navigations; anything with a file extension (assets) is never answered with index.html.
  navigateFallbackAllowlist: [new RegExp(`^${base}/`)],
  navigateFallbackDenylist: [/\/[^/?]+\.[^/]+$/],
  cleanupOutdatedCaches: true,
  skipWaiting: true,
  clientsClaim: true,
};
