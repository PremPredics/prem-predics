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
        width: 100% !important;
        max-width: none !important;
        display: grid !important;
        grid-template-columns: 76px minmax(150px, 1fr) 46px 18px 46px minmax(150px, 1fr) 34px 150px !important;
        gap: 8px !important;
        align-items: center !important;
        position: relative !important;
        min-height: 42px !important;
        padding: 6px 8px !important;
      }

      html:not(.capacitor-android) .fixture-flags {
        grid-column: 1 !important;
        grid-row: 1 !important;
        justify-self: center !important;
        align-self: center !important;
        display: grid !important;
        gap: 2px !important;
        place-items: center !important;
        min-width: 0 !important;
        position: static !important;
        z-index: 2 !important;
      }

      html:not(.capacitor-android) .fixture-main,
      html:not(.capacitor-android) .summary-fixture-main,
      html:not(.capacitor-android) .fixture-meta {
        display: contents !important;
        position: static !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
        margin: 0 !important;
        transform: none !important;
        left: auto !important;
        top: auto !important;
      }

      html:not(.capacitor-android) .fixture-team.home,
      html:not(.capacitor-android) .summary-fixture-main .fixture-team.home {
        grid-column: 2 !important;
        grid-row: 1 !important;
        justify-self: stretch !important;
        text-align: right !important;
      }

      html:not(.capacitor-android) .fixture-main .score-input:first-of-type {
        grid-column: 3 !important;
        grid-row: 1 !important;
        justify-self: center !important;
      }

      html:not(.capacitor-android) .fixture-main .score-separator {
        grid-column: 4 !important;
        grid-row: 1 !important;
        justify-self: center !important;
        text-align: center !important;
      }

      html:not(.capacitor-android) .fixture-main .score-input:last-of-type {
        grid-column: 5 !important;
        grid-row: 1 !important;
        justify-self: center !important;
      }

      html:not(.capacitor-android) .summary-fixture-main .summary-score {
        grid-column: 3 / 6 !important;
        grid-row: 1 !important;
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
        font-weight: 950 !important;
        font-size: 1rem !important;
        line-height: 1 !important;
      }

      html:not(.capacitor-android) .fixture-team.away,
      html:not(.capacitor-android) .summary-fixture-main .fixture-team.away {
        grid-column: 6 !important;
        grid-row: 1 !important;
        justify-self: stretch !important;
        text-align: left !important;
      }

      html:not(.capacitor-android) .fixture-team {
        min-width: 0 !important;
        max-width: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        font-size: 14px !important;
        line-height: 1.08 !important;
        font-weight: 900 !important;
      }

      html:not(.capacitor-android) .fixture-effects {
        grid-column: 7 !important;
        grid-row: 1 !important;
        justify-self: center !important;
        align-self: center !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 4px !important;
        min-width: 0 !important;
        position: static !important;
        transform: none !important;
        margin: 0 !important;
      }

      html:not(.capacitor-android) .fixture-lock {
        grid-column: 8 !important;
        grid-row: 1 !important;
        min-width: 0 !important;
        width: 100% !important;
        justify-self: stretch !important;
        text-align: left !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: clip !important;
        font-size: 12px !important;
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

injectFinalDesktopPredictionPolish();
window.addEventListener('resize', injectFinalDesktopPredictionPolish);
