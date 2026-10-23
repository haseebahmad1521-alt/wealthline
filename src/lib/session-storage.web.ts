// Web: the browser's own localStorage (expo-sqlite on web needs WASM + COOP/COEP headers GitHub Pages can't set).
export const sessionStorage = typeof window === 'undefined' ? undefined : window.localStorage;
