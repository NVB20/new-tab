// Runs before first paint: apply the last used light/dark mode so a light theme doesn't flash dark.
try {
  const mode = localStorage.getItem('newtab:mode');
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
} catch {
  // storage unavailable; the theme is applied once the store loads
}
