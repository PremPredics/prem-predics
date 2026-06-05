(function () {
  const footerLinks = [
    ['Terms of Use', 'terms.html'],
    ['Privacy Policy', 'privacy.html'],
    ['Cookie Policy', 'cookies.html'],
    ['Game Rules', 'game-rules.html'],
    ['Contact', 'contact.html'],
    ['Account Deletion', 'account-deletion.html'],
  ];

  const disclaimer = 'Prem Predics is an independent private league prediction game and is not affiliated with, endorsed by, or connected to the Premier League, its clubs, or its players.';

  function injectStyles() {
    if (document.getElementById('prem-legal-footer-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'prem-legal-footer-styles';
    style.textContent = `
      footer.prem-legal-footer {
        display: grid !important;
        gap: 10px !important;
        justify-items: center !important;
        padding: 22px 16px calc(22px + env(safe-area-inset-bottom, 0px)) !important;
        margin-top: 34px !important;
        color: #3b0764 !important;
        background: rgba(255, 255, 255, 0.12) !important;
        border-top: 1px solid rgba(76, 29, 149, 0.22) !important;
        text-align: center !important;
        font-family: 'Segoe UI', Arial, sans-serif !important;
      }

      .prem-legal-footer-brand {
        color: #3b0764;
        font-size: 0.92rem;
        font-weight: 850;
      }

      .prem-legal-footer-links {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px 12px;
        max-width: 760px;
      }

      .prem-legal-footer-links a {
        color: #2e1065;
        text-decoration: none;
        font-size: 0.78rem;
        font-weight: 900;
        padding: 6px 9px;
        border: 1px solid rgba(76, 29, 149, 0.24);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
        box-shadow: 0 4px 12px rgba(46, 16, 101, 0.1);
      }

      .prem-legal-footer-links a:hover,
      .prem-legal-footer-links a:focus-visible {
        color: #fff;
        background: linear-gradient(135deg, #4c1d95, #7c3aed);
        outline: none;
      }

      .prem-legal-footer-disclaimer {
        max-width: 860px;
        margin: 0;
        color: rgba(59, 7, 100, 0.86);
        font-size: 0.72rem;
        line-height: 1.35;
        font-weight: 750;
      }

      @media (max-width: 560px) {
        footer.prem-legal-footer {
          gap: 9px !important;
          padding: 18px 10px calc(18px + env(safe-area-inset-bottom, 0px)) !important;
        }

        .prem-legal-footer-links {
          gap: 7px;
        }

        .prem-legal-footer-links a {
          font-size: 0.7rem;
          padding: 6px 8px;
        }

        .prem-legal-footer-disclaimer {
          font-size: 0.66rem;
        }
      }
    `;
    document.head.append(style);
  }

  function enhanceFooter() {
    injectStyles();

    let footer = Array.from(document.querySelectorAll('body > footer')).pop();
    if (!footer) {
      footer = document.createElement('footer');
      footer.textContent = '2026 Prem Predics';
      document.body.append(footer);
    }

    if (footer.dataset.legalFooterEnhanced === 'true') {
      return;
    }

    const rawLabel = footer.textContent.replace(/\s+/g, ' ').trim();
    const label = rawLabel || '2026 Prem Predics';
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    footer.classList.add('prem-legal-footer');
    footer.dataset.legalFooterEnhanced = 'true';
    footer.innerHTML = `
      <div class="prem-legal-footer-brand">${label}</div>
      <nav class="prem-legal-footer-links" aria-label="Prem Predics legal and support links">
        ${footerLinks.map(([text, href]) => {
          const ariaCurrent = currentPage === href ? ' aria-current="page"' : '';
          return `<a href="${href}"${ariaCurrent}>${text}</a>`;
        }).join('')}
      </nav>
      <p class="prem-legal-footer-disclaimer">${disclaimer}</p>
    `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceFooter, { once: true });
  } else {
    enhanceFooter();
  }
})();
