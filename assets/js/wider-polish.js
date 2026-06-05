(function () {
  const STYLE_ID = 'prem-predics-wider-polish-style';

  function injectWiderPolishStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --prem-deep-purple: #2e1065;
        --prem-mid-purple: #4c1d95;
        --prem-soft-purple: rgba(216, 180, 254, 0.42);
      }

      html,
      body {
        overscroll-behavior-x: none;
      }

      :where(
        .curse-modal,
        .card-effect-modal,
        .card-preview-modal,
        .star-curse-modal,
        .player-preview-modal,
        .card-modal,
        .card-view-modal,
        .deck-choice-modal,
        .opponent-target-modal,
        .legend-modal,
        .profile-modal,
        .sign-out-dialog,
        .star-clear-dialog
      ) {
        box-sizing: border-box;
        padding:
          max(12px, env(safe-area-inset-top, 0px))
          max(12px, env(safe-area-inset-right, 0px))
          max(12px, env(safe-area-inset-bottom, 0px))
          max(12px, env(safe-area-inset-left, 0px));
      }

      :where(
        .curse-panel,
        .card-effect-panel,
        .card-preview-content,
        .card-preview-wrapper,
        .card-preview-panel,
        .card-view-panel,
        .star-curse-panel,
        .player-preview-panel,
        .opponent-target-content,
        .legend-panel,
        .profile-panel,
        .sign-out-panel,
        .star-clear-panel,
        .discard-modal-wrapper
      ) {
        box-sizing: border-box;
      }

      .curse-audit-separator {
        display: grid !important;
        place-items: center !important;
        align-self: center !important;
        justify-self: center !important;
        gap: 0 !important;
        color: #fff !important;
        line-height: 0.95 !important;
        text-align: center !important;
        white-space: normal !important;
        word-break: keep-all !important;
        overflow-wrap: normal !important;
      }

      .curse-audit-separator span {
        display: block !important;
        white-space: nowrap !important;
        word-break: keep-all !important;
        overflow-wrap: normal !important;
      }

      :where(.curse-marker, .power-marker, .super-marker, .effect-marker) {
        display: inline-grid !important;
        place-items: center !important;
        align-items: center !important;
        justify-items: center !important;
        padding: 0 !important;
        line-height: 1 !important;
        flex: 0 0 auto !important;
      }

      :where(.curse-marker, .power-marker, .super-marker, .effect-marker) > span {
        display: grid !important;
        place-items: center !important;
        width: 100% !important;
        height: 100% !important;
        line-height: 1 !important;
        transform: none !important;
      }

      :where(.curse-detail-card, .card-effect-panel, .star-curse-panel) strong,
      :where(.curse-detail-card, .card-effect-panel, .star-curse-panel) h2 {
        word-break: keep-all !important;
        overflow-wrap: normal !important;
      }

      :where(.curse-detail-card, .card-effect-panel, .star-curse-panel) p {
        word-break: normal !important;
        overflow-wrap: break-word !important;
        hyphens: none !important;
      }

      p.empty,
      div.empty,
      p.state-text:only-child,
      .section-copy {
        width: min(100%, 620px);
        margin: 10px auto;
        padding: 13px 15px;
        border: 1px solid rgba(233, 213, 255, 0.34);
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(76, 29, 149, 0.34), rgba(17, 7, 38, 0.22));
        color: #f5f3ff;
        font-weight: 850;
        text-align: center;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 22px rgba(46, 16, 101, 0.16);
      }

      td.empty {
        color: #f5f3ff !important;
        font-weight: 850 !important;
        text-align: center !important;
        padding: 16px !important;
      }

      :where(
        .toolbar a,
        .legal-nav a,
        .curse-close,
        .card-effect-back,
        .star-curse-back,
        .card-preview-close,
        .card-preview-btn,
        .modal-close,
        .player-preview-back,
        .player-preview-choose,
        .opponent-target-confirm,
        .opponent-target-cancel,
        .sign-out-actions button,
        .star-clear-actions button
      ) {
        text-decoration: none;
        -webkit-tap-highlight-color: transparent;
      }

      :where(
        .toolbar a,
        .legal-nav a,
        .curse-close,
        .card-effect-back,
        .star-curse-back,
        .card-preview-close,
        .card-preview-btn,
        .modal-close,
        .player-preview-back,
        .player-preview-choose,
        .opponent-target-confirm,
        .opponent-target-cancel,
        .sign-out-actions button,
        .star-clear-actions button
      ):focus-visible {
        outline: 3px solid rgba(255, 255, 255, 0.92);
        outline-offset: 3px;
      }

      :where(
        .toolbar a,
        .legal-nav a,
        .curse-close,
        .card-effect-back,
        .star-curse-back,
        .card-preview-close,
        .card-preview-btn,
        .modal-close,
        .player-preview-back,
        .player-preview-choose,
        .opponent-target-confirm,
        .opponent-target-cancel,
        .sign-out-actions button,
        .star-clear-actions button
      ):active {
        transform: translateY(1px);
        filter: brightness(1.06) saturate(1.08);
      }

      .star-curse-back,
      .star-curse-back:hover,
      .star-curse-back:focus,
      .star-curse-back:active {
        transform: none !important;
      }

      @media (min-width: 721px) {
        .curse-card-list .curse-card-wrap {
          display: grid !important;
          grid-template-rows: auto 1fr !important;
          align-self: stretch !important;
        }

        .curse-card-list .curse-card-played-by {
          min-height: 34px !important;
        }

        .curse-card-list:not(.audit-trail) .curse-card-wrap {
          flex: 0 0 190px !important;
          max-width: 190px !important;
        }

        .curse-card-list:not(.audit-trail) .curse-detail-card {
          width: 190px !important;
          height: 276px !important;
          min-height: 276px !important;
          max-height: 276px !important;
        }

        .curse-card-list.audit-trail {
          display: flex !important;
          flex-wrap: wrap !important;
          align-items: center !important;
          align-content: center !important;
          justify-content: center !important;
          gap: 10px !important;
          max-width: min(1420px, calc(100vw - 28px)) !important;
          overflow: visible !important;
          padding: 2px !important;
        }

        .curse-card-list.audit-trail .curse-card-wrap {
          flex: 0 0 174px !important;
          max-width: 174px !important;
        }

        .curse-card-list.audit-trail .curse-detail-card {
          width: 174px !important;
          height: 254px !important;
          min-height: 254px !important;
          max-height: 254px !important;
        }

        .curse-card-list.audit-trail .curse-audit-separator {
          flex: 0 0 34px !important;
          min-width: 34px !important;
          max-width: 34px !important;
          font-size: 0.74rem !important;
        }

        .curse-card-list.audit-trail .curse-detail-card strong {
          font-size: 0.88rem !important;
        }

        .curse-card-list.audit-trail .curse-detail-card p {
          font-size: 0.61rem !important;
          line-height: 1.18 !important;
        }
      }

      @media (max-width: 720px) {
        :where(main, .panel, .correct-panel, .league-shell, .game-card-shell, .power-cards-shell) {
          max-width: 100vw;
        }

        :where(.panel, .correct-panel, .league-card, .game-card-panel, .power-panel) {
          margin-left: auto;
          margin-right: auto;
        }

        .curse-card-list.audit-trail {
          display: flex !important;
          flex-wrap: nowrap !important;
          justify-content: flex-start !important;
          align-items: flex-start !important;
          gap: 10px !important;
          max-width: calc(100vw - 18px) !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          padding: 2px 8px 12px !important;
          scroll-snap-type: x proximity !important;
          -webkit-overflow-scrolling: touch;
        }

        .curse-card-list.audit-trail .curse-card-wrap {
          flex: 0 0 clamp(138px, calc((100vw - 62px) / 2), 176px) !important;
          max-width: clamp(138px, calc((100vw - 62px) / 2), 176px) !important;
          scroll-snap-align: end !important;
        }

        .curse-card-list.audit-trail .curse-detail-card {
          width: 100% !important;
          height: clamp(212px, 61vw, 264px) !important;
          min-height: clamp(212px, 61vw, 264px) !important;
        }

        .curse-card-list.audit-trail .curse-audit-separator {
          flex: 0 0 30px !important;
          min-width: 30px !important;
          max-width: 30px !important;
          font-size: 0.58rem !important;
        }

        .curse-card-list:not(.audit-trail) {
          justify-content: center !important;
        }

        .curse-card-list:not(.audit-trail) .curse-card-wrap {
          flex-basis: clamp(166px, 56vw, 228px) !important;
        }

        .curse-card-list:not(.audit-trail) .curse-detail-card {
          width: clamp(166px, 56vw, 228px) !important;
          height: clamp(252px, 74vw, 326px) !important;
          min-height: clamp(252px, 74vw, 326px) !important;
        }

        .curse-detail-card p {
          font-size: clamp(0.58rem, 2.1vw, 0.72rem) !important;
          line-height: 1.18 !important;
        }

        p.empty,
        div.empty,
        p.state-text:only-child,
        .section-copy {
          width: min(100%, 420px);
          padding: 11px 12px;
          font-size: 0.86rem;
          line-height: 1.25;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWiderPolishStyles, { once: true });
  } else {
    injectWiderPolishStyles();
  }
})();
