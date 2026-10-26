(() => {
  const toggle = document.querySelector('.league-menu-toggle');
  const menu = document.querySelector('#league-navigation');
  const header = document.querySelector('.league-menu-header');
  const shade = document.querySelector('.league-menu-shade');
  if (!toggle || !menu || !header || !shade) return;
  let opened = false;
  function position() {
    document.documentElement.style.setProperty('--league-menu-top', `${Math.max(0, header.getBoundingClientRect().bottom)}px`);
  }
  function setOpen(value, restoreFocus = false) {
    opened = value;
    position();
    toggle.setAttribute('aria-expanded', String(value));
    toggle.setAttribute('aria-label', value ? 'Close navigation menu' : 'Open navigation menu');
    menu.inert = !value;
    document.body.classList.toggle('league-menu-open', value);
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => setOpen(!opened));
  shade.addEventListener('click', () => setOpen(false, true));
  // Capture before the existing logout handler opens its confirmation dialog.
  menu.addEventListener('click', event => {
    if (event.target.closest('a,button')) setOpen(false, true);
  }, true);
  document.addEventListener('keydown', event => {
    if (opened && event.key === 'Escape') {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (opened && !menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener('focusin', event => {
    if (opened && !menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  new ResizeObserver(position).observe(header);
  window.addEventListener('resize', position, { passive:true });
  position();
})();
