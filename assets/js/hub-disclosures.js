/* Keep native details/summary semantics; animate only the two Hub disclosures. */
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-hub-disclosure]').forEach(details => {
    const summary = details.querySelector('summary');
    if (!summary || typeof details.animate !== 'function') return;
    let animation = null;
    let expanded = details.open;
    function settle() {
      const previous = animation;
      animation = null;
      previous?.cancel();
      details.open = expanded;
      details.style.height = '';
      details.removeAttribute('data-expanding');
    }
    summary.addEventListener('click', event => {
      event.preventDefault();
      const startHeight = details.getBoundingClientRect().height;
      if (!animation) expanded = details.open;
      expanded = !expanded;
      const previous = animation;
      animation = null;
      previous?.cancel();
      if (reducedMotion.matches) { settle(); return; }
      details.style.height = '';
      // Measure the natural destination before opening for the animation.
      details.open = expanded;
      const endHeight = details.getBoundingClientRect().height;
      details.open = true;
      details.dataset.expanding = String(expanded);
      details.style.height = `${startHeight}px`;
      animation = details.animate(
        { height: [`${startHeight}px`, `${endHeight}px`] },
        { duration: 240, easing: 'cubic-bezier(.22,.75,.25,1)', fill: 'forwards' }
      );
      const current = animation;
      current.onfinish = () => { if (animation === current) settle(); };
    });
    // Release explicit height if layout/preferences change during the slide.
    window.addEventListener('resize', () => { if (animation) settle(); }, { passive: true });
    reducedMotion.addEventListener('change', () => { if (animation) settle(); });
    window.addEventListener('pagehide', settle);
  });
})();
