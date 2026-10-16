// Runs before first paint: apply the last used theme so a light theme doesn't flash dark.
try {
  const mode = localStorage.getItem('newtab:mode');
  if (['light', 'dark', 'blue', 'github'].includes(mode)) document.documentElement.dataset.theme = mode;
  const plain = localStorage.getItem('newtab:plain-bg');
  if (plain) document.documentElement.style.setProperty('--plain-bg', plain);
} catch {
  // storage unavailable; the theme is applied once the store loads
}
