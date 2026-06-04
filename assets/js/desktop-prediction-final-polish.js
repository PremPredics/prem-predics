function injectFinalDesktopPredictionPolish() {
  if (!window.matchMedia?.('(min-width: 721px)').matches) return;
  if (document.documentElement.classList.contains('capacitor-android')) return;
  if (document.getElementById('prem-predics-desktop-prediction-final-polish')) return;

  const style = document.createElement('style');
  style.id = 'prem-predics-desktop-prediction-final-polish';
  style.textContent = `
    @media (min-width: 721px) {
      html:not(.capacitor-android) .fixture-row,
      html:not(.capacitor-android) .summary-fixture-row {
        display: grid !important;
        grid-template-columns: 76px minmax(0, 1fr) 260px !important;
        gap: 8px !important;
        width: 100% !important;
        position: relative !important;
        align-items: center !important;
      }

      html:not(.capacitor-android) .fixture-flags {
        grid-column: 1 !important;
        grid-row: 1 !important;
        z-index: 3 !important;
      }

      html:not(.capacitor-android) .fixture-main,
      html:not(.capacitor-android) .summary-fixture-main {
        grid-column: 1 / -1 !important;
        grid-row: 1 !important;
        width: min(600px, calc(100% - 390px)) !important;
        min-width: 500px !important;
        max-width: 600px !important;
        margin: 0 auto !important;
        position: relative !important;
        left: auto !important;
        top: auto !important;
        transform: none !important;
        display: grid !important;
        grid-template-columns: minmax(175px, 1fr) 46px 18px 46px minmax(175px, 1fr) !important;
        gap: 6px !important;
        align-items: center !important;
        z-index: 1 !important;
        overflow: hidden !important;
      }

      html:not(.capacitor-android) .summary-fixture-main .summary-score {
        grid-column: 2 / 5 !important;
        width: 110px !important;
        min-width: 110px !important;
        min-height: 30px !important;
        justify-self: center !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(17, 7, 38, 0.76) !important;
        border: 1px solid rgba(216, 180, 254, 0.42) !important;
        border-radius: 14px !important;
        color: #fff !important;
      }

      html:not(.capacitor-android) .fixture-team.home,
      html:not(.capacitor-android) .summary-fixture-main .fixture-team.home {
        grid-column: 1 !important;
        text-align: right !important;
      }

      html:not(.capacitor-android) .fixture-team.away,
      html:not(.capacitor-android) .summary-fixture-main .fixture-team.away {
        grid-column: 5 !important;
        text-align: left !important;
      }

      html:not(.capacitor-android) .fixture-team {
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      html:not(.capacitor-android) .fixture-meta {
        grid-column: 3 !important;
        grid-row: 1 !important;
        z-index: 4 !important;
        display: grid !important;
        grid-template-columns: minmax(174px, 1fr) auto !important;
        gap: 8px !important;
        width: 100% !important;
        align-items: center !important;
      }

      html:not(.capacitor-android) .fixture-lock {
        min-width: 0 !important;
        width: 100% !important;
        text-align: right !important;
        white-space: nowrap !important;
        overflow: hidden !important;
      }

      html:not(.capacitor-android) .fixture-effects,
      html:not(.capacitor-android) .power-marker,
      html:not(.capacitor-android) .curse-marker,
      html:not(.capacitor-android) .super-marker {
        position: static !important;
        transform: none !important;
        margin: 0 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

injectFinalDesktopPredictionPolish();
window.addEventListener('resize', injectFinalDesktopPredictionPolish);
