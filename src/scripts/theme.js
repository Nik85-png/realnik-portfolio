// Theme controller — light-cream default, persistent dark toggle.
// First visit: prefers-color-scheme. Later visits: localStorage wins.
(function () {
  const KEY = 'realnik-theme';
  const root = document.documentElement;

  function resolve() {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function broadcast(theme) {
    // Keep embedded Card Lab viewers in sync with the page theme.
    document.querySelectorAll('iframe[src*="/cards-viewer/"]').forEach((frame) => {
      const send = () => {
        try {
          frame.contentWindow.postMessage({ type: 'card-theme', value: theme }, window.location.origin);
        } catch (_) {}
      };
      if (frame.contentWindow) send();
      // The iframe may still be loading — send again once it reports ready.
      if (!frame.dataset.themeListener) {
        frame.dataset.themeListener = '1';
        frame.addEventListener('load', () => {
          send();
          setTimeout(send, 400); // after the viewer's own init() runs
        });
      }
    });
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#111416' : '#F2EFE8');
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      const label = btn.querySelector('[data-theme-label]');
      if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
    });
    broadcast(theme);
  }

  apply(resolve());

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-toggle');
    if (!btn) return;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    apply(next);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem(KEY)) apply(resolve());
  });
})();
