// Animated count-up for stat numbers. Reads [data-count] attributes and
// animates the integer value (and optional decimals via data-decimals)
// when the element scrolls into view.
(function () {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(el) {
    const target = parseFloat(el.getAttribute('data-count'));
    const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';

    if (reduced || isNaN(target)) {
      el.textContent = prefix + target.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
      return;
    }

    const duration = 1400;
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const value = target * eased;
      el.textContent =
        prefix +
        value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) +
        suffix;
      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  if (!('IntersectionObserver' in window)) {
    els.forEach(animate);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animate(entry.target);
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.4 }
  );

  els.forEach((el) => io.observe(el));
})();
