(function () {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.ppCardTitle = function (name) {
    const match = String(name).match(/^(Power|Curse|Super)\s+(?:(of(?:\s+the)?)\s+)?(.+)$/i);
    if (!match) return escape(name);
    return `<span class="pp-card-title"><span class="pp-card-category">${escape(match[1].toUpperCase())}</span>${match[2] ? `<span class="pp-card-connector">${escape(match[2].replace(/\b\w/g, c => c.toUpperCase()))}</span>` : ''}<span class="pp-card-name">${escape(match[3])}</span></span>`;
  };
})();
