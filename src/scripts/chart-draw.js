// Chart draw-on: charts marked [data-chart] fade/scale in when scrolled into
// view. Actual chart libraries (Plotly) render immediately; this only choreographs
// the container so heavy charts feel intentional, not dumped.
(function () {
  const els = document.querySelectorAll('[data-chart]');
  if (!els.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('chart-on'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('chart-on');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.2 }
  );

  els.forEach((el) => io.observe(el));
})();
