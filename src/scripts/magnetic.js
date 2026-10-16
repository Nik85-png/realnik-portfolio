// Magnetic buttons — translate toward the cursor with a lerp spring, so the
// motion eases in and out instead of snapping. Disabled for touch devices
// and reduced-motion users.
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (reduced || !finePointer) return;

  const STRENGTH = 0.28;
  const EASE = 0.14; // per-frame lerp factor — lower is lazier

  document.querySelectorAll('.btn').forEach((btn) => {
    // Hand transform control to JS — drop the CSS transform transition
    // so it doesn't fight the per-frame lerp.
    btn.classList.add('magnetic');

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let raf = null;

    function tick() {
      x += (targetX - x) * EASE;
      y += (targetY - y) * EASE;

      if (Math.abs(targetX - x) < 0.05 && Math.abs(targetY - y) < 0.05) {
        x = targetX;
        y = targetY;
        raf = null;
      } else {
        raf = requestAnimationFrame(tick);
      }

      btn.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    }

    function kick() {
      if (raf === null) raf = requestAnimationFrame(tick);
    }

    btn.addEventListener('pointermove', (e) => {
      const rect = btn.getBoundingClientRect();
      targetX = (e.clientX - rect.left - rect.width / 2) * STRENGTH;
      targetY = (e.clientY - rect.top - rect.height / 2) * STRENGTH;
      kick();
    });

    btn.addEventListener('pointerleave', () => {
      targetX = 0;
      targetY = 0;
      kick();
    });
  });
})();
