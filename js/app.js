/* ============================================================
   OilBridge — Main Application
   Router, Pages, Events, Onboarding, Watermark
   All page renderers are async (API-backed store).
   ============================================================ */

(function () {
  'use strict';

  const OIL_TYPES = ['oil_brent','oil_wti','oil_ural','oil_diesel','oil_gasoline','oil_jet','oil_fuel_oil','oil_lng','oil_lpg','oil_naphtha','oil_bitumen','oil_mazut'];
  const UNITS = ['unit_barrels','unit_mt','unit_liters','unit_gallons'];
  const CURRENCIES = ['USD','EUR','GBP'];
  const EU_COUNTRIES = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden'];

  let store;
  let activeEventSource = null;
  const i18n = new I18n();

  function closeActiveStream() {
    if (activeEventSource) {
      try { activeEventSource.close(); } catch {}
      activeEventSource = null;
    }
  }

  // === SEO: Dynamic per-page meta ===
  function setPageMeta(title, description) {
    const fullTitle = title ? title + ' | OilBridge' : "OilBridge — Europe's Trusted Oil Marketplace";
    document.title = fullTitle;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute('content', description || '');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', fullTitle);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description || '');
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', fullTitle);
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute('content', description || '');
  }

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
  async function render() {
    closeActiveStream();
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
      blog: renderBlog,
      'payment-success': renderPaymentSuccess,
      chat: renderChat,
    };

    const renderer = pages[route.page];
    if (renderer) {
      main.innerHTML = '';
      await renderer(main, route.param);
    } else {
      main.innerHTML = `<div class="page-section"><div class="container"><div class="empty-state"><div class="empty-state-icon">404</div><h3>Page not found</h3><p><a href="#home">Go home</a></p></div></div></div>`;
    }

    i18n.translatePage();
    window.scrollTo(0, 0);

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

    document.getElementById('auth-buttons').classList.toggle('hidden', !!user);
    document.getElementById('user-menu').classList.toggle('hidden', !user);

    if (user) {
      document.getElementById('user-avatar').textContent = (user.contactName || user.email)[0].toUpperCase();
      document.getElementById('user-name').textContent = user.contactName || user.email;
    }

    document.querySelectorAll('.auth-only').forEach(el => el.classList.toggle('hidden', !user));
    document.querySelectorAll('.verified-only').forEach(el => el.classList.toggle('hidden', !isVerified));
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));

    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href').slice(1);
      link.classList.toggle('active', href === route.page);
    });
  }

  // ============================================================
  // PAGE: Home
  // ============================================================
  async function renderHome(main) {
    setPageMeta(null, "Europe's leading B2B oil marketplace. Buy and sell crude oil, diesel, gasoline, jet fuel, LNG, and petrochemicals with KYC-verified traders across 27 EU countries.");
    const [publicStats, listings] = await Promise.all([
      store.getPublicStats(),
      store.getListings({ limit: 6 })
    ]);

    const completedDeals = publicStats.completedDeals || 0;
    const verifiedTraders = publicStats.verifiedTraders || 0;
    const activeListings = publicStats.activeListings || listings.length || 0;
    const totalVolumeEur = publicStats.totalVolumeEur || 0;

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
            <div class="hero-stat">
              <div class="hero-stat-value" data-count-to="${completedDeals}" data-format="number">0</div>
              <div class="hero-stat-label">Completed Deals</div>
            </div>
            <div class="hero-stat">
              <div class="hero-stat-value" data-count-to="${totalVolumeEur}" data-format="euro-compact">&euro;0</div>
              <div class="hero-stat-label">Total Volume Traded</div>
            </div>
            <div class="hero-stat">
              <div class="hero-stat-value" data-count-to="${verifiedTraders}" data-format="number">0</div>
              <div class="hero-stat-label">Verified Traders</div>
            </div>
            <div class="hero-stat">
              <div class="hero-stat-value" data-count-to="${activeListings}" data-format="number">0</div>
              <div class="hero-stat-label" data-i18n="hero_stat_listings">${esc(i18n.t('hero_stat_listings'))}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="trust-badges-section">
        <div class="container">
          <div class="trust-badges">
            <div class="trust-badge">
              <div class="trust-badge-icon">&#128737;</div>
              <div class="trust-badge-text">
                <div class="trust-badge-title">KYC Verified Traders</div>
                <div class="trust-badge-sub">Identity checked &amp; approved</div>
              </div>
            </div>
            <div class="trust-badge">
              <div class="trust-badge-icon">&#128274;</div>
              <div class="trust-badge-text">
                <div class="trust-badge-title">SSL Secured</div>
                <div class="trust-badge-sub">End-to-end encryption</div>
              </div>
            </div>
            <div class="trust-badge">
              <div class="trust-badge-icon">&#127466;&#127482;</div>
              <div class="trust-badge-text">
                <div class="trust-badge-title">EU Compliant</div>
                <div class="trust-badge-sub">GDPR &amp; NDA protected</div>
              </div>
            </div>
            <div class="trust-badge">
              <div class="trust-badge-icon">&#128179;</div>
              <div class="trust-badge-text">
                <div class="trust-badge-title">Stripe Secured Payments</div>
                <div class="trust-badge-sub">PCI-DSS compliant</div>
              </div>
            </div>
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

    // Animate count-up on all [data-count-to] elements
    requestAnimationFrame(() => startCountUpAnimations(main));
  }

  // Animated count-up from 0 to target, ~1.5s with easeOutQuart
  function startCountUpAnimations(root) {
    root.querySelectorAll('[data-count-to]').forEach(el => {
      const to = parseFloat(el.dataset.countTo) || 0;
      const format = el.dataset.format || 'number';
      countUpElement(el, to, 1500, format);
    });
  }

  function formatCountUp(value, format) {
    if (format === 'euro-compact') {
      if (value >= 1e9) return '€' + (value / 1e9).toFixed(1) + 'B';
      if (value >= 1e6) return '€' + (value / 1e6).toFixed(1) + 'M';
      if (value >= 1e3) return '€' + (value / 1e3).toFixed(1) + 'K';
      return '€' + Math.round(value).toLocaleString();
    }
    if (format === 'euro') return '€' + Math.round(value).toLocaleString();
    return Math.round(value).toLocaleString();
  }

  function countUpElement(el, to, duration, format) {
    if (to <= 0) { el.textContent = formatCountUp(0, format); return; }
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
      el.textContent = formatCountUp(to * eased, format);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderListingCard(listing) {
    const seller = listing.seller;
    return `
      <div class="listing-card" onclick="window.location.hash='#listing-detail/${esc(listing.id)}'">
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
  async function renderListings(main) {
    setPageMeta('Oil Listings — Buy & Sell Orders', 'Browse active buy and sell orders for crude oil, diesel, jet fuel, LNG, and more from verified European traders. Filter by oil type, price, and delivery location.');
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

    async function applyFilters() {
      const filters = {
        search: document.getElementById('filter-search').value,
        type: document.getElementById('filter-type').value,
        oilType: document.getElementById('filter-oil').value,
        sort: document.getElementById('filter-sort').value
      };
      const listings = await store.getListings(filters);
      const container = document.getElementById('listings-container');
      if (!container) return;
      if (!listings.length) {
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">&#128270;</div><h3 data-i18n="no_listings">${esc(i18n.t('no_listings'))}</h3><p data-i18n="no_listings_desc">${esc(i18n.t('no_listings_desc'))}</p></div>`;
      } else {
        container.innerHTML = listings.map(l => renderListingCard(l)).join('');
      }
    }

    const debouncedFilter = debounce(() => applyFilters(), 300);
    document.getElementById('filter-search').addEventListener('input', debouncedFilter);
    document.getElementById('filter-type').addEventListener('change', () => applyFilters());
    document.getElementById('filter-oil').addEventListener('change', () => applyFilters());
    document.getElementById('filter-sort').addEventListener('change', () => applyFilters());
    await applyFilters();
  }

  function debounce(fn, ms) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

  // ============================================================
  // PAGE: Listing Detail
  // ============================================================
  async function renderListingDetail(main, listingId) {
    setPageMeta('Listing Details', 'View oil listing details including quantity, price, delivery location, and commission breakdown.');
    const listing = await store.getListing(listingId);
    if (!listing || listing.error) {
      main.innerHTML = `<div class="page-section"><div class="container"><div class="empty-state"><h3>Listing not found</h3><a href="#listings" class="btn btn-primary">Back to Listings</a></div></div></div>`;
      return;
    }
    const seller = listing.seller;
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
      interestBtn.addEventListener('click', async () => {
        interestBtn.disabled = true;
        const result = await store.createMatch({ listingId: listing.id });
        if (result && result.success) {
          showToast(i18n.t('listing_interest_sent'), 'success');
          interestBtn.textContent = i18n.t('listing_interest_sent');
        } else {
          showToast((result && result.error) || 'Failed to express interest', 'error');
          interestBtn.disabled = false;
        }
      });
    }
  }

  // ============================================================
  // PAGE: Login
  // ============================================================
  function renderLogin(main) {
    if (store.isLoggedIn()) { navigate('home'); return; }
    setPageMeta('Login', 'Sign in to your OilBridge account to access the EU oil marketplace, manage listings, and view trade matches.');
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
        </div>
      </div>`;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const result = await store.login(email, password);
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
    if (store.isLoggedIn()) { navigate('home'); return; }
    setPageMeta('Register — Join the EU Oil Marketplace', 'Create your OilBridge account to start trading oil across Europe. KYC verification, NDA protection, and 3.2% transparent commission on completed trades.');
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
        `<div class="form-group"><label class="form-label" data-i18n="register_company_name">${esc(i18n.t('register_company_name'))}</label><input type="text" class="form-input" id="reg-company-name" value="${esc(formData.companyName || '')}" required></div>
         <div class="form-row">
           <div class="form-group"><label class="form-label" data-i18n="register_company_reg">${esc(i18n.t('register_company_reg'))}</label><input type="text" class="form-input" id="reg-company-reg" value="${esc(formData.companyReg || '')}" required></div>
           <div class="form-group"><label class="form-label" data-i18n="register_company_vat">${esc(i18n.t('register_company_vat'))}</label><input type="text" class="form-input" id="reg-company-vat" value="${esc(formData.companyVat || '')}"></div>
         </div>
         <div class="form-group"><label class="form-label" data-i18n="register_company_country">${esc(i18n.t('register_company_country'))}</label><select class="form-select" id="reg-company-country" required><option value="">Select country...</option>${countryOptions}</select></div>`,

        `<div class="form-group"><label class="form-label" data-i18n="register_contact_name">${esc(i18n.t('register_contact_name'))}</label><input type="text" class="form-input" id="reg-contact-name" value="${esc(formData.contactName || '')}" required></div>
         <div class="form-group"><label class="form-label" data-i18n="register_contact_email">${esc(i18n.t('register_contact_email'))}</label><input type="email" class="form-input" id="reg-contact-email" value="${esc(formData.email || '')}" required autocomplete="email"></div>
         <div class="form-row">
           <div class="form-group"><label class="form-label" data-i18n="register_contact_phone">${esc(i18n.t('register_contact_phone'))}</label><input type="tel" class="form-input" id="reg-contact-phone" value="${esc(formData.contactPhone || '')}"></div>
           <div class="form-group"><label class="form-label" data-i18n="register_contact_position">${esc(i18n.t('register_contact_position'))}</label><input type="text" class="form-input" id="reg-contact-position" value="${esc(formData.contactPosition || '')}"></div>
         </div>`,

        `<h3 class="mb-16" data-i18n="register_kyc_title">${esc(i18n.t('register_kyc_title'))}</h3>
         <p class="text-muted mb-16" style="font-size:0.9rem" data-i18n="register_kyc_desc">${esc(i18n.t('register_kyc_desc'))}</p>
         <div class="commission-banner" style="margin-bottom:24px">
           <div class="commission-banner-icon">&#128196;</div>
           <div class="commission-banner-text">Please upload a valid KYC document (ID card, passport or company registration). All accounts are <strong>manually reviewed by an administrator</strong> before being granted access to listings.</div>
         </div>
         <ul style="margin-bottom:24px;padding-left:20px;font-size:0.9rem;color:var(--text-secondary);line-height:2">
           <li data-i18n="register_kyc_company_reg">${esc(i18n.t('register_kyc_company_reg'))}</li>
           <li data-i18n="register_kyc_id">${esc(i18n.t('register_kyc_id'))}</li>
           <li data-i18n="register_kyc_address">${esc(i18n.t('register_kyc_address'))}</li>
         </ul>
         <div class="upload-zone" id="upload-zone">
           <div class="upload-zone-icon">${svgIcon('upload')}</div>
           <div class="upload-zone-text" data-i18n="register_kyc_upload_hint">${esc(i18n.t('register_kyc_upload_hint'))}</div>
           <div class="upload-zone-hint">PDF, JPG, PNG &middot; min 10 KB &middot; max 5 MB &middot; up to 5 files</div>
           <input type="file" id="file-input" multiple accept="application/pdf,image/jpeg,image/png" style="display:none">
         </div>
         <div class="upload-file-list" id="upload-file-list">${formData.documents.map(d => {
           const name = typeof d === 'object' ? d.name : d;
           const sizeKb = typeof d === 'object' && d.size ? (d.size / 1024).toFixed(1) + ' KB' : '';
           return `<div class="upload-file-item">${svgIcon('file')}<span class="file-name">${esc(name)}</span>${sizeKb ? `<span class="text-muted" style="font-size:0.75rem">${sizeKb}</span>` : ''}<button class="file-remove" data-file="${esc(name)}">&times;</button></div>`;
         }).join('')}</div>`,

        `<h3 class="mb-16" data-i18n="register_nda_title">${esc(i18n.t('register_nda_title'))}</h3>
         <p class="text-muted mb-24" style="font-size:0.9rem" data-i18n="register_nda_desc">${esc(i18n.t('register_nda_desc'))}</p>
         <div class="nda-content">
           <h4>NON-DISCLOSURE AGREEMENT</h4>
           <p>This Non-Disclosure Agreement ("Agreement") is entered into by and between OilBridge ("Company") and the undersigned party ("Recipient").</p>
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

        `<div class="form-group"><label class="form-label" data-i18n="register_password_label">${esc(i18n.t('register_password_label'))}</label><input type="password" class="form-input" id="reg-password" required autocomplete="new-password"><div class="form-hint" data-i18n="register_password_hint">${esc(i18n.t('register_password_hint'))}</div></div>
         <div class="form-group"><label class="form-label" data-i18n="register_password_confirm">${esc(i18n.t('register_password_confirm'))}</label><input type="password" class="form-input" id="reg-password-confirm" required autocomplete="new-password"></div>`
      ];
      return stepContent[currentStep] || '';
    }

    function renderForm() {
      const container = document.getElementById('register-step-content');
      container.innerHTML = renderCurrentStep();
      document.getElementById('register-steps-bar').innerHTML = renderSteps();
      document.getElementById('reg-prev-btn').classList.toggle('hidden', currentStep === 0);
      const nextBtn = document.getElementById('reg-next-btn');
      const submitBtn = document.getElementById('reg-submit-btn');
      nextBtn.classList.toggle('hidden', currentStep === steps.length - 1);
      submitBtn.classList.toggle('hidden', currentStep !== steps.length - 1);

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
            const fname = e.target.dataset.file;
            formData.documents = formData.documents.filter(d => (typeof d === 'object' ? d.name : d) !== fname);
            renderForm();
          });
        });
      }
      i18n.translatePage();
    }

    async function handleFiles(files) {
      const VALID_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      const MIN_SIZE = 10 * 1024;            // 10 KB
      const MAX_SIZE = 5 * 1024 * 1024;      // 5 MB
      const MAX_DOCS = 5;

      for (const file of Array.from(files)) {
        if (formData.documents.length >= MAX_DOCS) {
          showToast(`Maximum ${MAX_DOCS} documents allowed.`, 'error');
          break;
        }
        if (!VALID_TYPES.includes(file.type)) {
          showToast(`${file.name}: invalid file type. Only PDF, JPG, PNG accepted.`, 'error');
          continue;
        }
        if (file.size < MIN_SIZE) {
          showToast(`${file.name}: file too small (minimum 10 KB).`, 'error');
          continue;
        }
        if (file.size > MAX_SIZE) {
          showToast(`${file.name}: file too large (maximum 5 MB).`, 'error');
          continue;
        }
        if (formData.documents.find(d => (d.name || d) === file.name)) continue;

        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          formData.documents.push({ name: file.name, type: file.type, size: file.size, dataUrl });
        } catch {
          showToast(`Failed to read ${file.name}.`, 'error');
        }
      }
      renderForm();
    }

    function saveStepData() {
      switch (currentStep) {
        case 0:
          formData.companyName = document.getElementById('reg-company-name').value.trim();
          formData.companyReg = document.getElementById('reg-company-reg').value.trim();
          formData.companyVat = document.getElementById('reg-company-vat').value.trim();
          formData.companyCountry = document.getElementById('reg-company-country').value;
          if (!formData.companyName || !formData.companyReg || !formData.companyCountry) { showToast('Please fill in all required fields.', 'error'); return false; }
          break;
        case 1:
          formData.contactName = document.getElementById('reg-contact-name').value.trim();
          formData.email = document.getElementById('reg-contact-email').value.trim();
          formData.contactPhone = document.getElementById('reg-contact-phone').value.trim();
          formData.contactPosition = document.getElementById('reg-contact-position').value.trim();
          if (!formData.contactName || !formData.email) { showToast('Please fill in all required fields.', 'error'); return false; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { showToast('Please enter a valid email address.', 'error'); return false; }
          break;
        case 2:
          if (formData.documents.length === 0) { showToast('Please upload at least one KYC document.', 'error'); return false; }
          break;
        case 3:
          formData.ndaAccepted = document.getElementById('nda-accept').checked;
          if (!formData.ndaAccepted) { showToast('You must accept the NDA to continue.', 'error'); return false; }
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
    document.getElementById('reg-submit-btn').addEventListener('click', async () => {
      const pw = document.getElementById('reg-password').value;
      const pwConfirm = document.getElementById('reg-password-confirm').value;
      if (pw.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
      if (!/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) { showToast('Password must contain at least one uppercase letter and one number.', 'error'); return; }
      if (pw !== pwConfirm) { showToast('Passwords do not match.', 'error'); return; }
      formData.password = pw;
      const result = await store.createUser(formData);
      if (result && result.error) { showToast(result.error, 'error'); return; }
      showToast(i18n.t('register_success'), 'success');
      navigate('login');
    });
    renderForm();
  }

  // ============================================================
  // PAGE: Place Listing
  // ============================================================
  function renderPlaceListing(main) {
    setPageMeta('Place a Listing', 'Create a buy or sell order for crude oil, diesel, gasoline, jet fuel, LNG, or other petroleum products on the OilBridge marketplace.');
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
              <select class="form-select" id="pl-oil-type" required>${OIL_TYPES.map(o => `<option value="${o}">${esc(i18n.t(o))}</option>`).join('')}</select>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" data-i18n="place_quantity">${esc(i18n.t('place_quantity'))}</label><input type="number" class="form-input" id="pl-quantity" min="1" required></div>
              <div class="form-group"><label class="form-label" data-i18n="place_unit">${esc(i18n.t('place_unit'))}</label><select class="form-select" id="pl-unit">${UNITS.map(u => `<option value="${u}">${esc(i18n.t(u))}</option>`).join('')}</select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label" data-i18n="place_price">${esc(i18n.t('place_price'))}</label><input type="number" class="form-input" id="pl-price" min="0.01" step="0.01" required></div>
              <div class="form-group"><label class="form-label" data-i18n="place_currency">${esc(i18n.t('place_currency'))}</label><select class="form-select" id="pl-currency">${CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
            </div>
            <div class="form-group"><label class="form-label" data-i18n="place_delivery_location">${esc(i18n.t('place_delivery_location'))}</label><input type="text" class="form-input" id="pl-location" required placeholder="e.g. Rotterdam, Netherlands"></div>
            <div class="form-group"><label class="form-label" data-i18n="place_delivery_date">${esc(i18n.t('place_delivery_date'))}</label><input type="date" class="form-input" id="pl-date" required></div>
            <div class="form-group"><label class="form-label" data-i18n="place_notes">${esc(i18n.t('place_notes'))}</label><textarea class="form-textarea" id="pl-notes" placeholder="${esc(i18n.t('place_notes_hint'))}"></textarea></div>
            <button type="submit" class="btn btn-primary btn-block btn-lg" data-i18n="place_submit">${esc(i18n.t('place_submit'))}</button>
          </form>
        </div>
      </section>`;

    const typeRadios = document.querySelectorAll('input[name="listing-type"]');
    function updateTypeStyles() {
      document.getElementById('type-buy-label').style.borderColor = typeRadios[0].checked ? 'var(--accent)' : 'var(--border)';
      document.getElementById('type-sell-label').style.borderColor = typeRadios[1].checked ? 'var(--accent)' : 'var(--border)';
    }
    typeRadios.forEach(r => r.addEventListener('change', updateTypeStyles));
    updateTypeStyles();

    document.getElementById('place-listing-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
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
      const result = await store.createListing(data);
      if (result && result.success) {
        showToast(i18n.t('place_success'), 'success');
        navigate('listings');
      } else {
        showToast((result && result.error) || 'Failed to create listing', 'error');
      }
    });
  }

  // ============================================================
  // PAGE: My Matches
  // ============================================================
  async function renderMatches(main) {
    setPageMeta('My Matches', 'View and manage your matched oil trades. Accept matches to reveal counterparty contact details and complete transactions.');
    const user = store.getCurrentUser();
    if (!user) { navigate('login'); return; }
    const matches = await store.getMatches();

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

    main.addEventListener('click', async (e) => {
      const acceptBtn = e.target.closest('.match-accept-btn');
      const declineBtn = e.target.closest('.match-decline-btn');
      const stripeBtn = e.target.closest('.match-stripe-btn');

      if (acceptBtn) {
        await store.updateMatch(acceptBtn.dataset.id, { status: 'accepted' });
        showToast('Match accepted!', 'success');
        await renderMatches(main);
      }
      if (declineBtn) {
        await store.updateMatch(declineBtn.dataset.id, { status: 'declined' });
        showToast('Match declined.', 'info');
        await renderMatches(main);
      }
      if (stripeBtn) {
        stripeBtn.disabled = true;
        stripeBtn.innerHTML = '<span class="spinner"></span> Redirecting...';
        const result = await store.createPaymentSession(stripeBtn.dataset.matchid);
        if (result && result.url) {
          window.location.href = result.url;
        } else {
          stripeBtn.disabled = false;
          stripeBtn.innerHTML = `${svgIcon('stripe')} <span>${esc(i18n.t('match_pay_commission'))}</span>`;
          const errorMsg = (result && result.error) || 'Payment service unavailable';
          showToast(errorMsg, 'error');
        }
      }
    });
  }

  function renderMatchCard(match, user) {
    const listing = match.listing;
    const counterparty = match.counterparty;
    const isAccepted = match.status === 'accepted' || match.status === 'completed';
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
            <h4>${esc(i18n.t('match_counterparty'))}</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.9rem">
              <div><strong>Company:</strong> ${esc(counterparty.companyName)}</div>
              <div><strong>Country:</strong> ${esc(counterparty.companyCountry || 'N/A')}</div>
              <div style="grid-column:1/-1"><strong>Deal Reference:</strong> <code style="background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;font-size:0.85rem">${esc(match.dealRef || match.id)}</code></div>
            </div>
            <p style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);line-height:1.5">
              ${svgIcon('lock')} For security, personal contact details are never shared. All coordination — including after commission is paid — happens via the OilBridge chat below.
            </p>
          </div>` : `
          <div class="match-locked">
            ${svgIcon('lock')}
            <p style="margin-top:8px" data-i18n="match_contact_locked">${esc(i18n.t('match_contact_locked'))}</p>
          </div>`}
        </div>
        <div class="match-card-footer">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${match.status === 'pending' ? `
              <button class="btn btn-primary btn-sm match-accept-btn" data-id="${esc(match.id)}" data-i18n="match_accept">${esc(i18n.t('match_accept'))}</button>
              <button class="btn btn-ghost btn-sm match-decline-btn" data-id="${esc(match.id)}" data-i18n="match_decline">${esc(i18n.t('match_decline'))}</button>
            ` : ''}
            ${isAccepted
              ? `<a href="#chat/${esc(match.id)}" class="btn btn-primary btn-sm">&#128172; Open Chat</a>`
              : ''}
          </div>
          ${match.commissionPaid
            ? `<span class="badge badge-success" style="padding:8px 14px;font-size:0.8rem">${svgIcon('check')} Commission Paid &middot; Deal Confirmed</span>`
            : isAccepted
              ? `<button class="btn btn-secondary btn-sm match-stripe-btn" data-matchid="${esc(match.id)}">${svgIcon('stripe')} <span data-i18n="match_pay_commission">${esc(i18n.t('match_pay_commission'))}</span></button>`
              : ''}
        </div>
      </div>`;
  }

  // ============================================================
  // PAGE: Profile
  // ============================================================
  async function renderProfile(main) {
    setPageMeta('My Profile', 'Manage your OilBridge account, company information, KYC documents, and trading activity.');
    const user = store.getCurrentUser();
    if (!user) { navigate('login'); return; }
    const userListings = await store.getListings({ userId: user.id, all: true });
    const userMatches = await store.getMatches();

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
  async function renderAdmin(main) {
    setPageMeta('Admin Panel', 'OilBridge administration dashboard. Manage users, approve KYC applications, and monitor platform activity.');
    if (!store.isAdmin()) { navigate('home'); return; }
    const stats = await store.getStats();

    main.innerHTML = `
      <section class="page-section">
        <div class="container">
          <div class="section-header"><h2 data-i18n="admin_title">${esc(i18n.t('admin_title'))}</h2></div>
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
            <button class="tab" data-tab="chats">Chats</button>
          </div>
          <div id="admin-tab-content"></div>
        </div>
      </section>`;

    let activeTab = 'pending';

    async function renderTab() {
      const content = document.getElementById('admin-tab-content');
      if (!content) return;
      document.querySelectorAll('#admin-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));

      if (activeTab === 'pending') {
        const pending = await store.getPendingUsers();
        if (!pending.length) {
          content.innerHTML = `<div class="empty-state"><h3 data-i18n="admin_no_pending">${esc(i18n.t('admin_no_pending'))}</h3></div>`;
        } else {
          content.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>${esc(i18n.t('admin_user_company'))}</th><th>${esc(i18n.t('admin_user_email'))}</th><th>Country</th><th>${esc(i18n.t('admin_user_date'))}</th><th>${esc(i18n.t('admin_user_actions'))}</th></tr></thead><tbody>
            ${pending.map(u => `<tr>
              <td><strong>${esc(u.companyName)}</strong><br><span class="text-muted" style="font-size:0.8rem">${esc(u.contactName)}</span></td>
              <td>${esc(u.email)}</td><td>${esc(u.companyCountry)}</td><td>${formatDate(u.createdAt)}</td>
              <td><div style="display:flex;gap:8px">
                <button class="btn btn-success btn-sm admin-approve-btn" data-id="${esc(u.id)}">${esc(i18n.t('admin_approve'))}</button>
                <button class="btn btn-danger btn-sm admin-reject-btn" data-id="${esc(u.id)}">${esc(i18n.t('admin_reject'))}</button>
                <button class="btn btn-ghost btn-sm admin-docs-btn" data-id="${esc(u.id)}">${esc(i18n.t('admin_view_docs'))}</button>
              </div></td></tr>`).join('')}
          </tbody></table></div>`;
        }
      } else if (activeTab === 'users') {
        const users = await store.getUsers();
        content.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>${esc(i18n.t('admin_user_company'))}</th><th>${esc(i18n.t('admin_user_email'))}</th><th>Country</th><th>Docs</th><th>${esc(i18n.t('admin_user_status'))}</th><th>${esc(i18n.t('admin_user_date'))}</th><th>Actions</th></tr></thead><tbody>
          ${users.map(u => {
            const statusBadge = { verified: 'success', pending: 'warning', rejected: 'error' }[u.kycStatus] || 'info';
            const docCount = (u.documents || []).length;
            return `<tr><td><strong>${esc(u.companyName)}</strong><br><span class="text-muted" style="font-size:0.8rem">${esc(u.contactName)}</span></td>
              <td>${esc(u.email)}</td><td>${esc(u.companyCountry)}</td>
              <td>${docCount}</td>
              <td><span class="badge badge-${statusBadge}">${esc(u.kycStatus)}</span></td>
              <td>${formatDate(u.createdAt)}</td>
              <td><button class="btn btn-ghost btn-sm admin-docs-btn" data-id="${esc(u.id)}">Review</button></td></tr>`;
          }).join('')}
        </tbody></table></div>`;
      } else if (activeTab === 'listings') {
        const listings = await store.getListings({ all: true });
        content.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>Type</th><th>Oil</th><th>Quantity</th><th>Price</th><th>Location</th><th>Seller</th><th>Date</th></tr></thead><tbody>
          ${listings.map(l => `<tr>
            <td><span class="tag tag-${l.type}">${esc(i18n.t('general_' + l.type))}</span></td>
            <td>${esc(i18n.t(l.oilType))}</td><td>${l.quantity.toLocaleString()}</td>
            <td>${formatCurrency(l.price, l.currency)}</td><td>${esc(l.deliveryLocation)}</td>
            <td>${l.seller ? esc(l.seller.companyName) : 'N/A'}</td><td>${formatDate(l.createdAt)}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
      } else if (activeTab === 'chats') {
        const chats = await store.getAdminChats();
        if (!chats.length) {
          content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128172;</div><h3>No chats yet</h3><p>Conversations between matched traders will appear here.</p></div>`;
        } else {
          content.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>Match</th><th>Buyer</th><th>Seller</th><th>Messages</th><th>Blocked</th><th>Status</th><th>Last activity</th><th></th></tr></thead><tbody>
            ${chats.map(c => `<tr>
              <td><code style="font-size:0.75rem">${esc(c.matchId)}</code></td>
              <td>${esc(c.buyer || 'N/A')}</td>
              <td>${esc(c.seller || 'N/A')}</td>
              <td>${c.messageCount}</td>
              <td>${c.blockedCount > 0 ? `<span class="badge badge-error">${c.blockedCount}</span>` : '0'}</td>
              <td><span class="badge badge-${c.commissionPaid ? 'success' : 'warning'}">${c.commissionPaid ? 'paid' : esc(c.status)}</span></td>
              <td>${formatDate(c.lastMessageAt)}</td>
              <td><button class="btn btn-ghost btn-sm admin-chat-view-btn" data-id="${esc(c.matchId)}">View</button></td>
            </tr>`).join('')}
          </tbody></table></div>`;
        }
      }
      i18n.translatePage();
    }

    document.getElementById('admin-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) { activeTab = tab.dataset.tab; renderTab(); }
    });

    main.addEventListener('click', async (e) => {
      const approveBtn = e.target.closest('.admin-approve-btn');
      const rejectBtn = e.target.closest('.admin-reject-btn');
      const docsBtn = e.target.closest('.admin-docs-btn');
      const chatViewBtn = e.target.closest('.admin-chat-view-btn');

      if (chatViewBtn) {
        const data = await store.getAdminChatMessages(chatViewBtn.dataset.id);
        if (data && !data.error) {
          const msgsHtml = (data.messages || []).map(m => {
            const isBuyer = m.senderId === data.match.buyerId;
            const senderName = isBuyer ? (data.buyer && data.buyer.company_name) : (data.seller && data.seller.company_name);
            const time = new Date(m.createdAt).toLocaleString(i18n.getLocale());
            return `<div style="padding:10px 12px;background:${m.blocked ? 'var(--error-bg)' : 'var(--bg-tertiary)'};border-radius:var(--radius-sm);margin-bottom:6px;border-left:3px solid ${m.blocked ? 'var(--error)' : (isBuyer ? 'var(--info)' : 'var(--success)')}">
              <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">
                <strong>${esc(senderName || 'Unknown')}</strong> ${m.blocked ? `<span class="badge badge-error">BLOCKED: ${esc(m.blockedReason || '')}</span>` : ''}
                <span>${time}</span>
              </div>
              <div style="font-size:0.9rem">${esc(m.body)}</div>
            </div>`;
          }).join('');
          showModal('Chat — ' + chatViewBtn.dataset.id,
            `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
              <strong>${esc((data.buyer && data.buyer.company_name) || '?')}</strong> (buyer) &harr; <strong>${esc((data.seller && data.seller.company_name) || '?')}</strong> (seller)
              <br>Status: ${esc(data.match.status)} ${data.match.commissionPaid ? '&middot; commission paid' : ''}
            </div>
            <div style="max-height:400px;overflow-y:auto">${msgsHtml || '<p class="text-muted">No messages.</p>'}</div>`,
            `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Close</button>`
          );
        } else {
          showToast((data && data.error) || 'Failed to load chat', 'error');
        }
      }

      if (approveBtn) {
        await store.updateUser(approveBtn.dataset.id, { kycStatus: 'verified' });
        showToast('User approved!', 'success');
        await renderTab();
      }
      if (rejectBtn) {
        await store.updateUser(rejectBtn.dataset.id, { kycStatus: 'rejected' });
        showToast('User rejected.', 'info');
        await renderTab();
      }
      if (docsBtn) {
        const u = await store.getUser(docsBtn.dataset.id);
        if (u && !u.error) {
          const docsHtml = (u.documents || []).map(d => {
            const name = typeof d === 'object' ? d.name : d;
            const type = typeof d === 'object' ? d.type : '';
            const size = typeof d === 'object' && d.size ? (d.size / 1024).toFixed(1) + ' KB' : '';
            const dataUrl = typeof d === 'object' ? d.dataUrl : null;
            return `<div class="upload-file-item" style="padding:12px 14px">
              ${svgIcon('file')}
              <div style="flex:1;min-width:0">
                <div class="file-name">${esc(name)}</div>
                <div class="text-muted" style="font-size:0.75rem;margin-top:2px">${esc(type)} ${size ? '&middot; ' + size : ''}</div>
              </div>
              ${dataUrl
                ? `<a href="${dataUrl}" target="_blank" rel="noopener" download="${esc(name)}" class="btn btn-secondary btn-sm">View</a>`
                : '<span class="badge badge-warning">Legacy</span>'}
            </div>`;
          }).join('');

          // AI verification panel
          let aiPanel = '';
          if (u.aiVerification) {
            const v = u.aiVerification;
            const decisionClass = { verified: 'success', rejected: 'error', pending: 'warning' }[v.status] || 'info';
            const perDocResults = (v.results || []).map(r => `
              <div style="padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.8rem;margin-top:6px">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <strong>${esc(r.name)}</strong>
                  <span>${r.valid ? '&#10003;' : '&#10007;'} ${esc(r.document_type || 'unknown')} <span class="text-muted">(${esc(r.confidence)})</span></span>
                </div>
                <div class="text-muted" style="margin-top:4px">${esc(r.reason || '')}</div>
                ${r.company_name_match !== undefined ? `<div class="text-muted" style="margin-top:2px">Company name match: ${esc(String(r.company_name_match))}</div>` : ''}
              </div>
            `).join('');
            aiPanel = `
              <div style="margin-top:20px;padding:16px;background:var(--bg-tertiary);border:1px solid var(--accent-border);border-radius:var(--radius-sm)">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <strong style="color:var(--accent)">AI Verification</strong>
                  <span class="badge badge-${decisionClass}">${esc(v.status)}</span>
                  <span class="text-muted" style="font-size:0.75rem;margin-left:auto">${esc(v.model || '')} &middot; ${formatDate(v.timestamp)}</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary)">${esc(v.summary || '')}</div>
                ${perDocResults}
              </div>`;
          } else if (u.role !== 'admin') {
            aiPanel = `<div style="margin-top:16px;padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:0.85rem;color:var(--text-muted);text-align:center">
              No AI verification on file. ${u.documents && u.documents.length ? '<button class="btn btn-ghost btn-sm" id="modal-reverify-btn" data-id="' + esc(u.id) + '" style="margin-left:8px">Run AI Check</button>' : ''}
            </div>`;
          }

          const kycActions = u.role === 'admin' ? '' : `
            <div style="display:flex;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border);align-items:center">
              <button class="btn btn-success btn-sm" id="modal-approve-btn" data-id="${esc(u.id)}">Approve User</button>
              <button class="btn btn-danger btn-sm" id="modal-reject-btn" data-id="${esc(u.id)}">Reject User</button>
              ${u.aiVerification ? `<button class="btn btn-ghost btn-sm" id="modal-reverify-btn" data-id="${esc(u.id)}">Re-run AI</button>` : ''}
              <span class="badge badge-${{verified:'success',pending:'warning',rejected:'error'}[u.kycStatus] || 'info'}" style="margin-left:auto">${esc(u.kycStatus)}</span>
            </div>`;

          showModal('KYC Review — ' + u.companyName,
            `<div style="margin-bottom:12px;font-size:0.85rem;color:var(--text-secondary)">
              <strong>${esc(u.contactName)}</strong> &middot; ${esc(u.email)} &middot; ${esc(u.companyCountry)}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${docsHtml}
              ${(!u.documents || !u.documents.length) ? '<p class="text-muted">No documents uploaded.</p>' : ''}
            </div>
            ${aiPanel}
            ${kycActions}`,
            `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Close</button>`
          );

          // Wire up modal-level approve/reject/reverify buttons
          const approveBtn = document.getElementById('modal-approve-btn');
          const rejectBtn = document.getElementById('modal-reject-btn');
          const reverifyBtn = document.getElementById('modal-reverify-btn');
          if (approveBtn) approveBtn.addEventListener('click', async () => {
            await store.updateUser(approveBtn.dataset.id, { kycStatus: 'verified' });
            closeModal(); showToast('User approved.', 'success'); await renderTab();
          });
          if (rejectBtn) rejectBtn.addEventListener('click', async () => {
            await store.updateUser(rejectBtn.dataset.id, { kycStatus: 'rejected' });
            closeModal(); showToast('User rejected.', 'info'); await renderTab();
          });
          if (reverifyBtn) reverifyBtn.addEventListener('click', async () => {
            const r = await store.reverifyKyc(reverifyBtn.dataset.id);
            if (r && r.success) {
              showToast('AI verification re-started — refresh in a few seconds.', 'info');
              closeModal();
            } else {
              showToast((r && r.error) || 'Failed to start verification', 'error');
            }
          });
        }
      }
    });

    await renderTab();
  }

  // ============================================================
  // PAGE: Terms / Privacy
  // ============================================================
  // ============================================================
  // PAGE: Chat
  // ============================================================
  async function renderChat(main, matchId) {
    const user = store.getCurrentUser();
    if (!user) { navigate('login'); return; }
    if (!matchId) { navigate('matches'); return; }

    setPageMeta('Chat', 'Private chat between matched buyer and seller. All coordination happens on OilBridge — personal contact details are never shared.');

    const data = await store.getChatMessages(matchId);
    if (!data || data.error) {
      main.innerHTML = `<div class="page-section"><div class="container"><div class="empty-state"><h3>${esc((data && data.error) || 'Chat not available')}</h3><a href="#matches" class="btn btn-primary">Back to Matches</a></div></div></div>`;
      return;
    }

    const { match, messages } = data;
    const isAvailable = match.status === 'accepted' || match.status === 'completed';
    const dealRef = 'OB-' + String(matchId).slice(-8).toUpperCase();

    main.innerHTML = `
      <div class="chat-page">
        <a href="#matches" class="btn btn-ghost btn-sm mb-16">&larr; Back to Matches</a>

        ${!isAvailable ? `
          <div class="chat-closed-banner">
            <h3>&#9888; Chat Unavailable</h3>
            <p>Chat is only available for accepted matches.</p>
          </div>
        ` : match.commissionPaid ? `
          <div class="chat-confirmed-banner">
            <h3>&#10003; Deal Confirmed &middot; Commission Paid</h3>
            <p>Deal reference: <code>${esc(dealRef)}</code><br>
            All logistics coordination continues here on OilBridge. Personal contact details remain protected.</p>
          </div>
        ` : ''}

        <div class="chat-warning-banner">
          &#9888; <strong>Sharing personal contact details (email, phone, WhatsApp, Telegram, etc.) violates our Terms of Service and NDA agreement.</strong> All communication must remain on OilBridge, including after commission is paid. Attempts are automatically blocked and logged for admin review.
        </div>

        <div class="chat-header">
          <div class="chat-header-info">
            <h3>Deal <code>${esc(dealRef)}</code></h3>
            <div class="text-muted"><span class="chat-status-dot" id="chat-status-dot"></span><span id="chat-status-text">Connecting...</span></div>
          </div>
          ${isAvailable && !match.commissionPaid
            ? `<button class="btn btn-secondary btn-sm match-stripe-btn" data-matchid="${esc(matchId)}">${svgIcon('stripe')} Pay Commission</button>`
            : ''}
        </div>

        <div class="chat-body" id="chat-body">
          ${messages.length === 0
            ? '<div class="chat-empty">No messages yet. Use the templates below to coordinate logistics.</div>'
            : messages.map(m => renderChatMessage(m, user)).join('')}
        </div>

        ${isAvailable ? `
          <div class="chat-templates" id="chat-templates">
            <span class="chat-templates-label">Templates:</span>
            <button class="chat-template-btn" data-template="delivery_address">&#128205; Delivery</button>
            <button class="chat-template-btn" data-template="quantity">&#128230; Quantity</button>
            <button class="chat-template-btn" data-template="date">&#128197; Date</button>
            <button class="chat-template-btn" data-template="transport">&#128674; Transport</button>
            <button class="chat-template-btn" data-template="price">&#128176; Price</button>
            <button class="chat-template-btn" data-template="documents">&#128196; Documents</button>
          </div>
        ` : ''}

        <div class="chat-input">
          <textarea id="chat-input" placeholder="Type a message... (Shift+Enter for newline)" ${!isAvailable ? 'disabled' : ''}></textarea>
          <button class="btn btn-primary" id="chat-send-btn" ${!isAvailable ? 'disabled' : ''}>Send</button>
        </div>
      </div>`;

    const body = document.getElementById('chat-body');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const statusDot = document.getElementById('chat-status-dot');
    const statusText = document.getElementById('chat-status-text');

    body.scrollTop = body.scrollHeight;

    function appendMessage(msg) {
      // Remove empty placeholder if present
      const empty = body.querySelector('.chat-empty');
      if (empty) empty.remove();
      // Avoid duplicates (e.g. own message echoed via SSE)
      if (msg.id && body.querySelector(`[data-msg-id="${msg.id}"]`)) return;
      body.insertAdjacentHTML('beforeend', renderChatMessage(msg, user));
      body.scrollTop = body.scrollHeight;
    }

    function appendSystem(text, kind = 'success') {
      body.insertAdjacentHTML('beforeend', `<div class="chat-system ${kind}">${esc(text)}</div>`);
      body.scrollTop = body.scrollHeight;
    }

    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      const result = await store.sendChatMessage(matchId, text);
      sendBtn.disabled = false;
      if (!result) { showToast('Failed to send message', 'error'); return; }
      if (result.blocked) {
        showToast(result.message || 'Message blocked.', 'warning');
        // Show inline as a blocked own-message bubble
        appendMessage({ id: 'local-' + Date.now(), senderId: user.id, body: text, blocked: true, blockedReason: result.reason, createdAt: new Date().toISOString() });
        input.value = '';
        return;
      }
      if (result.error) { showToast(result.error, 'error'); return; }
      input.value = '';
      // Server will broadcast via SSE; we also append optimistically if SSE is slow
      if (result.message) appendMessage(result.message);
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Logistics template buttons
    const LOGISTICS_TEMPLATES = {
      delivery_address: '📍 Delivery address confirmation\n\nPort / terminal: \nCountry: \nReceiving party: \nSpecial handling instructions: ',
      quantity: '📦 Quantity confirmation\n\nProduct: \nQuantity: \nQuality specification: \nTolerance (+/- %): ',
      date: '📅 Delivery date proposal\n\nProposed loading window: \nProposed delivery date: \nFlexibility (+/- days): \nPlease confirm or suggest alternative.',
      transport: '🛳️ Transport details\n\nVessel / mode of transport: \nIncoterms (FOB / CIF / DES / DAP): \nETA at loading port: \nETA at discharge port: ',
      price: '💰 Final price confirmation\n\nAgreed unit price: \nCurrency: \nTotal contract value: \nPayment terms: ',
      documents: '📄 Documentation request\n\nPlease share the following via OilBridge chat:\n- Bill of Lading\n- SGS / Intertek inspection report\n- Certificate of Origin\n- Quality analysis certificate\n- Commercial invoice',
    };
    document.querySelectorAll('.chat-template-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = LOGISTICS_TEMPLATES[btn.dataset.template];
        if (!t) return;
        input.value = t;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    });

    // Stripe pay-commission button (in the chat header)
    const stripeBtn = main.querySelector('.match-stripe-btn');
    if (stripeBtn) stripeBtn.addEventListener('click', async () => {
      stripeBtn.disabled = true;
      const result = await store.createPaymentSession(matchId);
      if (result && result.url) { window.location.href = result.url; }
      else { stripeBtn.disabled = false; showToast((result && result.error) || 'Payment service unavailable', 'error'); }
    });

    // Open SSE for live updates (chat stays open before AND after payment)
    if (isAvailable && typeof EventSource !== 'undefined') {
      const es = new EventSource(store.chatStreamUrl(matchId));
      activeEventSource = es;

      es.addEventListener('open', () => {
        statusDot.classList.remove('disconnected');
        statusText.textContent = 'Live';
      });
      es.addEventListener('error', () => {
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Reconnecting...';
      });
      es.addEventListener('message', (e) => {
        try { appendMessage(JSON.parse(e.data)); } catch {}
      });
      es.addEventListener('deal_confirmed', () => {
        // Commission has been paid — chat stays OPEN so parties can continue
        // coordinating logistics. Contact details are never revealed.
        appendSystem('✓ Commission paid — deal confirmed. Continue coordinating logistics here on OilBridge.', 'success');
        // Remove the "Pay Commission" button if still present
        const sBtn = main.querySelector('.match-stripe-btn');
        if (sBtn) sBtn.remove();
      });
    } else if (!isAvailable) {
      statusDot.classList.add('disconnected');
      statusText.textContent = 'Closed';
    }
  }

  function renderChatMessage(msg, user) {
    const own = msg.senderId === user.id;
    const time = new Date(msg.createdAt).toLocaleTimeString(i18n.getLocale(), { hour: '2-digit', minute: '2-digit' });
    if (msg.blocked) {
      // Only the sender sees blocked content; recipients never receive it via the API
      return `<div class="chat-msg ${own ? 'own' : 'other'} blocked" data-msg-id="${esc(msg.id)}">
        <div class="chat-msg-bubble">&#9888; Message blocked: contained ${esc(msg.blockedReason || 'contact info')}.</div>
        <div class="chat-msg-meta">${time}</div>
      </div>`;
    }
    return `<div class="chat-msg ${own ? 'own' : 'other'}" data-msg-id="${esc(msg.id)}">
      <div class="chat-msg-bubble">${esc(msg.body)}</div>
      <div class="chat-msg-meta">${time}</div>
    </div>`;
  }

  // ============================================================
  // PAGE: Payment Success
  // ============================================================
  async function renderPaymentSuccess(main) {
    setPageMeta('Payment Successful', 'Your commission payment has been processed successfully.');
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const sessionId = params.get('session_id');

    let status = 'unknown';
    let matchId = null;
    if (sessionId) {
      const result = await store.verifyPaymentSession(sessionId);
      if (result && !result.error) {
        status = result.status;
        matchId = result.matchId;
      }
    }

    const isPaid = status === 'paid';
    main.innerHTML = `
      <section class="page-section">
        <div class="container" style="max-width:600px">
          <div class="card text-center" style="padding:48px 32px">
            <div style="font-size:4rem;margin-bottom:16px">${isPaid ? '&#9989;' : '&#9888;'}</div>
            <h2 style="margin-bottom:8px">${isPaid ? 'Payment Successful!' : 'Payment Status'}</h2>
            <p style="color:var(--text-secondary);margin-bottom:24px">${isPaid
              ? 'Your commission payment has been processed. The match is now marked as completed.'
              : 'We could not verify your payment status. If you completed the payment, it may take a moment to process.'}</p>
            ${matchId ? `<p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:24px">Match ID: ${esc(matchId)}</p>` : ''}
            <div style="display:flex;gap:12px;justify-content:center">
              <a href="#matches" class="btn btn-primary">View My Matches</a>
              <a href="#home" class="btn btn-secondary">Go Home</a>
            </div>
          </div>
        </div>
      </section>`;
  }

  // ============================================================
  // BLOG DATA & PAGES
  // ============================================================
  const BLOG_ARTICLES = [
    {
      slug: 'buy-oil-bulk-europe',
      icon: '&#128230;',
      tag: 'Buying Guide',
      title: 'How to Buy Oil in Bulk in Europe',
      excerpt: 'A comprehensive guide to purchasing crude oil, diesel, and refined petroleum products in bulk across the European Union.',
      date: '2026-03-15',
      readTime: '8 min read',
      meta: {
        title: 'How to Buy Oil in Bulk in Europe — Complete 2026 Guide',
        description: 'Learn how to buy crude oil, diesel, and petroleum products in bulk across the EU. Covers sourcing, pricing, logistics, regulations, and how to use B2B oil marketplaces.'
      },
      body: `
        <p>Purchasing oil in bulk across Europe is a complex but highly rewarding endeavour. Whether you are a refinery looking for crude feedstock, a fuel distributor sourcing diesel, or a manufacturer that needs naphtha for petrochemical processes, the European market offers significant opportunities — if you know how to navigate it.</p>

        <h2>Understanding the European Oil Market</h2>
        <p>The EU oil market is one of the largest in the world, with total consumption exceeding 10 million barrels per day. Key trading hubs include Rotterdam (the largest port in Europe), Antwerp, Hamburg, Le Havre, and Trieste. Prices are typically benchmarked against Brent Crude for crude oil, and Platts or Argus assessments for refined products.</p>
        <p>Unlike commodity exchanges where standardised contracts trade, bulk physical oil transactions are negotiated bilaterally between buyer and seller. This is where B2B oil marketplaces like OilBridge provide significant value — connecting verified counterparties and streamlining the discovery process.</p>

        <h2>Step 1: Define Your Requirements</h2>
        <p>Before approaching the market, clearly define what you need:</p>
        <ul>
          <li><strong>Product specification:</strong> Crude oil (Brent, Urals, CPC Blend), refined products (EN 590 diesel, Euro 5 gasoline, Jet A-1), or petrochemicals (naphtha, fuel oil, LPG).</li>
          <li><strong>Volume:</strong> Typical bulk lots range from 5,000 metric tons for refined products to 500,000+ barrels for crude.</li>
          <li><strong>Delivery terms:</strong> FOB (Free on Board), CIF (Cost, Insurance, Freight), DES (Delivered Ex-Ship), or DAP (Delivered at Place).</li>
          <li><strong>Delivery location:</strong> Name a specific port or tank farm. European buyers commonly take delivery at ARA (Amsterdam-Rotterdam-Antwerp), Mediterranean ports, or Baltic terminals.</li>
          <li><strong>Delivery window:</strong> Specify the date range with tolerances (e.g., 15-20 May 2026, +/- 3 days).</li>
        </ul>

        <h2>Step 2: Find Verified Sellers</h2>
        <p>This is where many buyers struggle. The physical oil market has historically been opaque, dominated by relationships built over decades. Traditional approaches include:</p>
        <ul>
          <li>Working with established trading houses (Vitol, Trafigura, Gunvor, Glencore)</li>
          <li>Direct refinery offtake agreements</li>
          <li>Broker networks</li>
          <li>Industry conferences and trade shows</li>
        </ul>
        <p>However, modern B2B oil marketplaces are changing this landscape. Platforms like OilBridge pre-verify sellers through KYC (Know Your Customer) procedures, ensuring you deal only with legitimate, licensed entities. This dramatically reduces counterparty risk and eliminates the problem of dealing with intermediaries who do not actually have access to product.</p>

        <h2>Step 3: Pricing and Negotiation</h2>
        <p>Oil prices in Europe are typically quoted as a differential to a benchmark:</p>
        <ul>
          <li><strong>Crude oil:</strong> Dated Brent +/- premium/discount</li>
          <li><strong>Diesel/Gasoil:</strong> ICE Gasoil futures + premium</li>
          <li><strong>Jet fuel:</strong> Platts CIF NWE Jet assessment + premium</li>
          <li><strong>Fuel oil:</strong> Platts 3.5% FOB Rotterdam assessment</li>
        </ul>
        <p>When negotiating, pay attention to the pricing basis date (5-day average, bill of lading date, etc.), payment terms (typically 30 days from B/L date via documentary letter of credit), and any quality premiums or discounts.</p>

        <h2>Step 4: Due Diligence and Compliance</h2>
        <p>EU regulations require thorough due diligence on your trading counterparties. Key compliance areas include:</p>
        <ul>
          <li><strong>Sanctions screening:</strong> Check all parties against EU, UN, and OFAC sanctions lists.</li>
          <li><strong>Origin verification:</strong> Ensure crude oil origin complies with current EU sanctions and import restrictions.</li>
          <li><strong>Environmental compliance:</strong> Verify product specifications meet EU environmental standards (sulfur limits, biofuel blend mandates).</li>
          <li><strong>Tax documentation:</strong> Ensure proper excise duty documentation for refined products moving across EU borders.</li>
        </ul>

        <h2>Step 5: Logistics and Delivery</h2>
        <p>Once terms are agreed, coordinate the physical delivery:</p>
        <ul>
          <li>Charter a vessel or book space on a scheduled tanker service</li>
          <li>Appoint an independent inspector (SGS, Intertek, Saybolt) for quantity and quality verification at loading and discharge</li>
          <li>Arrange insurance (marine cargo, P&I)</li>
          <li>Prepare all customs and excise documentation</li>
        </ul>

        <h2>Why Use OilBridge?</h2>
        <p>OilBridge simplifies this entire process by providing a single platform where you can browse sell orders from KYC-verified sellers, express interest, get matched automatically, and connect directly with counterparties. Our 3.2% commission is only charged on successfully completed transactions — there are no listing fees, subscription costs, or hidden charges.</p>

        <blockquote>Ready to start buying oil in bulk? <a href="#register">Register on OilBridge</a> today and gain access to verified sellers across 27 EU countries.</blockquote>
      `
    },
    {
      slug: 'eu-oil-marketplace-guide-sme',
      icon: '&#127970;',
      tag: 'Industry Guide',
      title: 'EU Oil Marketplace Guide for SME Companies',
      excerpt: 'How small and medium-sized enterprises can access the European oil market using digital B2B marketplaces and level the playing field.',
      date: '2026-03-22',
      readTime: '10 min read',
      meta: {
        title: 'EU Oil Marketplace Guide for SME Companies — Access the Oil Market',
        description: 'A guide for small and medium enterprises to access the European oil trading market. Learn how B2B oil marketplaces help SMEs compete with large trading houses.'
      },
      body: `
        <p>For decades, the European oil market has been dominated by major trading houses and large energy conglomerates. Small and medium-sized enterprises (SMEs) — independent fuel distributors, regional refineries, manufacturing companies, and logistics firms — have often found it difficult to access competitive pricing and reliable supply without established trading relationships.</p>
        <p>That dynamic is changing. Digital B2B oil marketplaces are democratising access to the physical oil market, giving SMEs the tools to discover counterparties, compare prices, and execute trades that were previously only available to the largest players.</p>

        <h2>The SME Challenge in Oil Trading</h2>
        <p>SMEs in the oil sector face several structural disadvantages:</p>
        <ul>
          <li><strong>Limited network:</strong> Without decades of relationship-building, SMEs have fewer trading contacts and often depend on a small number of suppliers, reducing their negotiating power.</li>
          <li><strong>Information asymmetry:</strong> Major traders have access to proprietary market intelligence, vessel tracking data, and extensive analyst teams. SMEs often rely on publicly available Platts and Argus assessments.</li>
          <li><strong>Credit constraints:</strong> Banks and counterparties require significant credit lines for oil trading. SMEs may struggle to obtain letters of credit at competitive rates.</li>
          <li><strong>Compliance burden:</strong> EU KYC, anti-money laundering (AML), and sanctions compliance requirements are the same regardless of company size, creating a disproportionate administrative burden for smaller firms.</li>
          <li><strong>Counterparty risk:</strong> Without a dedicated risk team, SMEs are more vulnerable to fraud, contract disputes, and non-performance.</li>
        </ul>

        <h2>How B2B Oil Marketplaces Help</h2>
        <p>Modern oil trading platforms address these challenges directly:</p>

        <h3>1. Counterparty Discovery</h3>
        <p>Instead of relying on personal networks, SMEs can browse verified buy and sell orders from across Europe. A Polish fuel distributor can discover a French refinery selling diesel, or a Spanish manufacturer can find a German trader offering naphtha — connections that might never have formed through traditional channels.</p>

        <h3>2. KYC Pre-Verification</h3>
        <p>Platforms like OilBridge verify all participants through document checks, company registration validation, and NDA agreements before granting marketplace access. This means every counterparty you engage with has already passed a compliance screening, dramatically reducing your due diligence workload.</p>

        <h3>3. Price Transparency</h3>
        <p>By aggregating buy and sell orders on a single platform, marketplaces create price transparency that benefits smaller players. You can see what prices others are offering and make more informed trading decisions.</p>

        <h3>4. Automated Matching</h3>
        <p>Smart matching algorithms connect compatible buy and sell orders automatically. If you post a buy order for 10,000 MT of EN 590 diesel delivered to Gdansk, and a seller lists a compatible offer, the platform creates a match and facilitates the introduction.</p>

        <h3>5. Reduced Transaction Costs</h3>
        <p>Traditional oil brokers charge commissions of 5-15 cents per barrel, and the process involves multiple phone calls, emails, and intermediaries. Digital platforms streamline this to a single commission (OilBridge charges 3.2%) with a clear, transparent process.</p>

        <h2>Getting Started as an SME</h2>
        <p>Here is a practical roadmap for SMEs looking to start trading on an oil marketplace:</p>

        <h3>Phase 1: Preparation (Week 1-2)</h3>
        <ul>
          <li>Gather your company registration documents, director ID, and proof of business address</li>
          <li>Prepare your VAT registration and any relevant trading licences</li>
          <li>Define your typical purchase/sale volumes and product specifications</li>
          <li>Identify your preferred delivery ports or terminals</li>
        </ul>

        <h3>Phase 2: Registration and Verification (Week 2-3)</h3>
        <ul>
          <li>Register on the platform and complete the multi-step verification process</li>
          <li>Upload KYC documents for review</li>
          <li>Read and accept the NDA to protect your trading information</li>
          <li>Wait for admin approval (typically 1-3 business days)</li>
        </ul>

        <h3>Phase 3: Market Exploration (Week 3-4)</h3>
        <ul>
          <li>Browse existing listings to understand current pricing and available products</li>
          <li>Use filters to find products matching your specifications</li>
          <li>Study the delivery locations and terms offered by different sellers</li>
        </ul>

        <h3>Phase 4: First Trade (Week 4+)</h3>
        <ul>
          <li>Place your first buy or sell listing with clear specifications</li>
          <li>Express interest in compatible listings from other traders</li>
          <li>When matched, review counterparty details and initiate direct negotiation</li>
          <li>Agree final terms and execute the trade through your normal commercial process</li>
        </ul>

        <h2>EU Regulatory Framework for SME Oil Traders</h2>
        <p>SMEs trading oil within the EU should be aware of several regulatory frameworks:</p>
        <ul>
          <li><strong>REACH Regulation:</strong> Chemical safety requirements for petroleum products</li>
          <li><strong>Fuel Quality Directive (2009/30/EC):</strong> Specifications for petrol and diesel fuels</li>
          <li><strong>Energy Taxation Directive:</strong> Minimum excise duty rates for energy products</li>
          <li><strong>EU Emissions Trading System (ETS):</strong> Carbon cost implications for refineries and large consumers</li>
          <li><strong>Anti-Money Laundering Directives:</strong> Due diligence obligations on business relationships</li>
        </ul>

        <h2>Success Stories</h2>
        <p>Across Europe, SMEs are already using digital platforms to transform their oil trading operations. Independent fuel distributors in Poland are sourcing diesel directly from refineries in Germany and the Netherlands, bypassing traditional middlemen and saving 2-4 EUR per metric ton. Regional airlines are procuring jet fuel through marketplace platforms rather than through the traditional into-plane supply monopolies.</p>

        <blockquote>OilBridge was built specifically for the European market, with multilingual support (EN, NL, DE, FR, PL, ES) and deep understanding of EU regulatory requirements. <a href="#register">Register your company</a> and start trading today.</blockquote>
      `
    },
    {
      slug: 'sell-surplus-oil-europe',
      icon: '&#128200;',
      tag: 'Selling Guide',
      title: 'How to Sell Surplus Oil Stocks in Europe',
      excerpt: 'Strategies for refineries, terminals, and traders to monetise excess oil inventory through European B2B marketplace channels.',
      date: '2026-04-02',
      readTime: '7 min read',
      meta: {
        title: 'How to Sell Surplus Oil Stocks in Europe — Monetise Excess Inventory',
        description: 'Learn how to sell excess crude oil, diesel, gasoline, and other petroleum products in Europe. Strategies for refineries, terminals, and traders to find buyers fast.'
      },
      body: `
        <p>Every refinery, terminal operator, and oil trader in Europe has faced the same challenge: you have surplus product that needs to move, and the clock is ticking. Storage costs accumulate daily, product quality can degrade over time, and market prices fluctuate constantly. Selling surplus oil stocks efficiently is not just about finding any buyer — it is about finding the right buyer at the best price in the shortest time.</p>

        <h2>Why Surplus Oil Stocks Accumulate</h2>
        <p>Surplus inventory in the European oil market typically arises from several scenarios:</p>
        <ul>
          <li><strong>Refinery overproduction:</strong> When a refinery run produces more of a specific product cut than the offtake agreements cover, the excess needs to find a spot market buyer.</li>
          <li><strong>Contract cancellations:</strong> A buyer defaults or reduces their contractual volume, leaving the seller with uncommitted barrels.</li>
          <li><strong>Seasonal demand shifts:</strong> Winter-grade diesel becomes surplus in spring; gasoline stocks build ahead of summer driving season.</li>
          <li><strong>Specification changes:</strong> Regulatory changes (e.g., IMO 2020 sulfur cap) can render existing stocks less marketable in their current form.</li>
          <li><strong>Strategic inventory management:</strong> Companies deliberately reduce storage holdings to free up working capital or tank capacity.</li>
        </ul>

        <h2>Traditional vs. Modern Selling Channels</h2>

        <h3>Traditional Methods</h3>
        <p>Historically, sellers relied on a combination of:</p>
        <ul>
          <li><strong>Direct phone calls</strong> to known buyers and trading houses</li>
          <li><strong>Broker networks</strong> — relationships with 2-3 trusted brokers who circulate offers to their buyer lists</li>
          <li><strong>Industry events</strong> — IP Week in London, European Petroleum Conference, APPEC</li>
          <li><strong>Email blasts</strong> — sending product offers to contact lists</li>
        </ul>
        <p>These methods work but are slow, limited in reach, and dependent on personal relationships. If your regular buyers do not need product at that moment, you are stuck.</p>

        <h3>Modern Marketplace Approach</h3>
        <p>B2B oil marketplaces like OilBridge offer a fundamentally different approach. By listing your surplus product on a platform with verified buyers across 27 EU countries, you instantly expand your reach from a handful of contacts to the entire European market.</p>

        <h2>Best Practices for Selling on OilBridge</h2>

        <h3>1. Write Detailed Listings</h3>
        <p>The more specific your listing, the faster it will attract serious buyers. Always include:</p>
        <ul>
          <li>Exact product specification (e.g., "EN 590 Diesel, CFPP -20C, sulfur max 10 ppm")</li>
          <li>Precise quantity available (e.g., "15,000 MT +/- 5%")</li>
          <li>Loading/delivery location with terminal name</li>
          <li>Available delivery window</li>
          <li>Pricing basis (fixed price or benchmark + differential)</li>
          <li>Incoterms (FOB, CIF, DAP)</li>
        </ul>

        <h3>2. Price Competitively</h3>
        <p>Review current listings on the platform to understand the competitive landscape. Pricing your surplus at a slight discount to prevailing market levels will generate faster interest. Remember that surplus stock has a carrying cost — a quick sale at a small discount often beats holding out for a premium that may never materialise.</p>

        <h3>3. Respond Quickly to Matches</h3>
        <p>When a buyer expresses interest and a match is created, respond promptly. In the oil market, prices move fast, and a buyer who is interested today may find alternative supply tomorrow. OilBridge notifications alert you immediately when a match occurs.</p>

        <h3>4. Keep Multiple Listings Active</h3>
        <p>If you regularly have surplus product, maintain active listings for different products and specifications. This maximises your visibility to potential buyers and increases the chance of automatic matching.</p>

        <h2>Tax and Regulatory Considerations</h2>
        <p>When selling oil products across EU borders, ensure proper handling of:</p>
        <ul>
          <li><strong>Excise duty:</strong> Products moving under duty suspension require EMCS (Excise Movement and Control System) documentation</li>
          <li><strong>VAT:</strong> Intra-community supplies are zero-rated under the reverse charge mechanism, but proper documentation (proof of transport, valid VAT numbers) is essential</li>
          <li><strong>Customs:</strong> Products imported from outside the EU may have different duty status</li>
          <li><strong>Certificates of origin:</strong> Some buyers require specific origin documentation for compliance reasons</li>
        </ul>

        <h2>Optimising Your Surplus Strategy</h2>
        <p>The most successful sellers on oil marketplaces treat the platform as a strategic channel, not just an emergency outlet. They:</p>
        <ul>
          <li>Maintain a consistent presence with regularly updated listings</li>
          <li>Build a reputation for reliable product quality and delivery performance</li>
          <li>Use marketplace pricing data to inform their broader trading strategy</li>
          <li>Develop repeat relationships with buyers discovered through the platform</li>
        </ul>

        <blockquote>Have surplus oil stocks to sell? <a href="#register">Register on OilBridge</a>, list your products, and reach verified buyers across the entire European Union. Our 3.2% commission is only charged when a trade is successfully completed.</blockquote>
      `
    }
  ];

  function renderBlog(main, slug) {
    if (slug) {
      const article = BLOG_ARTICLES.find(a => a.slug === slug);
      if (article) return renderBlogArticle(main, article);
    }
    return renderBlogIndex(main);
  }

  function renderBlogIndex(main) {
    setPageMeta('Blog — Oil Trading Insights & Guides', 'Expert guides on buying and selling oil in Europe, EU marketplace strategies for SMEs, and tips for trading petroleum products across the European Union.');
    main.innerHTML = `
      <section class="page-section">
        <div class="container">
          <div class="section-header">
            <h2>OilBridge Blog</h2>
            <p>Expert insights, guides, and strategies for trading oil in the European market.</p>
          </div>
          <div class="blog-grid">
            ${BLOG_ARTICLES.map(a => `
              <div class="blog-card" onclick="window.location.hash='#blog/${a.slug}'">
                <div class="blog-card-image">${a.icon}</div>
                <div class="blog-card-body">
                  <div class="blog-card-tag">${esc(a.tag)}</div>
                  <h3 class="blog-card-title">${esc(a.title)}</h3>
                  <p class="blog-card-excerpt">${esc(a.excerpt)}</p>
                  <div class="blog-card-meta">
                    <span>${formatDate(a.date)}</span>
                    <span>${esc(a.readTime)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>`;
  }

  function renderBlogArticle(main, article) {
    setPageMeta(article.meta.title, article.meta.description);

    // Article-specific JSON-LD
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": article.title,
      "description": article.meta.description,
      "datePublished": article.date,
      "author": { "@type": "Organization", "name": "OilBridge" },
      "publisher": { "@type": "Organization", "name": "OilBridge", "url": "https://oilbridge.eu" },
      "mainEntityOfPage": "https://oilbridge.eu/#blog/" + article.slug
    };

    main.innerHTML = `
      <section class="page-section">
        <div class="container">
          <div class="blog-article">
            <a href="#blog" class="btn btn-ghost mb-24">&larr; Back to Blog</a>
            <div class="blog-card-tag" style="margin-bottom:12px">${esc(article.tag)}</div>
            <h1>${esc(article.title)}</h1>
            <div class="article-meta">
              <span>Published ${formatDate(article.date)}</span>
              <span>${esc(article.readTime)}</span>
              <span>By OilBridge</span>
            </div>
            <div class="article-body">${article.body}</div>
            <div class="article-cta">
              <h3>Ready to Start Trading?</h3>
              <p>Join OilBridge and connect with verified oil traders across the European Union.</p>
              <a href="#register" class="btn btn-primary btn-lg">Create Your Account</a>
            </div>
          </div>
        </div>
      </section>
      <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  }

  // ============================================================
  // PAGE: Terms / Privacy
  // ============================================================
  function renderTerms(main) {
    setPageMeta('Terms of Service', 'OilBridge terms of service governing the use of the EU oil trading marketplace, commission structure, and liability.');
    main.innerHTML = `<section class="page-section"><div class="container" style="max-width:800px">
      <h2 class="mb-24">Terms of Service</h2>
      <div class="card" style="line-height:1.8;color:var(--text-secondary)">
        <h3>1. Acceptance of Terms</h3><p>By accessing and using the OilBridge platform, you agree to these terms of service.</p>
        <h3 class="mt-24">2. Platform Usage</h3><p>OilBridge provides a marketplace for verified traders to list and match oil trading opportunities. All users must complete KYC verification before trading.</p>
        <h3 class="mt-24">3. Commission</h3><p>A commission of 3.2% is charged on all successfully completed transactions facilitated through the platform.</p>
        <h3 class="mt-24">4. Liability</h3><p>OilBridge acts solely as an intermediary platform. We do not take ownership of traded commodities and are not liable for the quality, delivery, or performance of trades.</p>
        <h3 class="mt-24">5. Governing Law</h3><p>These terms are governed by the laws of the Netherlands and the European Union.</p>
      </div></div></section>`;
  }

  function renderPrivacy(main) {
    setPageMeta('Privacy Policy', 'OilBridge privacy policy detailing data collection, GDPR compliance, and how we protect your information on the oil trading platform.');
    main.innerHTML = `<section class="page-section"><div class="container" style="max-width:800px">
      <h2 class="mb-24">Privacy Policy</h2>
      <div class="card" style="line-height:1.8;color:var(--text-secondary)">
        <h3>1. Data Collection</h3><p>We collect company information, personal contact details, and KYC documents necessary for platform operation and regulatory compliance.</p>
        <h3 class="mt-24">2. Data Usage</h3><p>Your data is used for identity verification, trade matching, communication between counterparties, and regulatory reporting.</p>
        <h3 class="mt-24">3. Data Protection</h3><p>We comply with GDPR and implement industry-standard security measures to protect your information.</p>
        <h3 class="mt-24">4. Data Sharing</h3><p>Contact details are shared with counterparties only after both parties accept a match. We do not sell data to third parties.</p>
        <h3 class="mt-24">5. Your Rights</h3><p>You have the right to access, correct, or delete your personal data. Contact contact@oilbridge.eu for data requests.</p>
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
    const tooltip = document.getElementById('onboarding-tooltip');
    document.getElementById('onboarding-title').textContent = i18n.t('onboarding_' + step.key + '_title');
    document.getElementById('onboarding-desc').textContent = i18n.t('onboarding_' + step.key + '_desc');
    document.getElementById('onboarding-step-indicator').innerHTML = onboardingSteps.map((_, i) =>
      `<div class="onboarding-step-dot ${i === onboardingIdx ? 'active' : ''}"></div>`
    ).join('');
    document.getElementById('onboarding-prev').classList.toggle('hidden', onboardingIdx === 0);
    document.getElementById('onboarding-next').textContent = onboardingIdx === onboardingSteps.length - 1 ? i18n.t('onboarding_finish') : i18n.t('onboarding_next');

    if (step.position === 'center' || !step.selector) {
      tooltip.style.top = '50%'; tooltip.style.left = '50%'; tooltip.style.transform = 'translate(-50%, -50%)';
    } else {
      const target = document.querySelector(step.selector);
      if (target) {
        const rect = target.getBoundingClientRect();
        tooltip.style.transform = 'none';
        tooltip.style.top = (rect.bottom + 16) + 'px';
        tooltip.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 400)) + 'px';
      } else {
        tooltip.style.top = '50%'; tooltip.style.left = '50%'; tooltip.style.transform = 'translate(-50%, -50%)';
      }
    }
  }

  // ============================================================
  // Event Setup
  // ============================================================
  function setupEvents() {
    window.addEventListener('hashchange', () => render());

    document.getElementById('theme-toggle').addEventListener('click', () => {
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('ob_theme', next);
      updateWatermark();
    });

    document.getElementById('lang-select').addEventListener('change', (e) => {
      i18n.setLocale(e.target.value);
      render();
    });

    document.getElementById('user-menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('user-dropdown').classList.toggle('open');
    });
    document.addEventListener('click', () => document.getElementById('user-dropdown').classList.remove('open'));

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await store.logout();
      document.getElementById('user-dropdown').classList.remove('open');
      showToast('Logged out successfully.', 'info');
      navigate('home');
    });

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

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    });

    document.getElementById('onboarding-skip').addEventListener('click', endOnboarding);
    document.getElementById('onboarding-prev').addEventListener('click', () => { if (onboardingIdx > 0) { onboardingIdx--; renderOnboardingStep(); } });
    document.getElementById('onboarding-next').addEventListener('click', () => {
      if (onboardingIdx < onboardingSteps.length - 1) { onboardingIdx++; renderOnboardingStep(); }
      else endOnboarding();
    });
    document.getElementById('onboarding-backdrop').addEventListener('click', endOnboarding);

    window.addEventListener('resize', debounce(updateWatermark, 250));
  }

  // ============================================================
  // Init
  // ============================================================
  async function init() {
    const savedTheme = localStorage.getItem('ob_theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('lang-select').value = i18n.getLocale();

    store = new Store();
    await store.init();

    setupEvents();
    await render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})();
