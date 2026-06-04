function isDesktopBrowserForSummaryPolish() {
  return window.matchMedia?.('(min-width: 721px)').matches
    && !document.documentElement.classList.contains('capacitor-android');
}

function injectDesktopSummaryPolish() {
  if (!isDesktopBrowserForSummaryPolish()) {
    return;
  }

  if (document.getElementById('prem-predics-desktop-summary-polish-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'prem-predics-desktop-summary-polish-style';
  style.textContent = `
    @media (min-width: 721px) {
      html:not(.capacitor-android) .summary-fixture-row {
        width: 100% !important;
        max-width: none !important;
        min-height: 38px !important;
        display: grid !important;
        grid-template-columns: 76px minmax(0, 1fr) minmax(148px, auto) !important;
        gap: 6px !important;
        align-items: center !important;
        padding: 6px 8px !important;
        justify-self: stretch !important;
        border-radius: 8px !important;
        background: rgba(17, 7, 38, 0.44) !important;
        border: 1px solid rgba(216, 180, 254, 0.2) !important;
      }

      html:not(.capacitor-android) .summary-fixture-main {
        width: 100% !important;
        max-width: none !important;
        margin-inline: 0 !important;
        display: grid !important;
        grid-template-columns: minmax(130px, 1fr) 110px minmax(130px, 1fr) !important;
        gap: 6px !important;
        align-items: center !important;
        justify-self: stretch !important;
        min-width: 0 !important;
        overflow: hidden !important;
      }

      html:not(.capacitor-android) .summary-fixture-main span {
        min-width: 0 !important;
        max-width: 100% !important;
        font-size: 0.98rem !important;
        line-height: 1.08 !important;
        font-weight: 900 !important;
        white-space: normal !important;
        word-break: normal !important;
        overflow-wrap: normal !important;
        hyphens: none !important;
      }

      html:not(.capacitor-android) .summary-fixture-main span:first-child {
        text-align: right !important;
      }

      html:not(.capacitor-android) .summary-fixture-main span:last-child {
        text-align: left !important;
      }

      html:not(.capacitor-android) .summary-fixture-main strong {
        min-width: 110px !important;
        justify-self: center !important;
        text-align: center !important;
        font-size: 1rem !important;
        line-height: 1.08 !important;
        font-weight: 950 !important;
        color: #fff !important;
        background: rgba(17, 7, 38, 0.58) !important;
        border: 1px solid rgba(216, 180, 254, 0.26) !important;
        border-radius: 999px !important;
        padding: 5px 10px !important;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 12px rgba(216,180,254,0.18) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

injectDesktopSummaryPolish();
window.addEventListener('resize', injectDesktopSummaryPolish);
