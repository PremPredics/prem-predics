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
        width: min(100%, 980px) !important;
        min-height: 42px !important;
        padding-block: 7px !important;
        justify-self: center !important;
      }

      html:not(.capacitor-android) .summary-fixture-main {
        width: 100% !important;
        max-width: 640px !important;
        margin-inline: auto !important;
        grid-template-columns: minmax(220px, 1fr) 72px minmax(220px, 1fr) !important;
        align-items: center !important;
        justify-self: center !important;
      }

      html:not(.capacitor-android) .summary-fixture-main span {
        font-size: 1rem !important;
        line-height: 1.12 !important;
        font-weight: 900 !important;
      }

      html:not(.capacitor-android) .summary-fixture-main span:first-child {
        text-align: right !important;
      }

      html:not(.capacitor-android) .summary-fixture-main span:last-child {
        text-align: left !important;
      }

      html:not(.capacitor-android) .summary-fixture-main strong {
        min-width: 72px !important;
        justify-self: center !important;
        text-align: center !important;
        font-size: 1.02rem !important;
        line-height: 1.12 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

injectDesktopSummaryPolish();
window.addEventListener('resize', injectDesktopSummaryPolish);
