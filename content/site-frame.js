// Runs in the sites Website widgets show: registered for those sites only (website-widget.js
// keeps the list), and Chrome injects it only where the extension has access. A frame on
// another site hides its address from the page around it, so this tells the widget which page
// the frame is on, on load and whenever the address changes in place. Nothing happens anywhere
// but a frame of this extension's own page.

(() => {
  const parent = location.ancestorOrigins?.[0];
  if (window.top === window || parent !== `chrome-extension://${chrome.runtime.id}`) return;
  const report = () => window.parent.postMessage({ type: 'newtab:site-page', url: location.href }, parent);
  report();
  globalThis.navigation?.addEventListener('currententrychange', report);
})();
