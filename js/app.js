/* ============================================================
   OilBridge — Main Application
   Router, Pages, Events, Onboarding, Watermark
   ============================================================ */

(function () {
  'use strict';

  const OIL_TYPES = ['oil_brent','oil_wti','oil_ural','oil_diesel','oil_gasoline','oil_jet','oil_fuel_oil','oil_lng','oil_lpg','oil_naphtha','oil_bitumen','oil_mazut'];
  const UNITS = ['unit_barrels','unit_mt','unit_liters','unit_gallons'];
  const CURRENCIES = ['USD','EUR','GBP'];
  const EU_COUNTRIES = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden'];

  const store = new Store();
  const i18n = new I18n();

  // === Sanitize ===
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function formatCurrency(amount, currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2 }).format(amount);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(i18n.getLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function svgIcon(name) {
    const icons = {
      barrel: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>',
      location: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      dollar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      user: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      upload: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      file: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
      lock: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      stripe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.893 5.575C4.746 22.84 7.762 24 12.014 24c2.59 0 4.71-.636 6.29-1.866 1.66-1.3 2.507-3.206 2.507-5.578 0-4.15-2.518-5.846-6.835-7.406z"/></svg>',
    };
    return icons[name] || '';
  }

  // === Toast ===
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${esc(message)}</span><button class="toast-close">&times;</button>`;
    container.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), 4000);
  }

  // === Modal ===
  function showModal(title, bodyHtml, footerHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    document.getElementById('modal-overlay').classList.remove('hidden');
  }
  function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

  // === Watermark ===
  function updateWatermark() {
    const user = store.getCurrentUser();
    const canvas = document.getElementById('watermark-canvas');
    if (!user) {
      document.body.classList.remove('watermark-active');
      return;
    }
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#888';
    ctx.globalAlpha = 1;
    const text = `${user.email} | ${user.companyName}`;
    const step = 250;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-30 * Math.PI / 180);
    for (let y = -canvas.height; y < canvas.height; y += step) {
      for (let x = -canvas.width; x < canvas.width; x += step) {
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
    document.body.classList.add('watermark-active');
  }

  // === Router ===
  function getRoute() {
    const hash = window.location.hash.slice(1) || 'home';
    const parts = hash.split('/');
    return { page: parts[0], param: parts[1] || null };
  }

  function navigate(page) {
    window.location.hash = '#' + page;
  }

  // === Rendering ===
  function render() {
    const route = getRoute();
    const main = document.getElementById('main-content');
    updateNav();
    updateWatermark();

    const pages = {
      home: renderHome,
      listings: renderListings,
      'listing-detail': renderListingDetail,
      login: renderLogin,
      register: renderRegister,
      'place-listing': renderPlaceListing,
      matches: renderMatches,
      profile: renderProfile,
      admin: renderAdmin,
      terms: renderTerms,
      privacy: renderPrivacy,
    };

    const renderer = pages[route.page];
    if (renderer) {
      main.innerHTML = '';
      renderer(main, route.param);
    } else {
      main.innerHTML = `<div class="page-section"><div class="container"><div class="empty-state"><div class="empty-state-icon">404</div><h3>Page not found</h3><p><a href="#home">Go home</a></p></div></div></div>`;
    }

    i18n.translatePage();
    window.scrollTo(0, 0);

    // Onboarding check
    const user = store.getCurrentUser();
    if (user && !store.hasOnboarded(user.id) && route.page === 'home') {
      setTimeout(() => startOnboarding(), 500);
    }
  }

  function updateNav() {
    const user = store.getCurrentUser();
    const isAdmin = store.isAdmin();
    const isVerified = store.isVerified();
    const route = getRoute();

    // Auth visibility
    document.getElementById('auth-buttons').classList.toggle('hidden', !!user);
    document.getElementById('user-menu').classList.toggle('hidden', !user);

    if (user) {
      document.getElementById('user-avatar').textContent = (user.contactName || user.email)[0].toUpperCase();
      document.getElementById('user-name').textContent = user.contactName || user.email;
    }

    // Nav link visibility
    document.querySelectorAll('.auth-only').forEach(el => el.classList.toggle('hidden', !user));
    document.querySelectorAll('.verified-only').forEach(el => el.classList.toggle('hidden', !isVerified));
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));

    // Active state
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href').slice(1);
      link.classList.toggle('active', href === route.page);
    });
  }

  // ============================================================
  // PAGE: Home
  // ============================================================
  function renderHome(main) {
    const stats = store.getStats();
    const listings = store.getListings().slice(0, 6);

    main.innerHTML = `
      <section class="hero">
        <div class="hero-content">
          <h1><span data-i18n="hero_title_1">${esc(i18n.t('hero_title_1'))}</span><br>${esc(i18n.t('hero_title_2'))}</h1>
          <p data-i18n="hero_subtitle">${esc(i18n.t('hero_subtitle'))}</p>
          <div class="hero-actions">
            <a href="#listings" class="btn btn-primary btn-lg" data-i18n="hero_cta_browse">${esc(i18n.t('hero_cta_browse'))}</a>
            <a href="#register" class="btn btn-secondary btn-lg" data-i18n="hero_cta_register">${esc(i18n.t('hero_cta_register'))}</a>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><div class="hero-stat-value">${stats.activeListings}</div><div class="hero-stat-label" data-i18n="hero_stat_listings">${esc(i18n.t('hero_stat_listings'))}</div></div>
            <div class="hero-stat"><div class="hero-stat-value">${stats.verifiedUsers}</div><div class="hero-stat-label" data-i18n="hero_stat_traders">${esc(i18n.t('hero_stat_traders'))}</div></div>
            <div class="hero-stat"><div class="hero-stat-value">${formatCurrency(stats.estimatedRevenue / 0.032, 'EUR').split('.')[0]}</div><div class="hero-stat-label" data-i18n="hero_stat_volume">${esc(i18n.t('hero_stat_volume'))}</div></div>
            <div class="hero-stat"><div class="hero-stat-value">27</div><div class="hero-stat-label" data-i18n="hero_stat_countries">${esc(i18n.t('hero_stat_countries'))}</div></div>
          </div>
        </div>
      </section>

      <section class="page-section">
        <div class="container">
          <div class="section-header text-center">
            <h2 data-i18n="features_title">${esc(i18n.t('features_title'))}</h2>
            <p data-i18n="features_subtitle">${esc(i18n.t('features_subtitle'))}</p>
          </div>
          <div class="features-grid">
            <div class="feature-card"><div class="feature-card-icon">&#128274;</div><h3 data-i18n="feature_kyc_title">${esc(i18n.t('feature_kyc_title'))}</h3><p data-i18n="feature_kyc_desc">${esc(i18n.t('feature_kyc_desc'))}</p></div>
            <div class="feature-card"><div class="feature-card-icon">&#9889;</div><h3 data-i18n="feature_match_title">${esc(i18n.t('feature_match_title'))}</h3><p data-i18n="feature_match_desc">${esc(i18n.t('feature_match_desc'))}</p></div>
            <div class="feature-card"><div class="feature-card-icon">&#128737;</div><h3 data-i18n="feature_secure_title">${esc(i18n.t('feature_secure_title'))}</h3><p data-i18n="feature_secure_desc">${esc(i18n.t('feature_secure_desc'))}</p></div>
            <div class="feature-card"><div class="feature-card-icon">&#128176;</div><h3 data-i18n="feature_commission_title">${esc(i18n.t('feature_commission_title'))}</h3><p data-i18n="feature_commission_desc">${esc(i18n.t('feature_commission_desc'))}</p></div>
          </div>
        </div>
      </section>

      ${listings.length ? `
      <section class="page-section" style="background:var(--bg-secondary)">
        <div class="container">
          <div class="section-header flex-between">
            <div><h2 data-i18n="listings_title">${esc(i18n.t('listings_title'))}</h2><p data-i18n="listings_subtitle">${esc(i18n.t('listings_subtitle'))}</p></div>
            <a href="#listings" class="btn btn-secondary">${esc(i18n.t('hero_cta_browse'))} &rarr;</a>
          </div>
          <div class="listings-grid">${listings.map(l => renderListingCard(l)).join('')}</div>
        </div>
      </section>` : ''}
    `;
  }

  function renderListingCard(listing) {
    const seller = store.getUser(listing.userId);
    return `
      <div class="listing-card" data-listing-id="${esc(listing.id)}" onclick="window.location.hash='#listing-detail/${esc(listing.id)}'">
        <div class="listing-card-header">
          <span class="tag tag-${listing.type}">${esc(i18n.t('general_' + listing.type))}</span>
          <span class="listing-card-type">${esc(i18n.t(listing.oilType))}</span>
        </div>
        <div class="listing-card-body">
          <div class="listing-card-meta">
            <div class="listing-card-meta-item">${svgIcon('barrel')}<span>${listing.quantity.toLocaleString()} ${esc(i18n.t(listing.unit))}</span></div>
            <div class="listing-card-meta-item">${svgIcon('location')}<span>${esc(listing.deliveryLocation)}</span></div>
            <div class="listing-card-meta-item">${svgIcon('calendar')}<span>${formatDate(listing.deliveryDate)}</span></div>
            ${seller ? `<div class="listing-card-meta-item">${svgIcon('user')}<span>${esc(seller.companyName)}</span></div>` : ''}
          </div>
        </div>
        <div class="listing-card-footer">
          <span class="listing-card-price">${formatCurrency(listing.price, listing.currency)} <small>${esc(i18n.t('general_per_unit'))}</small></span>
          <span class="listing-card-date">${formatDate(listing.createdAt)}</span>
        </div>
      </div>`;
  }

  // ============================================================
  // PAGE: Listings
  // ============================================================
  function renderListings(main) {
    main.innerHTML = `
      <section class="page-section">
        <div class="container">
          <div class="section-header">
            <h2 data-i18n="listings_title">${esc(i18n.t('listings_title'))}</h2>
            <p data-i18n="listings_subtitle">${esc(i18n.t('listings_subtitle'))}</p>
          </div>
          <div class="filter-bar" id="filter-bar">
            <input type="text" class="form-input" id="filter-search" placeholder="${esc(i18n.t('filter_search'))}" data-i18n="filter_search">
            <select class="form-select" id="filter-type">
              <option value="">${esc(i18n.t('filter_type'))}</option>
              <option value="buy">${esc(i18n.t('filter_type_buy'))}</option>
              <option value="sell">${esc(i18n.t('filter_type_sell'))}</option>
            </select>
            <select class="form-select" id="filter-oil">
              <option value="">${esc(i18n.t('filter_oil'))}</option>
              ${OIL_TYPES.map(o => `<option value="${o}">${esc(i18n.t(o))}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-sort">
              <option value="newest">${esc(i18n.t('filter_sort'))}</option>
              <option value="oldest">${esc(i18n.t('filter_sort_oldest'))}</option>
              <option value="price_low">${esc(i18n.t('filter_sort_price_low'))}</option>
              <option value="price_high">${esc(i18n.t('filter_sort_price_high'))}</option>
            </select>
          </div>
          <div class="listings-grid" id="listings-container"></div>
        </div>
      </section>`;

    function applyFilters() {
      const filters = {
        search: document.getElementById('filter-search').value,
        type: document.getElementById('filter-type').value,
        oilType: document.getElementById('filter-oil').value,
        sort: document.getElementById('filter-sort').value
      };
      const listings = store.getListings(filters);
      const container = document.getElementById('listings-container');
      if (!listings.length) {
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">&#128270;</div><h3 data-i18n="no_listings">${esc(i18n.t('no_listings'))}</h3><p data-i18n="no_listings_desc">${esc(i18n.t('no_listings_desc'))}</p></div>`;
      } else {
        container.innerHTML = listings.map(l => renderListingCard(l)).join('');
      }
    }

    document.getElementById('filter-search').addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('filter-type').addEventListener('change', applyFilters);
    document.getElementById('filter-oil').addEventListener('change', applyFilters);
    document.getElementById('filter-sort').addEventListener('change', applyFilters);
    applyFilters();
  }

  function debounce(fn, ms) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

  // ============================================================
  // PAGE: Listing Detail
  // ============================================================
  function renderListingDetail(main, listingId) {
    const listing = store.getListing(listingId);
    if (!listing) { main.innerHTML = `<div class="page-section"><div class="container"><div class="empty-state"><h3>Listing not found</h3><a href="#listings" class="btn btn-primary">Back to Listings</a></div></div></div>`; return; }
    const seller = store.getUser(listing.userId);
    const user = store.getCurrentUser();
    const isOwn = user && user.id === listing.userId;

    let actionBtn = '';
    if (!user) actionBtn = `<a href="#login" class="btn btn-primary btn-block" data-i18n="listing_login_required">${esc(i18n.t('listing_login_required'))}</a>`;
    else if (!store.isVerified()) actionBtn = `<button class="btn btn-secondary btn-block" disabled data-i18n="listing_verification_required">${esc(i18n.t('listing_verification_required'))}</button>`;
    else if (isOwn) actionBtn = `<button class="btn btn-secondary btn-block" disabled data-i18n="listing_own_listing">${esc(i18n.t('listing_own_listing'))}</button>`;
    else actionBtn = `<button class="btn btn-primary btn-block" id="express-interest-btn" data-i18n="listing_express_interest">${esc(i18n.t('listing_express_interest'))}</button>`;

    main.innerHTML = `
      <section class="page-section">
        <div class="container">
          <a href="#listings" class="btn btn-ghost mb-24">&larr; <span data-i18n="general_back">${esc(i18n.t('general_back'))}</span></a>
          <div class="listing-detail-grid">
            <div class="listing-detail-info">
              <div class="flex-between mb-16">
                <span class="tag tag-${listing.type}" style="font-size:0.9rem;padding:6px 14px">${esc(i18n.t('general_' + listing.type))}</span>
                <span class="text-muted">${formatDate(listing.createdAt)}</span>
              </div>
              <h2 style="font-size:1.6rem;margin-bottom:24px">${esc(i18n.t(listing.oilType))}</h2>
              <div class="card mb-16">
                <div class="match-details">
                  <div class="match-detail"><div class="match-detail-label" data-i18n="listing_quantity">${esc(i18n.t('listing_quantity'))}</div><div class="match-detail-value">${listing.quantity.toLocaleString()} ${esc(i18n.t(listing.unit))}</div></div>
                  <div class="match-detail"><div class="match-detail-label" data-i18n="listing_price">${esc(i18n.t('listing_price'))}</div><div class="match-detail-value">${formatCurrency(listing.price, listing.currency)} ${esc(i18n.t('general_per_unit'))}</div></div>
                  <div class="match-detail"><div class="match-detail-label" data-i18n="listing_delivery">${esc(i18n.t('listing_delivery'))}</div><div class="match-detail-value">${esc(listing.deliveryLocation)}</div></div>
                  <div class="match-detail"><div class="match-detail-label" data-i18n="listing_delivery_date">${esc(i18n.t('listing_delivery_date'))}</div><div class="match-detail-value">${formatDate(listing.deliveryDate)}</div></div>
                </div>
              </div>
              ${listing.notes ? `<div class="card"><h4 class="mb-16" data-i18n="listing_notes">${esc(i18n.t('listing_notes'))}</h4><p style="color:var(--text-secondary);line-height:1.7">${esc(listing.notes)}</p></div>` : ''}
            </div>
            <div class="listing-detail-sidebar">
              <div class="card">
                <h3 style="font-size:1.8rem;color:var(--accent);margin-bottom:4px">${formatCurrency(listing.price, listing.currency)}</h3>
                <p class="text-muted mb-24">${esc(i18n.t('general_per_unit'))}</p>
                <div style="padding:16px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:20px">
                  <div class="match-detail-label" data-i18n="match_total">${esc(i18n.t('match_total'))}</div>
                  <div style="font-size:1.2rem;font-weight:700;margin-top:4px">${formatCurrency(listing.price * listing.quantity, listing.currency)}</div>
                </div>
                <div class="commission-banner" style="margin-bottom:20px">
                  <div class="commission-banner-text"><strong>${esc(i18n.t('match_commission'))}</strong><br>${formatCurrency(listing.price * listing.quantity * 0.032, listing.currency)}</div>
                </div>
                ${actionBtn}
                ${seller ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)"><div class="match-detail-label" data-i18n="listing_posted_by">${esc(i18n.t('listing_posted_by'))}</div><div style="font-weight:600;margin-top:4px">${esc(seller.companyName)}</div><div class="text-muted" style="font-size:0.85rem">${esc(seller.companyCountry)}</div></div>` : ''}
              </div>
            </div>
          </div>
        </div>
      </section>`;

    const interestBtn = document.getElementById('express-interest-btn');
    if (interestBtn) {
      interestBtn.addEventListener('click', () => {
        // Create a match / express interest
        const matchData = {
          listingId: listing.id,
          buyerId: listing.type === 'sell' ? user.id : listing.userId,
          sellerId: listing.type === 'sell' ? listing.userId : user.id,
          quantity: listing.quantity,
          pricePerUnit: listing.price,
          totalValue: listing.price * listing.quantity,
          commission: listing.price * listing.quantity * store.COMMISSION_RATE,
          currency: listing.currency
        };
        store.createMatch(matchData);
        showToast(i18n.t('listing_interest_sent'), 'success');
        interestBtn.disabled = true;
        interestBtn.textContent = i18n.t('listing_interest_sent');
      });
    }
  }

  // ============================================================
  // PAGE: Login
  // ============================================================
  function renderLogin(main) {
    main.innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <h2 data-i18n="login_title">${esc(i18n.t('login_title'))}</h2>
          <p class="auth-subtitle" data-i18n="login_subtitle">${esc(i18n.t('login_subtitle'))}</p>
          <form id="login-form">
            <div class="form-group">
              <label class="form-label" data-i18n="login_email">${esc(i18n.t('login_email'))}</label>
              <input type="email" class="form-input" id="login-email" required autocomplete="email">
            </div>
            <div class="form-group">
              <label class="form-label" data-i18n="login_password">${esc(i18n.t('login_password'))}</label>
              <input type="password" class="form-input" id="login-password" required autocomplete="current-password">
            </div>
            <div id="login-error" class="form-error mb-16 hidden"></div>
            <button type="submit" class="btn btn-primary btn-block btn-lg" data-i18n="login_submit">${esc(i18n.t('login_submit'))}</button>
          </form>
          <p class="text-center mt-24" style="font-size:0.9rem;color:var(--text-secondary)">
            <span data-i18n="login_no_account">${esc(i18n.t('login_no_account'))}</span>
            <a href="#register" data-i18n="login_register_link">${esc(i18n.t('login_register_link'))}</a>
          </p>
          <div class="divider mt-24">Demo Accounts</div>
          <div style="font-size:0.8rem;color:var(--text-muted);line-height:1.8">
            <p><strong>Admin:</strong> admin@sentari.nl / Admin2024!</p>
            <p><strong>Trader:</strong> hans@petrochemag.de / Trader2024!</p>
            <p><strong>Trader:</strong> marie@euroraffinerie.fr / Trader2024!</p>
          </div>
        </div>
      </div>`;

    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const result = store.login(email, password);
      if (result.error) {
        const errEl = document.getElementById('login-error');
        errEl.textContent = i18n.t('login_error');
        errEl.classList.remove('hidden');
      } else {
        showToast(`Welcome back, ${result.user.contactName || result.user.email}!`, 'success');
        navigate('home');
      }
    });
  }

  // ============================================================
  // PAGE: Register (Multi-step)
  // ============================================================
  function renderRegister(main) {
    const steps = ['register_step_company','register_step_contact','register_step_kyc','register_step_nda','register_step_password'];
    let currentStep = 0;
    let formData = { documents: [] };

    function renderSteps() {
      return `<div class="steps">${steps.map((s, i) => `
        <div class="step ${i < currentStep ? 'completed' : ''} ${i === currentStep ? 'active' : ''}">
          <span class="step-number">${i < currentStep ? '&#10003;' : i + 1}</span>
          <span class="step-label" data-i18n="${s}">${esc(i18n.t(s))}</span>
        </div>`).join('')}</div>`;
    }

    function renderCurrentStep() {
      const countryOptions = EU_COUNTRIES.map(c => `<option value="${esc(c)}" ${formData.companyCountry === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

      const stepContent = [
        // Step 1: Company
        `<div class="form-group"><label class="form-label" data-i18n="register_company_name">${esc(i18n.t('register_company_name'))}</label><input type="text" class="form-input" id="reg-company-name" value="${esc(formData.companyName || '')}" required></div>
         <div class="form-row">
           <div class="form-group"><label class="form-label" data-i18n="register_company_reg">${esc(i18n.t('register_company_reg'))}</label><input type="text" class="form-input" id="reg-company-reg" value="${esc(formData.companyReg || '')}" required></div>
           <div class="form-group"><label class="form-label" data-i18n="register_company_vat">${esc(i18n.t('register_company_vat'))}</label><input type="text" class="form-input" id="reg-company-vat" value="${esc(formData.companyVat || '')}"></div>
         </div>
         <div class="form-group"><label class="form-label" data-i18n="register_company_country">${esc(i18n.t('register_company_country'))}</label><select class="form-select" id="reg-company-country" required><option value="">Select country...</option>${countryOptions}</select></div>`,

        // Step 2: Contact
        `<div class="form-group"><label class="form-label" data-i18n="register_contact_name">${esc(i18n.t('register_contact_name'))}</label><input type="text" class="form-input" id="reg-contact-name" value="${esc(formData.contactName || '')}" required></div>
         <div class="form-group"><label class="form-label" data-i18n="register_contact_email">${esc(i18n.t('register_contact_email'))}</label><input type="email" class="form-input" id="reg-contact-email" value="${esc(formData.email || '')}" required autocomplete="email"></div>
         <div class="form-row">
           <div class="form-group"><label class="form-label" data-i18n="register_contact_phone">${esc(i18n.t('register_contact_phone'))}</label><input type="tel" class="form-input" id="reg-contact-phone" value="${esc(formData.contactPhone || '')}"></div>
           <div class="form-group"><label class="form-label" data-i18n="register_contact_position">${esc(i18n.t('register_contact_position'))}</label><input type="text" class="form-input" id="reg-contact-position" value="${esc(formData.contactPosition || '')}"></div>
         </div>`,

        // Step 3: KYC Documents
        `<h3 class="mb-16" data-i18n="register_kyc_title">${esc(i18n.t('register_kyc_title'))}</h3>
         <p class="text-muted mb-24" style="font-size:0.9rem" data-i18n="register_kyc_desc">${esc(i18n.t('register_kyc_desc'))}</p>
         <ul style="margin-bottom:24px;padding-left:20px;font-size:0.9rem;color:var(--text-secondary);line-height:2">
           <li data-i18n="register_kyc_company_reg">${esc(i18n.t('register_kyc_company_reg'))}</li>
           <li data-i18n="register_kyc_id">${esc(i18n.t('register_kyc_id'))}</li>
           <li data-i18n="register_kyc_address">${esc(i18n.t('register_kyc_address'))}</li>
         </ul>
         <div class="upload-zone" id="upload-zone">
           <div class="upload-zone-icon">${svgIcon('upload')}</div>
           <div class="upload-zone-text" data-i18n="register_kyc_upload_hint">${esc(i18n.t('register_kyc_upload_hint'))}</div>
           <div class="upload-zone-hint">PDF, JPG, PNG (max 10MB)</div>
           <input type="file" id="file-input" multiple accept=".pdf,.jpg,.jpeg,.png" style="display:none">
         </div>
         <div class="upload-file-list" id="upload-file-list">${formData.documents.map(d => `<div class="upload-file-item">${svgIcon('file')}<span class="file-name">${esc(d)}</span><button class="file-remove" data-file="${esc(d)}">&times;</button></div>`).join('')}</div>`,

        // Step 4: NDA
        `<h3 class="mb-16" data-i18n="register_nda_title">${esc(i18n.t('register_nda_title'))}</h3>
         <p class="text-muted mb-24" style="font-size:0.9rem" data-i18n="register_nda_desc">${esc(i18n.t('register_nda_desc'))}</p>
         <div class="nda-content">
           <h4>NON-DISCLOSURE AGREEMENT</h4>
           <p>This Non-Disclosure Agreement ("Agreement") is entered into by and between Sentari Holding BV ("Company"), a company registered in the Netherlands, and the undersigned party ("Recipient").</p>
           <h4>1. Confidential Information</h4>
           <p>All information shared through the OilBridge platform, including but not limited to: trading data, pricing information, counterparty identities, transaction volumes, delivery schedules, and business strategies shall be considered Confidential Information.</p>
           <h4>2. Obligations</h4>
           <p>The Recipient agrees to: (a) maintain strict confidentiality of all information received through the platform; (b) not disclose any information to third parties without prior written consent; (c) use the information solely for the purpose of conducting legitimate oil trading activities on the platform; (d) implement appropriate security measures to protect confidential data.</p>
           <h4>3. Duration</h4>
           <p>This Agreement shall remain in effect for a period of five (5) years from the date of acceptance, and shall survive the termination of the Recipient's account on the platform.</p>
           <h4>4. Remedies</h4>
           <p>The Recipient acknowledges that any breach of this Agreement may cause irreparable harm to the Company, and the Company shall be entitled to seek injunctive relief in addition to any other remedies available at law or in equity.</p>
           <h4>5. Governing Law</h4>
           <p>This Agreement shall be governed by the laws of the Netherlands and the European Union, with exclusive jurisdiction vested in the courts of Amsterdam.</p>
           <h4>6. Commission Structure</h4>
           <p>The Recipient acknowledges and agrees that a commission of 3.2% shall be applied to all successfully matched and completed transactions facilitated through the OilBridge platform. Payment of commission is due upon completion of the transaction.</p>
         </div>
         <label class="form-check mt-16"><input type="checkbox" id="nda-accept" ${formData.ndaAccepted ? 'checked' : ''}><span data-i18n="register_nda_accept">${esc(i18n.t('register_nda_accept'))}</span></label>`,

        // Step 5: Password
        `<div class="form-group"><label class="form-label" data-i18n="register_password_label">${esc(i18n.t('register_password_label'))}</label><input type="password" class="form-input" id="reg-password" required autocomplete="new-password"><div class="form-hint" data-i18n="register_password_hint">${esc(i18n.t('register_password_hint'))}</div></div>
         <div class="form-group"><label class="form-label" data-i18n="register_password_confirm">${esc(i18n.t('register_password_confirm'))}</label><input type="password" class="form-input" id="reg-password-confirm" required autocomplete="new-password"></div>`
      ];

      return stepContent[currentStep] || '';
    }

    function renderForm() {
      const container = document.getElementById('register-step-content');
      container.innerHTML = renderCurrentStep();
      document.getElementById('register-steps-bar').innerHTML = renderSteps();

      // Prev/Next buttons
      document.getElementById('reg-prev-btn').classList.toggle('hidden', currentStep === 0);
      const nextBtn = document.getElementById('reg-next-btn');
      const submitBtn = document.getElementById('reg-submit-btn');
      nextBtn.classList.toggle('hidden', currentStep === steps.length - 1);
      submitBtn.classList.toggle('hidden', currentStep !== steps.length - 1);

      // File upload handling
      if (currentStep === 2) {
        const zone = document.getElementById('upload-zone');
        const input = document.getElementById('file-input');
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
        input.addEventListener('change', (e) => handleFiles(e.target.files));
        document.querySelectorAll('.file-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const fileName = e.target.dataset.file;
            formData.documents = formData.documents.filter(d => d !== fileName);
            renderForm();
          });
        });
      }

      i18n.translatePage();
    }

    function handleFiles(files) {
      Array.from(files).forEach(f => {
        if (!formData.documents.includes(f.name)) formData.documents.push(f.name);
      });
      renderForm();
    }

    function saveStepData() {
      switch (currentStep) {
        case 0:
          formData.companyName = document.getElementById('reg-company-name').value.trim();
          formData.companyReg = document.getElementById('reg-company-reg').value.trim();
          formData.companyVat = document.getElementById('reg-company-vat').value.trim();
          formData.companyCountry = document.getElementById('reg-company-country').value;
          if (!formData.companyName || !formData.companyReg || !formData.companyCountry) {
            showToast('Please fill in all required fields.', 'error');
            return false;
          }
          break;
        case 1:
          formData.contactName = document.getElementById('reg-contact-name').value.trim();
          formData.email = document.getElementById('reg-contact-email').value.trim();
          formData.contactPhone = document.getElementById('reg-contact-phone').value.trim();
          formData.contactPosition = document.getElementById('reg-contact-position').value.trim();
          if (!formData.contactName || !formData.email) {
            showToast('Please fill in all required fields.', 'error');
            return false;
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            showToast('Please enter a valid email address.', 'error');
            return false;
          }
          break;
        case 2:
          if (formData.documents.length === 0) {
            showToast('Please upload at least one KYC document.', 'error');
            return false;
          }
          break;
        case 3:
          formData.ndaAccepted = document.getElementById('nda-accept').checked;
          if (!formData.ndaAccepted) {
            showToast('You must accept the NDA to continue.', 'error');
            return false;
          }
          break;
      }
      return true;
    }

    main.innerHTML = `
      <div class="auth-page" style="align-items:flex-start;padding-top:32px">
        <div class="auth-card register-card">
          <h2 data-i18n="register_title">${esc(i18n.t('register_title'))}</h2>
          <p class="auth-subtitle" data-i18n="register_subtitle">${esc(i18n.t('register_subtitle'))}</p>
          <div id="register-steps-bar"></div>
          <div id="register-step-content"></div>
          <div id="register-error" class="form-error mt-16 hidden"></div>
          <div class="flex-between mt-24">
            <button class="btn btn-ghost" id="reg-prev-btn" data-i18n="register_prev">${esc(i18n.t('register_prev'))}</button>
            <div>
              <button class="btn btn-primary" id="reg-next-btn" data-i18n="register_next">${esc(i18n.t('register_next'))}</button>
              <button class="btn btn-primary hidden" id="reg-submit-btn" data-i18n="register_submit">${esc(i18n.t('register_submit'))}</button>
            </div>
          </div>
          <p class="text-center mt-24" style="font-size:0.9rem;color:var(--text-secondary)">
            <span data-i18n="register_have_account">${esc(i18n.t('register_have_account'))}</span>
            <a href="#login" data-i18n="register_login_link">${esc(i18n.t('register_login_link'))}</a>
          </p>
        </div>
      </div>`;

    document.getElementById('reg-prev-btn').addEventListener('click', () => { if (currentStep > 0) { currentStep--; renderForm(); } });
    document.getElementById('reg-next-btn').addEventListener('click', () => { if (saveStepData()) { currentStep++; renderForm(); } });
    document.getElementById('reg-submit-btn').addEventListener('click', () => {
      const pw = document.getElementById('reg-password').value;
      const pwConfirm = document.getElementById('reg-password-confirm').value;
      if (pw.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
      if (!/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) { showToast('Password must contain at least one uppercase letter and one number.', 'error'); return; }
      if (pw !== pwConfirm) { showToast('Passwords do not match.', 'error'); return; }
      formData.password = pw;
      const result = store.createUser(formData);
      if (result.error) { showToast(result.error, 'error'); return; }
      showToast(i18n.t('register_success'), 'success');
      navigate('login');
    });

    renderForm();
  }

  // ============================================================
  // PAGE: Place Listing
  // ============================================================
  function renderPlaceListing(main) {
    const user = store.getCurrentUser();
    if (!user || !store.isVerified()) { navigate('login'); return; }

    main.innerHTML = `
      <section class="page-section">
        <div class="container" style="max-width:720px">
          <div class="section-header">
            <h2 data-i18n="place_listing_title">${esc(i18n.t('place_listing_title'))}</h2>
            <p data-i18n="place_listing_subtitle">${esc(i18n.t('place_listing_subtitle'))}</p>
          </div>
          <div class="commission-banner">
            <div class="commission-banner-icon">&#128176;</div>
            <div class="commission-banner-text" data-i18n="place_commission_note">${esc(i18n.t('place_commission_note'))}</div>
          </div>
          <form id="place-listing-form" class="card">
            <div class="form-group">
              <label class="form-label" data-i18n="place_type">${esc(i18n.t('place_type'))}</label>
              <div style="display:flex;gap:12px">
                <label class="form-check" style="flex:1;padding:14px;background:var(--bg-tertiary);border-radius:var(--radius-sm);border:2px solid var(--border);cursor:pointer" id="type-buy-label">
                  <input type="radio" name="listing-type" value="buy" checked style="accent-color:var(--accent)">
                  <span data-i18n="place_type_buy">${esc(i18n.t('place_type_buy'))}</span>
                </label>
                <label class="form-check" style="flex:1;padding:14px;background:var(--bg-tertiary);border-radius:var(--radius-sm);border:2px solid var(--border);cursor:pointer" id="type-sell-label">
                  <input type="radio" name="listing-type" value="sell" style="accent-color:var(--accent)">
                  <span data-i18n="place_type_sell">${esc(i18n.t('place_type_sell'))}</span>
                </label>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" data-i18n="place_oil_type">${esc(i18n.t('place_oil_type'))}</label>
              <select class="form-select" id="pl-oil-type" required>
                ${OIL_TYPES.map(o => `<option value="${o}">${esc(i18n.t(o))}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" data-i18n="place_quantity">${esc(i18n.t('place_quantity'))}</label>
                <input type="number" class="form-input" id="pl-quantity" min="1" required>
              </div>
              <div class="form-group">
                <label class="form-label" data-i18n="place_unit">${esc(i18n.t('place_unit'))}</label>
                <select class="form-select" id="pl-unit">${UNITS.map(u => `<option value="${u}">${esc(i18n.t(u))}</option>`).join('')}</select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" data-i18n="place_price">${esc(i18n.t('place_price'))}</label>
                <input type="number" class="form-input" id="pl-price" min="0.01" step="0.01" required>
              </div>
              <div class="form-group">
                <label class="form-label" data-i18n="place_currency">${esc(i18n.t('place_currency'))}</label>
                <select class="form-select" id="pl-currency">${CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" data-i18n="place_delivery_location">${esc(i18n.t('place_delivery_location'))}</label>
              <input type="text" class="form-input" id="pl-location" required placeholder="e.g. Rotterdam, Netherlands">
            </div>
            <div class="form-group">
              <label class="form-label" data-i18n="place_delivery_date">${esc(i18n.t('place_delivery_date'))}</label>
              <input type="date" class="form-input" id="pl-date" required>
            </div>
            <div class="form-group">
              <label class="form-label" data-i18n="place_notes">${esc(i18n.t('place_notes'))}</label>
              <textarea class="form-textarea" id="pl-notes" placeholder="${esc(i18n.t('place_notes_hint'))}"></textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-block btn-lg" data-i18n="place_submit">${esc(i18n.t('place_submit'))}</button>
          </form>
        </div>
      </section>`;

    // Highlight selected type
    const typeRadios = document.querySelectorAll('input[name="listing-type"]');
    function updateTypeStyles() {
      document.getElementById('type-buy-label').style.borderColor = typeRadios[0].checked ? 'var(--accent)' : 'var(--border)';
      document.getElementById('type-sell-label').style.borderColor = typeRadios[1].checked ? 'var(--accent)' : 'var(--border)';
    }
    typeRadios.forEach(r => r.addEventListener('change', updateTypeStyles));
    updateTypeStyles();

    document.getElementById('place-listing-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {
        userId: user.id,
        type: document.querySelector('input[name="listing-type"]:checked').value,
        oilType: document.getElementById('pl-oil-type').value,
        quantity: document.getElementById('pl-quantity').value,
        unit: document.getElementById('pl-unit').value,
        price: document.getElementById('pl-price').value,
        currency: document.getElementById('pl-currency').value,
        deliveryLocation: document.getElementById('pl-location').value.trim(),
        deliveryDate: document.getElementById('pl-date').value,
        notes: document.getElementById('pl-notes').value.trim()
      };
      const result = store.createListing(data);
      if (result.success) {
        showToast(i18n.t('place_success'), 'success');
        navigate('listings');
      }
    });
  }

  // ============================================================
  // PAGE: My Matches
  // ============================================================
  function renderMatches(main) {
    const user = store.getCurrentUser();
    if (!user) { navigate('login'); return; }
    const matches = store.getMatchesForUser(user.id);

    main.innerHTML = `
      <section class="page-section">
        <div class="container">
          <div class="section-header">
            <h2 data-i18n="matches_title">${esc(i18n.t('matches_title'))}</h2>
            <p data-i18n="matches_subtitle">${esc(i18n.t('matches_subtitle'))}</p>
          </div>
          <div id="matches-list">
            ${!matches.length ? `
              <div class="empty-state">
                <div class="empty-state-icon">&#129309;</div>
                <h3 data-i18n="match_no_matches">${esc(i18n.t('match_no_matches'))}</h3>
                <p data-i18n="match_no_matches_desc">${esc(i18n.t('match_no_matches_desc'))}</p>
                <a href="#listings" class="btn btn-primary">${esc(i18n.t('hero_cta_browse'))}</a>
              </div>` : matches.map(m => renderMatchCard(m, user)).join('')}
          </div>
        </div>
      </section>`;

    // Event delegation for match actions
    main.addEventListener('click', (e) => {
      const acceptBtn = e.target.closest('.match-accept-btn');
      const declineBtn = e.target.closest('.match-decline-btn');
      const stripeBtn = e.target.closest('.match-stripe-btn');

      if (acceptBtn) {
        store.updateMatch(acceptBtn.dataset.id, { status: 'accepted' });
        showToast('Match accepted!', 'success');
        renderMatches(main);
      }
      if (declineBtn) {
        store.updateMatch(declineBtn.dataset.id, { status: 'declined' });
        showToast('Match declined.', 'info');
        renderMatches(main);
      }
      if (stripeBtn) {
        showModal('Stripe Payment', `
          <div class="text-center" style="padding:20px">
            <div style="font-size:3rem;margin-bottom:16px">${svgIcon('stripe')}</div>
            <h3 style="margin-bottom:8px">Commission Payment</h3>
            <p style="color:var(--text-secondary);margin-bottom:20px">${esc(i18n.t('match_stripe_note'))}</p>
            <div class="card card-accent" style="text-align:left;margin-bottom:20px">
              <div class="match-detail-label">Amount Due</div>
              <div style="font-size:1.3rem;font-weight:800;color:var(--accent);margin-top:4px">${esc(stripeBtn.dataset.amount)}</div>
            </div>
            <p style="font-size:0.8rem;color:var(--text-muted)">When Stripe is integrated, you will be redirected to a secure checkout page to complete the commission payment.</p>
          </div>
        `, `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Close</button>`);
      }
    });
  }

  function renderMatchCard(match, user) {
    const listing = store.getListing(match.listingId);
    const isAccepted = match.status === 'accepted' || match.status === 'completed';
    const isBuyer = match.buyerId === user.id;
    const counterpartyId = isBuyer ? match.sellerId : match.buyerId;
    const counterparty = store.getUser(counterpartyId);

    const statusClass = { pending: 'warning', accepted: 'success', completed: 'info', declined: 'error' }[match.status] || 'info';

    return `
      <div class="match-card">
        <div class="match-card-header">
          <div>
            <span class="badge badge-${statusClass}">${esc(i18n.t('match_status_' + match.status))}</span>
            ${listing ? `<span style="margin-left:12px;font-weight:600">${esc(i18n.t(listing.oilType))}</span>` : ''}
          </div>
          <span class="text-muted" style="font-size:0.85rem">${formatDate(match.createdAt)}</span>
        </div>
        <div class="match-card-body">
          <div class="match-details">
            <div class="match-detail"><div class="match-detail-label">${esc(i18n.t('listing_quantity'))}</div><div class="match-detail-value">${match.quantity.toLocaleString()} ${listing ? esc(i18n.t(listing.unit)) : ''}</div></div>
            <div class="match-detail"><div class="match-detail-label">${esc(i18n.t('listing_price'))}</div><div class="match-detail-value">${formatCurrency(match.pricePerUnit, match.currency)} ${esc(i18n.t('general_per_unit'))}</div></div>
            <div class="match-detail"><div class="match-detail-label" data-i18n="match_total">${esc(i18n.t('match_total'))}</div><div class="match-detail-value">${formatCurrency(match.totalValue, match.currency)}</div></div>
            <div class="match-detail"><div class="match-detail-label" data-i18n="match_commission">${esc(i18n.t('match_commission'))}</div><div class="match-detail-value text-accent">${formatCurrency(match.commission, match.currency)}</div></div>
          </div>

          ${isAccepted && counterparty ? `
          <div class="match-contact">
            <h4>${esc(i18n.t('match_contact_info'))}</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.9rem">
              <div><strong>${esc(i18n.t('match_counterparty'))}:</strong> ${esc(counterparty.companyName)}</div>
              <div><strong>Contact:</strong> ${esc(counterparty.contactName)}</div>
              <div><strong>Email:</strong> ${esc(counterparty.email)}</div>
              <div><strong>Phone:</strong> ${esc(counterparty.contactPhone || 'N/A')}</div>
            </div>
          </div>` : `
          <div class="match-locked">
            ${svgIcon('lock')}
            <p style="margin-top:8px" data-i18n="match_contact_locked">${esc(i18n.t('match_contact_locked'))}</p>
          </div>`}
        </div>
        <div class="match-card-footer">
          <div style="display:flex;gap:8px">
            ${match.status === 'pending' ? `
              <button class="btn btn-primary btn-sm match-accept-btn" data-id="${esc(match.id)}" data-i18n="match_accept">${esc(i18n.t('match_accept'))}</button>
              <button class="btn btn-ghost btn-sm match-decline-btn" data-id="${esc(match.id)}" data-i18n="match_decline">${esc(i18n.t('match_decline'))}</button>
            ` : ''}
          </div>
          ${isAccepted ? `<button class="btn btn-secondary btn-sm match-stripe-btn" data-amount="${formatCurrency(match.commission, match.currency)}">${svgIcon('stripe')} <span data-i18n="match_pay_commission">${esc(i18n.t('match_pay_commission'))}</span></button>` : ''}
        </div>
      </div>`;
  }

  // ============================================================
  // PAGE: Profile
  // ============================================================
  function renderProfile(main) {
    const user = store.getCurrentUser();
    if (!user) { navigate('login'); return; }
    const userListings = store.getUserListings(user.id);
    const userMatches = store.getMatchesForUser(user.id);

    const kycBadge = {
      verified: `<span class="badge badge-success" data-i18n="profile_kyc_verified">${esc(i18n.t('profile_kyc_verified'))}</span>`,
      pending: `<span class="badge badge-warning" data-i18n="profile_kyc_pending">${esc(i18n.t('profile_kyc_pending'))}</span>`,
      rejected: `<span class="badge badge-error" data-i18n="profile_kyc_rejected">${esc(i18n.t('profile_kyc_rejected'))}</span>`
    }[user.kycStatus] || '';

    main.innerHTML = `
      <section class="page-section">
        <div class="container" style="max-width:900px">
          <div class="profile-header">
            <div class="profile-avatar">${(user.contactName || user.email)[0].toUpperCase()}</div>
            <div class="profile-info">
              <h2>${esc(user.contactName || user.email)}</h2>
              <p style="color:var(--text-secondary)">${esc(user.companyName)}</p>
              <div class="mt-8">${kycBadge}</div>
            </div>
          </div>

          <div class="profile-grid">
            <div class="card">
              <h3 class="mb-16" data-i18n="profile_company_info">${esc(i18n.t('profile_company_info'))}</h3>
              <div style="display:flex;flex-direction:column;gap:12px;font-size:0.9rem">
                <div><span class="text-muted">${esc(i18n.t('register_company_name'))}:</span> <strong>${esc(user.companyName)}</strong></div>
                <div><span class="text-muted">${esc(i18n.t('register_company_reg'))}:</span> <strong>${esc(user.companyReg)}</strong></div>
                <div><span class="text-muted">${esc(i18n.t('register_company_country'))}:</span> <strong>${esc(user.companyCountry)}</strong></div>
                <div><span class="text-muted">${esc(i18n.t('register_company_vat'))}:</span> <strong>${esc(user.companyVat || 'N/A')}</strong></div>
              </div>
            </div>
            <div class="card">
              <h3 class="mb-16" data-i18n="profile_contact_info">${esc(i18n.t('profile_contact_info'))}</h3>
              <div style="display:flex;flex-direction:column;gap:12px;font-size:0.9rem">
                <div><span class="text-muted">${esc(i18n.t('register_contact_name'))}:</span> <strong>${esc(user.contactName)}</strong></div>
                <div><span class="text-muted">${esc(i18n.t('register_contact_email'))}:</span> <strong>${esc(user.email)}</strong></div>
                <div><span class="text-muted">${esc(i18n.t('register_contact_phone'))}:</span> <strong>${esc(user.contactPhone || 'N/A')}</strong></div>
                <div><span class="text-muted">${esc(i18n.t('register_contact_position'))}:</span> <strong>${esc(user.contactPosition || 'N/A')}</strong></div>
              </div>
            </div>
          </div>

          <div class="card mt-24">
            <h3 class="mb-16">Account Overview</h3>
            <div class="admin-stats">
              <div class="admin-stat-card"><div class="admin-stat-value">${userListings.filter(l => l.status === 'active').length}</div><div class="admin-stat-label" data-i18n="profile_listings_count">${esc(i18n.t('profile_listings_count'))}</div></div>
              <div class="admin-stat-card"><div class="admin-stat-value">${userMatches.length}</div><div class="admin-stat-label" data-i18n="profile_matches_count">${esc(i18n.t('profile_matches_count'))}</div></div>
              <div class="admin-stat-card"><div class="admin-stat-value">${formatDate(user.createdAt)}</div><div class="admin-stat-label" data-i18n="profile_member_since">${esc(i18n.t('profile_member_since'))}</div></div>
              <div class="admin-stat-card"><div class="admin-stat-value">${user.ndaAccepted ? 'Yes' : 'No'}</div><div class="admin-stat-label">NDA Accepted</div></div>
            </div>
          </div>

          ${user.documents && user.documents.length ? `
          <div class="card mt-24">
            <h3 class="mb-16">KYC Documents</h3>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${user.documents.map(d => `<div class="upload-file-item">${svgIcon('file')}<span class="file-name">${esc(d)}</span><span class="badge badge-${user.kycStatus === 'verified' ? 'success' : 'warning'}" style="margin-left:auto">${esc(user.kycStatus)}</span></div>`).join('')}
            </div>
          </div>` : ''}
        </div>
      </section>`;
  }

  // ============================================================
  // PAGE: Admin Panel
  // ============================================================
  function renderAdmin(main) {
    if (!store.isAdmin()) { navigate('home'); return; }
    const stats = store.getStats();

    main.innerHTML = `
      <section class="page-section">
        <div class="container">
          <div class="section-header">
            <h2 data-i18n="admin_title">${esc(i18n.t('admin_title'))}</h2>
          </div>

          <div class="admin-stats">
            <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalUsers}</div><div class="admin-stat-label" data-i18n="admin_total_users">${esc(i18n.t('admin_total_users'))}</div></div>
            <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalListings}</div><div class="admin-stat-label" data-i18n="admin_total_listings">${esc(i18n.t('admin_total_listings'))}</div></div>
            <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalMatches}</div><div class="admin-stat-label" data-i18n="admin_total_matches">${esc(i18n.t('admin_total_matches'))}</div></div>
            <div class="admin-stat-card"><div class="admin-stat-value">${formatCurrency(stats.estimatedRevenue, 'EUR')}</div><div class="admin-stat-label" data-i18n="admin_total_revenue">${esc(i18n.t('admin_total_revenue'))}</div></div>
          </div>

          <div class="tabs" id="admin-tabs">
            <button class="tab active" data-tab="pending" data-i18n="admin_pending_users">${esc(i18n.t('admin_pending_users'))}</button>
            <button class="tab" data-tab="users" data-i18n="admin_all_users">${esc(i18n.t('admin_all_users'))}</button>
            <button class="tab" data-tab="listings" data-i18n="admin_all_listings">${esc(i18n.t('admin_all_listings'))}</button>
          </div>
          <div id="admin-tab-content"></div>
        </div>
      </section>`;

    let activeTab = 'pending';

    function renderTab() {
      const content = document.getElementById('admin-tab-content');
      document.querySelectorAll('#admin-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));

      if (activeTab === 'pending') {
        const pending = store.getPendingUsers();
        if (!pending.length) {
          content.innerHTML = `<div class="empty-state"><h3 data-i18n="admin_no_pending">${esc(i18n.t('admin_no_pending'))}</h3></div>`;
        } else {
          content.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>${esc(i18n.t('admin_user_company'))}</th><th>${esc(i18n.t('admin_user_email'))}</th><th>Country</th><th>${esc(i18n.t('admin_user_date'))}</th><th>${esc(i18n.t('admin_user_actions'))}</th></tr></thead><tbody>
            ${pending.map(u => `<tr>
              <td><strong>${esc(u.companyName)}</strong><br><span class="text-muted" style="font-size:0.8rem">${esc(u.contactName)}</span></td>
              <td>${esc(u.email)}</td>
              <td>${esc(u.companyCountry)}</td>
              <td>${formatDate(u.createdAt)}</td>
              <td>
                <div style="display:flex;gap:8px">
                  <button class="btn btn-success btn-sm admin-approve-btn" data-id="${esc(u.id)}" data-i18n="admin_approve">${esc(i18n.t('admin_approve'))}</button>
                  <button class="btn btn-danger btn-sm admin-reject-btn" data-id="${esc(u.id)}" data-i18n="admin_reject">${esc(i18n.t('admin_reject'))}</button>
                  <button class="btn btn-ghost btn-sm admin-docs-btn" data-id="${esc(u.id)}" data-i18n="admin_view_docs">${esc(i18n.t('admin_view_docs'))}</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody></table></div>`;
        }
      } else if (activeTab === 'users') {
        const users = store.getUsers().filter(u => u.role !== 'admin');
        content.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>${esc(i18n.t('admin_user_company'))}</th><th>${esc(i18n.t('admin_user_email'))}</th><th>Country</th><th>${esc(i18n.t('admin_user_status'))}</th><th>${esc(i18n.t('admin_user_date'))}</th></tr></thead><tbody>
          ${users.map(u => {
            const statusBadge = { verified: 'success', pending: 'warning', rejected: 'error' }[u.kycStatus] || 'info';
            return `<tr>
              <td><strong>${esc(u.companyName)}</strong><br><span class="text-muted" style="font-size:0.8rem">${esc(u.contactName)}</span></td>
              <td>${esc(u.email)}</td>
              <td>${esc(u.companyCountry)}</td>
              <td><span class="badge badge-${statusBadge}">${esc(u.kycStatus)}</span></td>
              <td>${formatDate(u.createdAt)}</td>
            </tr>`;
          }).join('')}
        </tbody></table></div>`;
      } else if (activeTab === 'listings') {
        const listings = store.getListings();
        content.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>Type</th><th>Oil</th><th>Quantity</th><th>Price</th><th>Location</th><th>Seller</th><th>Date</th></tr></thead><tbody>
          ${listings.map(l => {
            const u = store.getUser(l.userId);
            return `<tr>
              <td><span class="tag tag-${l.type}">${esc(i18n.t('general_' + l.type))}</span></td>
              <td>${esc(i18n.t(l.oilType))}</td>
              <td>${l.quantity.toLocaleString()}</td>
              <td>${formatCurrency(l.price, l.currency)}</td>
              <td>${esc(l.deliveryLocation)}</td>
              <td>${u ? esc(u.companyName) : 'N/A'}</td>
              <td>${formatDate(l.createdAt)}</td>
            </tr>`;
          }).join('')}
        </tbody></table></div>`;
      }
      i18n.translatePage();
    }

    document.getElementById('admin-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) { activeTab = tab.dataset.tab; renderTab(); }
    });

    main.addEventListener('click', (e) => {
      const approveBtn = e.target.closest('.admin-approve-btn');
      const rejectBtn = e.target.closest('.admin-reject-btn');
      const docsBtn = e.target.closest('.admin-docs-btn');

      if (approveBtn) {
        store.updateUser(approveBtn.dataset.id, { kycStatus: 'verified' });
        showToast('User approved!', 'success');
        renderTab();
      }
      if (rejectBtn) {
        store.updateUser(rejectBtn.dataset.id, { kycStatus: 'rejected' });
        showToast('User rejected.', 'info');
        renderTab();
      }
      if (docsBtn) {
        const u = store.getUser(docsBtn.dataset.id);
        if (u) {
          showModal('KYC Documents — ' + u.companyName,
            `<div style="display:flex;flex-direction:column;gap:12px">
              ${(u.documents || []).map(d => `<div class="upload-file-item">${svgIcon('file')}<span class="file-name">${esc(d)}</span></div>`).join('')}
              ${(!u.documents || !u.documents.length) ? '<p class="text-muted">No documents uploaded.</p>' : ''}
            </div>`,
            `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Close</button>`
          );
        }
      }
    });

    renderTab();
  }

  // ============================================================
  // PAGE: Terms / Privacy (simple)
  // ============================================================
  function renderTerms(main) {
    main.innerHTML = `<section class="page-section"><div class="container" style="max-width:800px">
      <h2 class="mb-24">Terms of Service</h2>
      <div class="card" style="line-height:1.8;color:var(--text-secondary)">
        <h3>1. Acceptance of Terms</h3><p>By accessing and using the OilBridge platform operated by Sentari Holding BV, you agree to these terms of service.</p>
        <h3 class="mt-24">2. Platform Usage</h3><p>OilBridge provides a marketplace for verified traders to list and match oil trading opportunities. All users must complete KYC verification before trading.</p>
        <h3 class="mt-24">3. Commission</h3><p>A commission of 3.2% is charged on all successfully completed transactions facilitated through the platform.</p>
        <h3 class="mt-24">4. Liability</h3><p>Sentari Holding BV acts solely as an intermediary platform. We do not take ownership of traded commodities and are not liable for the quality, delivery, or performance of trades.</p>
        <h3 class="mt-24">5. Governing Law</h3><p>These terms are governed by the laws of the Netherlands and the European Union.</p>
      </div></div></section>`;
  }

  function renderPrivacy(main) {
    main.innerHTML = `<section class="page-section"><div class="container" style="max-width:800px">
      <h2 class="mb-24">Privacy Policy</h2>
      <div class="card" style="line-height:1.8;color:var(--text-secondary)">
        <h3>1. Data Collection</h3><p>We collect company information, personal contact details, and KYC documents necessary for platform operation and regulatory compliance.</p>
        <h3 class="mt-24">2. Data Usage</h3><p>Your data is used for identity verification, trade matching, communication between counterparties, and regulatory reporting.</p>
        <h3 class="mt-24">3. Data Protection</h3><p>We comply with GDPR and implement industry-standard security measures to protect your information.</p>
        <h3 class="mt-24">4. Data Sharing</h3><p>Contact details are shared with counterparties only after both parties accept a match. We do not sell data to third parties.</p>
        <h3 class="mt-24">5. Your Rights</h3><p>You have the right to access, correct, or delete your personal data. Contact info@sentari.nl for data requests.</p>
      </div></div></section>`;
  }

  // ============================================================
  // Onboarding
  // ============================================================
  const onboardingSteps = [
    { key: 'welcome', position: 'center' },
    { key: 'listings', selector: '[href="#listings"]', position: 'bottom' },
    { key: 'place', selector: '[href="#place-listing"]', position: 'bottom' },
    { key: 'matches', selector: '[href="#matches"]', position: 'bottom' },
    { key: 'profile', selector: '.user-menu-btn', position: 'bottom' },
  ];

  let onboardingIdx = 0;

  function startOnboarding() {
    onboardingIdx = 0;
    document.getElementById('onboarding-overlay').classList.remove('hidden');
    renderOnboardingStep();
  }

  function endOnboarding() {
    document.getElementById('onboarding-overlay').classList.add('hidden');
    const user = store.getCurrentUser();
    if (user) store.setOnboarded(user.id);
  }

  function renderOnboardingStep() {
    const step = onboardingSteps[onboardingIdx];
    const overlay = document.getElementById('onboarding-overlay');
    const tooltip = document.getElementById('onboarding-tooltip');
    const title = document.getElementById('onboarding-title');
    const desc = document.getElementById('onboarding-desc');
    const indicator = document.getElementById('onboarding-step-indicator');
    const prevBtn = document.getElementById('onboarding-prev');
    const nextBtn = document.getElementById('onboarding-next');

    title.textContent = i18n.t('onboarding_' + step.key + '_title');
    desc.textContent = i18n.t('onboarding_' + step.key + '_desc');

    indicator.innerHTML = onboardingSteps.map((_, i) =>
      `<div class="onboarding-step-dot ${i === onboardingIdx ? 'active' : ''}"></div>`
    ).join('');

    prevBtn.classList.toggle('hidden', onboardingIdx === 0);
    nextBtn.textContent = onboardingIdx === onboardingSteps.length - 1 ? i18n.t('onboarding_finish') : i18n.t('onboarding_next');

    if (step.position === 'center' || !step.selector) {
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
    } else {
      const target = document.querySelector(step.selector);
      if (target) {
        const rect = target.getBoundingClientRect();
        tooltip.style.transform = 'none';
        tooltip.style.top = (rect.bottom + 16) + 'px';
        tooltip.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 400)) + 'px';
      } else {
        tooltip.style.top = '50%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
      }
    }
  }

  // ============================================================
  // Event Setup
  // ============================================================
  function setupEvents() {
    // Route changes
    window.addEventListener('hashchange', render);

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('ob_theme', next);
      updateWatermark();
    });

    // Language select
    document.getElementById('lang-select').addEventListener('change', (e) => {
      i18n.setLocale(e.target.value);
      render();
    });

    // User menu
    document.getElementById('user-menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('user-dropdown').classList.toggle('open');
    });
    document.addEventListener('click', () => {
      document.getElementById('user-dropdown').classList.remove('open');
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      store.logout();
      document.getElementById('user-dropdown').classList.remove('open');
      showToast('Logged out successfully.', 'info');
      navigate('home');
    });

    // Mobile menu
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      document.getElementById('mobile-menu-btn').classList.toggle('open');
      document.getElementById('nav-links').classList.toggle('open');
      document.getElementById('mobile-overlay').classList.toggle('open');
    });
    document.getElementById('mobile-overlay').addEventListener('click', () => {
      document.getElementById('mobile-menu-btn').classList.remove('open');
      document.getElementById('nav-links').classList.remove('open');
      document.getElementById('mobile-overlay').classList.remove('open');
    });
    document.getElementById('nav-links').addEventListener('click', () => {
      document.getElementById('mobile-menu-btn').classList.remove('open');
      document.getElementById('nav-links').classList.remove('open');
      document.getElementById('mobile-overlay').classList.remove('open');
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    });

    // Onboarding
    document.getElementById('onboarding-skip').addEventListener('click', endOnboarding);
    document.getElementById('onboarding-prev').addEventListener('click', () => {
      if (onboardingIdx > 0) { onboardingIdx--; renderOnboardingStep(); }
    });
    document.getElementById('onboarding-next').addEventListener('click', () => {
      if (onboardingIdx < onboardingSteps.length - 1) { onboardingIdx++; renderOnboardingStep(); }
      else endOnboarding();
    });
    document.getElementById('onboarding-backdrop').addEventListener('click', endOnboarding);

    // Resize watermark
    window.addEventListener('resize', debounce(updateWatermark, 250));
  }

  // ============================================================
  // Init
  // ============================================================
  function init() {
    // Restore theme
    const savedTheme = localStorage.getItem('ob_theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

    // Restore language
    document.getElementById('lang-select').value = i18n.getLocale();

    setupEvents();
    render();
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
