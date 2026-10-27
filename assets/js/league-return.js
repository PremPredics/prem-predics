// Move the existing control, preserving its league URL and event handlers.
(() => {
  const back = document.querySelector('[data-league-back], [data-league-link], .back-home-btn');
  if (!back) return;
  let header = document.querySelector('body > header, .awards-header');
  if (!header) {
    const title = document.querySelector('body > h1');
    if (!title) return;
    header = document.createElement('header');
    title.before(header);
    header.append(title);
  }
  const previousParent = back.parentElement;
  // The legacy account initializer rewrites .back-home-btn with a full text label.
  // Its existing inline navigation is retained; only the obsolete styling hook goes.
  back.classList.remove('back-home-btn');
  back.classList.add('league-return-icon');
  const competitionId = new URLSearchParams(location.search).get('competition_id');
  if (competitionId && back.tagName === 'A') {
    back.href = 'league.html?competition_id=' + encodeURIComponent(competitionId);
    back.removeAttribute('aria-disabled');
  }
  back.setAttribute('aria-label', 'Back to League Hub');
  back.setAttribute('title', 'Back to League Hub');
  back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg>';
  header.classList.add('league-return-header');
  header.prepend(back);
  if (previousParent !== header && previousParent.matches('.toolbar') && !previousParent.children.length) previousParent.remove();
})();
