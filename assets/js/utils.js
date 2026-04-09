/**
 * SVC App — Utility Functions
 */
const SVCUtils = (() => {

  // ── Date Formatting (Venezuelan DD/MM/YYYY) ──
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function formatTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mi}`;
  }

  function relativeTime(dateStr) {
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `hace ${days}d`;
    return formatDate(dateStr);
  }

  // ── Currency ──────────────────────────────
  function formatCurrency(amount, currency = 'USD') {
    const n = parseFloat(amount) || 0;
    if (currency === 'USD') return `$${n.toFixed(2)}`;
    return `Bs. ${n.toFixed(2)}`;
  }

  // ── Debounce ──────────────────────────────
  function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ── Throttle ──────────────────────────────
  function throttle(fn, limit = 200) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= limit) {
        last = now;
        fn.apply(this, args);
      }
    };
  }

  // ── DOM Helpers ───────────────────────────
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    }
    return e;
  }

  function clearEl(element) {
    element.replaceChildren();
    return element;
  }

  // ── SVG Icon Builder ──────────────────────
  function svgIcon(pathD, size = 24, strokeW = 1.5, color = 'var(--text-muted)') {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', color);
    svg.setAttribute('stroke-width', String(strokeW));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (Array.isArray(pathD)) {
      pathD.forEach(d => {
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', d);
        svg.appendChild(p);
      });
    } else {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', pathD);
      svg.appendChild(p);
    }
    return svg;
  }

  // Common icons
  const ICONS = {
    calendar: ['M3 4h18v18H3z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
    ticket: ['M2 9a3 3 0 010 6v2a2 2 0 002 2h16a2 2 0 002-2v-2a3 3 0 010-6V7a2 2 0 00-2-2H4a2 2 0 00-2 2z'],
    user: ['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 3a4 4 0 100 8 4 4 0 000-8z'],
    search: ['M11 3a8 8 0 100 16 8 8 0 000-16z', 'M21 21l-4.35-4.35'],
    plus: ['M12 5v14', 'M5 12h14'],
    check: ['M20 6L9 17l-5-5'],
    x: ['M18 6L6 18', 'M6 6l12 12'],
    download: ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    camera: ['M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z', 'M12 13a4 4 0 100-8 4 4 0 000 8z'],
    lock: ['M3 11h18v11H3z', 'M7 11V7a5 5 0 0110 0v4'],
    money: ['M12 1v22', 'M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
    chart: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
    refresh: ['M1 4v6h6', 'M23 20v-6h-6', 'M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15'],
    empty: ['M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z', 'M13 2v7h7'],
  };

  // ── Skeleton Loaders ──────────────────────
  function createSkeletons(count, height = 80) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const s = el('div', {
        class: 'card skeleton',
        style: { height: `${height}px`, marginBottom: '12px' }
      });
      frag.appendChild(s);
    }
    return frag;
  }

  // ── Empty State ───────────────────────────
  function createEmptyState(iconKey, message, actionText, actionFn) {
    const wrap = el('div', { class: 'empty-state' });
    const iconPaths = ICONS[iconKey] || ICONS.empty;
    wrap.appendChild(svgIcon(iconPaths, 48, 1.5));
    wrap.appendChild(el('p', { class: 'empty-state-text', text: message }));
    if (actionText && actionFn) {
      const btn = el('button', { class: 'btn btn-primary btn-sm mt-md', text: actionText, onClick: actionFn });
      wrap.appendChild(btn);
    }
    return wrap;
  }

  // ── Countdown ─────────────────────────────
  function startCountdown(targetDate, element) {
    function update() {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;
      if (diff <= 0) {
        element.textContent = 'En curso';
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const parts = [];
      if (d > 0) parts.push(`${d}d`);
      parts.push(`${String(h).padStart(2, '0')}h`);
      parts.push(`${String(m).padStart(2, '0')}m`);
      parts.push(`${String(s).padStart(2, '0')}s`);
      element.textContent = parts.join(' ');
    }
    update();
    return setInterval(update, 1000);
  }

  // ── Validate ──────────────────────────────
  function validateEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  function validateCedula(c) {
    return /^[VEJGvejg]-?\d{5,9}$/.test(c);
  }

  function validatePhone(p) {
    return /^[\d\s\-+()]{7,20}$/.test(p);
  }

  // ── Haptic Feedback ───────────────────────
  function haptic(duration = 10) {
    if (navigator.vibrate) navigator.vibrate(duration);
  }

  // ── CSV Export ─────────────────────────────
  function downloadCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => {
      let val = String(row[h] ?? '');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── GSAP Stagger Animations ───────────────
  function animateListIn(selector, delay = 0) {
    if (typeof gsap === 'undefined') return;
    gsap.fromTo(selector,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: 'power3.out', delay }
    );
  }

  function animateCardIn(element, delay = 0) {
    if (typeof gsap === 'undefined') return;
    gsap.fromTo(element,
      { opacity: 0, y: 15, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out', delay }
    );
  }

  // ── Pull to Refresh ───────────────────────
  function enablePullToRefresh(container, callback) {
    let startY = 0;
    let pulling = false;

    container.addEventListener('touchstart', (e) => {
      if (container.scrollTop === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const diff = e.touches[0].clientY - startY;
      if (diff > 0 && diff < 150) {
        container.style.transform = `translateY(${Math.min(diff * 0.4, 60)}px)`;
      }
    }, { passive: true });

    container.addEventListener('touchend', () => {
      if (!pulling) return;
      pulling = false;
      const current = parseFloat(container.style.transform.replace(/[^\d.]/g, '')) || 0;
      container.style.transition = 'transform 0.3s ease';
      container.style.transform = '';
      setTimeout(() => container.style.transition = '', 300);
      if (current >= 30) callback();
    }, { passive: true });
  }

  // ── Status Badge Helper ───────────────────
  function statusBadge(status) {
    const map = {
      active: { cls: 'badge-success', label: 'Activo' },
      pending: { cls: 'badge-warning', label: 'Pendiente' },
      expired: { cls: 'badge-error', label: 'Vencido' },
      suspended: { cls: 'badge-error', label: 'Suspendido' },
      approved: { cls: 'badge-success', label: 'Aprobado' },
      rejected: { cls: 'badge-error', label: 'Rechazado' },
      cancelled: { cls: 'badge-error', label: 'Cancelado' },
      used: { cls: 'badge-info', label: 'Usado' },
      valid: { cls: 'badge-success', label: 'Valido' },
      invalid: { cls: 'badge-error', label: 'Invalido' },
      already_used: { cls: 'badge-warning', label: 'Ya usado' },
    };
    const s = map[status] || { cls: 'badge-info', label: status || '—' };
    return el('span', { class: `badge ${s.cls}`, text: s.label });
  }

  // ── HTML Sanitization ──────────────────────
  function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.textContent;
  }

  // ── Inactivity Auto-Logout ────────────────
  let inactivityTimer = null;
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      if (typeof SVCAuth !== 'undefined' && SVCAuth.getCurrentUser()) {
        SVCAuth.doLogout();
        if (typeof SVC !== 'undefined') SVC.toast.warning('Sesion cerrada por inactividad');
      }
    }, INACTIVITY_TIMEOUT);
  }

  function initInactivityWatcher() {
    ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(evt => {
      document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
  }

  // ── Token Expiry Checker (every 5 min) ────
  function initTokenExpiryChecker() {
    setInterval(() => {
      const token = localStorage.getItem('svc_token');
      if (!token) return;
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp < Date.now() / 1000) {
          if (typeof SVCAuth !== 'undefined') SVCAuth.doLogout();
          if (typeof SVC !== 'undefined') SVC.toast.warning('Tu sesion ha expirado');
        }
      } catch { /* invalid token */ }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // ── QR Protection (disable right-click on QR) ──
  function protectQRElements() {
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.ticket-card-qr, .ticket-detail-qr')) {
        e.preventDefault();
      }
    });
  }

  // ── Init Security Features ────────────────
  function initSecurity() {
    initInactivityWatcher();
    initTokenExpiryChecker();
    protectQRElements();
  }

  return {
    formatDate, formatDateTime, formatTime, relativeTime,
    formatCurrency, debounce, throttle,
    el, clearEl, svgIcon, ICONS, createSkeletons, createEmptyState,
    startCountdown, validateEmail, validateCedula, validatePhone,
    haptic, downloadCSV, animateListIn, animateCardIn,
    enablePullToRefresh, statusBadge, sanitizeHTML, initSecurity
  };
})();
