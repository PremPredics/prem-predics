(function () {
  window.syncDiscardCardSize = function () {
    const tile = document.querySelector('.hand .card-tile');
    const pile = document.getElementById('discardPile');
    if (!tile || !pile) return;
    const size = tile.getBoundingClientRect();
    if (!size.width || !size.height) return;
    const style = getComputedStyle(tile);
    const extraWidth = style.boxSizing === 'border-box' ? 0 : parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const extraHeight = style.boxSizing === 'border-box' ? 0 : parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    pile.style.setProperty('--hand-card-width', `${parseFloat(style.width) + extraWidth}px`);
    pile.style.setProperty('--hand-card-height', `${parseFloat(style.height) + extraHeight}px`);
    pile.style.setProperty('--hand-card-padding', style.padding);
    pile.style.setProperty('--hand-card-radius', style.borderRadius);
    pile.style.setProperty('--hand-card-border', style.borderTopWidth);
  };
  if (typeof addEventListener === 'function') addEventListener('resize', () => requestAnimationFrame(window.syncDiscardCardSize));
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.ppCardTitle = function (name) {
    const match = String(name).match(/^(Power|Curse|Super)\s+(?:(of(?:\s+the)?)\s+)?(.+)$/i);
    if (!match) return escape(name);
    return `<span class="pp-card-title"><span class="pp-card-category">${escape(match[1].toUpperCase())}</span>${match[2] ? `<span class="pp-card-connector">${escape(match[2].replace(/\b\w/g, c => c.toUpperCase()))}</span>` : ''}<span class="pp-card-name">${escape(match[3])}</span></span>`;
  };
})();
