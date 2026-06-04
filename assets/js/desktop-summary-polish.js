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
      html:not(.capacitor-android) .fixtures,
      html:not(.capacitor-android) .prediction-summary-list {
        width: 100% !important;
        max-width: none !important;
      }

      html:not(.capacitor-android) .fixture-row,
      html:not(.capacitor-android) .summary-fixture-row {
        width: 100% !important;
        max-width: none !important;
        min-height: 42px !important;
        grid-template-columns: 76px minmax(0, 1fr) 228px !important;
        gap: 8px !important;
        align-items: center !important;
        justify-self: stretch !important;
      }

      html:not(.capacitor-android) .fixture-main {
        width: 100% !important;
        max-width: none !important;
        margin-inline: 0 !important;
        grid-template-columns: minmax(180px, 1fr) 46px 18px 46px minmax(180px, 1fr) !important;
        gap: 6px !important;
        justify-self: stretch !important;
      }

      html:not(.capacitor-android) .summary-fixture-main {
        width: 100% !important;
        max-width: none !important;
        margin-inline: 0 !important;
        display: grid !important;
        grid-template-columns: minmax(180px, 1fr) 46px 18px 46px minmax(180px, 1fr) !important;
        gap: 6px !important;
        align-items: center !important;
        justify-self: stretch !important;
        min-width: 0 !important;
        overflow: visible !important;
      }

      html:not(.capacitor-android) .summary-fixture-main .fixture-team.home {
        grid-column: 1 !important;
        text-align: right !important;
      }

      html:not(.capacitor-android) .summary-fixture-main .summary-score {
        grid-column: 2 / 5 !important;
        justify-self: center !important;
        width: 110px !important;
        min-width: 110px !important;
        min-height: 30px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        font-size: 1rem !important;
        line-height: 1 !important;
        font-weight: 950 !important;
        color: #fff !important;
        background: rgba(17, 7, 38, 0.76) !important;
        border: 1px solid rgba(216, 180, 254, 0.42) !important;
        border-radius: 14px !important;
        padding: 5px 10px !important;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 14px rgba(216,180,254,0.18) !important;
      }

      html:not(.capacitor-android) .summary-fixture-main .fixture-team.away {
        grid-column: 5 !important;
        text-align: left !important;
      }

      html:not(.capacitor-android) .fixture-team,
      html:not(.capacitor-android) .summary-fixture-main .fixture-team {
        min-width: 0 !important;
        max-width: 100% !important;
        overflow: visible !important;
        text-overflow: clip !important;
        white-space: nowrap !important;
        font-size: 14px !important;
        line-height: 1.08 !important;
        font-weight: 900 !important;
      }

      html:not(.capacitor-android) .fixture-meta {
        display: grid !important;
        grid-template-columns: minmax(150px, 1fr) auto !important;
        gap: 8px !important;
        align-items: center !important;
        justify-content: stretch !important;
        min-width: 0 !important;
        width: 100% !important;
      }

      html:not(.capacitor-android) .fixture-lock {
        min-width: 0 !important;
        width: 100% !important;
        font-size: 12px !important;
        text-align: right !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: clip !important;
      }

      html:not(.capacitor-android) .fixture-effects {
        position: static !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 4px !important;
        min-width: 30px !important;
      }

      html:not(.capacitor-android) .power-marker,
      html:not(.capacitor-android) .curse-marker,
      html:not(.capacitor-android) .super-marker {
        position: static !important;
        width: 26px !important;
        height: 26px !important;
        min-width: 26px !important;
        min-height: 26px !important;
        transform: none !important;
        margin: 0 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

injectDesktopSummaryPolish();
window.addEventListener('resize', injectDesktopSummaryPolish);
