// Nav elevation + scroll choreography.
// - Adds .is-scrolled once the page scrolls (nav gains a soft shadow).
// - Keeps the effect off for reduced-motion users.
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  let ticking = false;

  function update() {
    nav.classList.toggle('is-scrolled', window.scrollY > 8);
    ticking = false;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );

  update();
})();
