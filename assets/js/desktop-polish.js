function isDesktopWeb() {
  return window.matchMedia?.('(min-width: 721px)').matches
    && !document.documentElement.classList.contains('capacitor-android');
}

function injectDesktopPolishStyles() {
  if (document.getElementById('prem-predics-desktop-polish-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'prem-predics-desktop-polish-style';
  style.textContent = `
    @media (min-width: 721px) {
      html:not(.capacitor-android) body:has([data-fixtures]) .fixtures {
        display: grid;
        gap: 8px;
        justify-items: center;
      }

      html:not(.capacitor-android) body:has([data-fixtures]) .fixture-row,
      html:not(.capacitor-android) body:has([data-fixtures]) .summary-fixture-row {
        width: min(100%, 980px) !important;
        grid-template-columns: 78px minmax(0, 1fr) 148px !important;
        justify-self: center !important;
      }

      html:not(.capacitor-android) body:has([data-fixtures]) .fixture-main {
        width: 100% !important;
        max-width: 640px !important;
        margin-inline: auto !important;
        grid-template-columns: minmax(170px, 1fr) 46px 18px 46px minmax(170px, 1fr) !important;
        justify-self: center !important;
      }

      html:not(.capacitor-android) body:has([data-fixtures]) .summary-fixture-main {
        width: 100% !important;
        max-width: 560px !important;
        margin-inline: auto !important;
        grid-template-columns: minmax(190px, 1fr) 64px minmax(190px, 1fr) !important;
        justify-self: center !important;
        align-items: center !important;
      }

      html:not(.capacitor-android) body:has([data-fixtures]) .fixture-team.home,
      html:not(.capacitor-android) body:has([data-fixtures]) .summary-fixture-main span:first-child {
        text-align: right !important;
      }

      html:not(.capacitor-android) body:has([data-fixtures]) .fixture-team.away,
      html:not(.capacitor-android) body:has([data-fixtures]) .summary-fixture-main span:last-child {
        text-align: left !important;
      }

      html:not(.capacitor-android) body:has([data-fixtures]) .score-input,
      html:not(.capacitor-android) body:has([data-fixtures]) .score-separator,
      html:not(.capacitor-android) body:has([data-fixtures]) .summary-fixture-main strong {
        justify-self: center !important;
        text-align: center !important;
      }

      html:not(.capacitor-android) body:has([data-star-man-history]) .star-man-layout {
        grid-template-columns: minmax(0, 1.45fr) minmax(360px, 0.95fr) !important;
        align-items: start !important;
      }

      html:not(.capacitor-android) body:has([data-star-man-history]) .history-panel {
        min-width: 360px !important;
      }

      html:not(.capacitor-android) body:has([data-star-man-history]) .history-card-grid {
        grid-template-columns: repeat(2, minmax(150px, 1fr)) !important;
        gap: 12px !important;
        justify-items: center !important;
      }

      html:not(.capacitor-android) body:has([data-star-man-history]) .history-star-card {
        width: min(100%, 170px) !important;
        min-width: 150px !important;
        min-height: 226px !important;
        aspect-ratio: 0.72 !important;
      }

      html:not(.capacitor-android) body:has([data-star-man-history]) .history-star-name {
        font-size: 0.78rem !important;
        line-height: 1.05 !important;
      }

      html:not(.capacitor-android) body:has([data-star-man-history]) .history-star-card .player-card-photo-frame {
        top: 68px !important;
        bottom: 37px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

if (isDesktopWeb()) {
  injectDesktopPolishStyles();
}

window.addEventListener('resize', () => {
  if (isDesktopWeb()) {
    injectDesktopPolishStyles();
  }
});
