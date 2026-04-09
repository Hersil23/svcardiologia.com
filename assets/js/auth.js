/**
 * SVC App - Auth Module
 * Login, logout, session management, token refresh, role-based access
 */
const SVCAuth = (() => {

  const STORAGE_TOKEN   = 'svc_token';
  const STORAGE_REFRESH = 'svc_refresh_token';
  const STORAGE_USER    = 'svc_user';
  const STORAGE_ACTIVITY = 'svc_last_activity';
  const STORAGE_REMEMBER = 'svc_remember';

  const INACTIVITY_MAX = 7 * 24 * 3600 * 1000; // 7 days
  const REFRESH_THRESHOLD = 24 * 3600;          // Refresh when <24h remaining
  const KEEPALIVE_INTERVAL = 10 * 60 * 1000;    // 10 minutes

  let keepAliveTimer = null;
  let isRefreshing = false;

  // ── doLogin ───────────────────────────────
  async function doLogin(email, password, remember = true) {
    const res = await SVC.api.post('auth.php?action=login', { email, password, remember });

    if (res.success && res.data) {
      const { token, refresh_token, user } = res.data;
      saveSession(token, refresh_token, user, remember);
      applyAuthState(user);
      startKeepAlive();
      return user;
    }

    throw new Error(res.message || 'Error al iniciar sesión');
  }

  // ── saveSession ──────────────────────────
  function saveSession(token, refreshToken, user, remember) {
    SVC.auth.setSession(token, user);
    localStorage.setItem(STORAGE_REFRESH, refreshToken);
    localStorage.setItem(STORAGE_REMEMBER, remember ? '1' : '0');
    updateActivity();
  }

  // ── doLogout ──────────────────────────────
  function doLogout() {
    stopKeepAlive();

    // Clear all local state immediately (don't wait for API)
    const token = SVC.auth.getToken();
    SVC.auth.clearSession();
    localStorage.removeItem(STORAGE_REFRESH);
    localStorage.removeItem(STORAGE_ACTIVITY);
    localStorage.removeItem(STORAGE_REMEMBER);
    localStorage.removeItem(STORAGE_USER);
    clearAuthState();

    // Fire-and-forget server logout
    if (token) {
      fetch('/api/auth.php?action=logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: '{}'
      }).catch(() => {});
    }
  }

  // ── Activity tracking ────────────────────
  function updateActivity() {
    localStorage.setItem(STORAGE_ACTIVITY, Date.now().toString());
  }

  function isInactiveTooLong() {
    const last = parseInt(localStorage.getItem(STORAGE_ACTIVITY) || '0');
    if (!last) return false;
    return (Date.now() - last) > INACTIVITY_MAX;
  }

  // ── JWT helpers ──────────────────────────
  function isValidJWTStructure(token) {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1]));
      return payload && payload.sub && payload.exp && payload.iss;
    } catch {
      return false;
    }
  }

  function getTokenExpiry(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp || 0;
    } catch {
      return 0;
    }
  }

  function isTokenExpired(token) {
    return getTokenExpiry(token) < (Date.now() / 1000);
  }

  function tokenNeedsRefresh(token) {
    const exp = getTokenExpiry(token);
    const remaining = exp - (Date.now() / 1000);
    return remaining < REFRESH_THRESHOLD;
  }

  // ── Token refresh ────────────────────────
  async function refreshTokens() {
    if (isRefreshing) return false;
    isRefreshing = true;

    const refreshToken = localStorage.getItem(STORAGE_REFRESH);
    if (!refreshToken) {
      isRefreshing = false;
      return false;
    }

    try {
      const res = await fetch('/api/auth.php?action=refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      const data = await res.json();

      if (data.success && data.data) {
        const { token, refresh_token: newRefresh, user } = data.data;
        const remember = localStorage.getItem(STORAGE_REMEMBER) === '1';
        saveSession(token, newRefresh, user, remember);
        applyAuthState(user);
        isRefreshing = false;
        return true;
      }
    } catch { /* refresh failed */ }

    isRefreshing = false;
    return false;
  }

  // ── Auto-refresh before API calls ────────
  async function ensureValidToken() {
    const token = SVC.auth.getToken();
    if (!token) return false;

    if (isTokenExpired(token)) {
      return await refreshTokens();
    }

    if (tokenNeedsRefresh(token)) {
      refreshTokens(); // fire and forget — current token still valid
    }

    return true;
  }

  // ── keepAlive ────────────────────────────
  function startKeepAlive() {
    stopKeepAlive();
    keepAliveTimer = setInterval(async () => {
      updateActivity();
      const token = SVC.auth.getToken();
      if (!token) return;

      if (tokenNeedsRefresh(token)) {
        await refreshTokens();
      } else {
        // Lightweight ping to keep server session alive
        try { await SVC.api.get('auth.php?action=me'); } catch { /* silent */ }
      }
    }, KEEPALIVE_INTERVAL);
  }

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  // ── checkAuth ─────────────────────────────
  async function checkAuth() {
    // Check 7-day inactivity
    if (isInactiveTooLong()) {
      SVC.auth.clearSession();
      localStorage.removeItem(STORAGE_REFRESH);
      localStorage.removeItem(STORAGE_ACTIVITY);
      clearAuthState();
      return false;
    }

    const token = SVC.auth.getToken();

    // No token at all
    if (!token || !isValidJWTStructure(token)) {
      // Try refresh if we have a refresh token
      const refreshToken = localStorage.getItem(STORAGE_REFRESH);
      if (refreshToken) {
        const refreshed = await refreshTokens();
        if (refreshed) {
          startKeepAlive();
          return true;
        }
      }
      SVC.auth.clearSession();
      clearAuthState();
      return false;
    }

    // Token expired — try refresh first
    if (isTokenExpired(token)) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        startKeepAlive();
        return true;
      }
      SVC.auth.clearSession();
      clearAuthState();
      return false;
    }

    // Token valid — verify with server
    try {
      const userData = await refreshUserData();
      if (userData) {
        startKeepAlive();
        updateActivity();
        // Proactively refresh if close to expiry
        if (tokenNeedsRefresh(token)) {
          refreshTokens();
        }
        return true;
      }
    } catch {
      // Server rejected — try refresh
      const refreshed = await refreshTokens();
      if (refreshed) {
        startKeepAlive();
        return true;
      }
    }

    SVC.auth.clearSession();
    clearAuthState();
    return false;
  }

  // ── getAuthHeader ─────────────────────────
  function getAuthHeader() {
    const token = SVC.auth.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // ── getCurrentUser ────────────────────────
  function getCurrentUser() {
    if (SVC.state.user) return SVC.state.user;

    const stored = localStorage.getItem(STORAGE_USER);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  }

  // ── isAdmin ───────────────────────────────
  function isAdmin() {
    const user = getCurrentUser();
    if (!user) return false;
    return ['superadmin', 'admin'].includes(user.role);
  }

  // ── isSuperAdmin ──────────────────────────
  function isSuperAdmin() {
    const user = getCurrentUser();
    return user?.role === 'superadmin';
  }

  // ── refreshUserData ───────────────────────
  async function refreshUserData() {
    const res = await SVC.api.get('auth.php?action=me');

    if (res.success && res.data) {
      const user = res.data;
      SVC.state.user = user;
      localStorage.setItem(STORAGE_USER, JSON.stringify(user));
      applyAuthState(user);
      return user;
    }

    return null;
  }

  // ── UI State Management ───────────────────
  function applyAuthState(user) {
    document.body.classList.add('authenticated');
    document.body.classList.remove('role-member', 'role-admin', 'role-superadmin');

    if (user?.role) {
      document.body.classList.add(`role-${user.role}`);
    }

    // Update home view greeting
    const heroName = document.querySelector('.hero-name');
    if (heroName && user) {
      heroName.textContent = `Dr. ${user.first_name || ''} ${user.last_name || ''}`.trim();
    }

    const heroGreeting = document.querySelector('.hero-greeting');
    if (heroGreeting) {
      heroGreeting.textContent = getGreeting();
    }

    // Update membership view
    const memberAvatar = document.querySelector('#view-membership .avatar-lg');
    if (memberAvatar && user) {
      memberAvatar.textContent = (user.first_name?.[0] || '') + (user.last_name?.[0] || '');
    }

    const memberName = document.querySelector('#view-membership .font-heading');
    if (memberName && user) {
      memberName.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }

    // Hide all pre-auth screens, show app
    const loginScreen = document.getElementById('login-screen');
    const welcomeScreen = document.getElementById('welcome-screen');
    const registerShell = document.getElementById('register-shell');

    if (loginScreen) { loginScreen.classList.add('hidden'); loginScreen.style.display = 'none'; }
    if (welcomeScreen) { welcomeScreen.classList.add('hidden'); welcomeScreen.style.display = 'none'; }
    if (registerShell) { registerShell.classList.remove('active'); }

    const app = document.getElementById('app');
    if (app) app.classList.add('ready');
  }

  function clearAuthState() {
    document.body.classList.remove('authenticated', 'role-member', 'role-admin', 'role-superadmin');

    // Show welcome screen, hide everything else
    const welcomeScreen = document.getElementById('welcome-screen');
    const loginScreen = document.getElementById('login-screen');
    const registerShell = document.getElementById('register-shell');
    const app = document.getElementById('app');

    if (welcomeScreen) { welcomeScreen.classList.remove('hidden'); welcomeScreen.style.display = ''; }
    if (loginScreen) { loginScreen.classList.add('hidden'); loginScreen.style.display = ''; }
    if (registerShell) registerShell.classList.remove('active');
    if (app) app.classList.remove('ready');
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  // ── Login Form Handler ────────────────────
  function initLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const rememberInput = document.getElementById('login-remember');
    const errorBox = document.getElementById('login-error');
    const errorMsg = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('login-submit');
    const card = document.querySelector('.login-card');
    const toggleBtn = document.getElementById('login-toggle-pass');

    // Password visibility toggle
    if (toggleBtn && passInput) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = passInput.type === 'password';
        passInput.type = isPassword ? 'text' : 'password';
        toggleBtn.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
        toggleBtn.dataset.visible = isPassword ? 'true' : 'false';
      });
    }

    // Form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim();
      const password = passInput.value;
      const remember = rememberInput ? rememberInput.checked : true;

      // Clear previous errors
      errorBox.classList.remove('visible');
      emailInput.classList.remove('error');
      passInput.classList.remove('error');

      if (!email) {
        showLoginError('Ingresa tu correo electrónico', emailInput);
        return;
      }

      if (!password) {
        showLoginError('Ingresa tu contraseña', passInput);
        return;
      }

      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      try {
        const user = await doLogin(email, password, remember);

        if (typeof gsap !== 'undefined') {
          gsap.to('#login-screen', {
            opacity: 0,
            scale: 0.95,
            duration: 0.4,
            ease: 'power2.in',
            onComplete() {
              document.getElementById('login-screen').classList.add('hidden');
              gsap.fromTo('#view-home .hero-welcome', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
              gsap.fromTo('#view-home .stats-grid .card', { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.1, ease: 'power3.out', delay: 0.15 });
            }
          });
        }

        SVC.toast.success(`Bienvenido, Dr. ${user.first_name || ''}`);

      } catch (err) {
        showLoginError(err.message || 'Credenciales inválidas');
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 500);
      } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
      }
    });

    function showLoginError(msg, focusInput) {
      errorMsg.textContent = msg;
      errorBox.classList.add('visible');
      if (focusInput) {
        focusInput.classList.add('error');
        focusInput.focus();
      }
    }
  }

  // ── Boot ──────────────────────────────────
  function init() {
    initLoginForm();

    // Init security features (QR protection, etc.)
    if (typeof SVCUtils !== 'undefined' && SVCUtils.initSecurity) {
      SVCUtils.initSecurity();
    }

    // Track activity on user interaction
    ['click', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
      document.addEventListener(evt, updateActivity, { passive: true });
    });

    // Check existing session on load
    const token = SVC.auth.getToken();
    const refreshToken = localStorage.getItem(STORAGE_REFRESH);

    if (token || refreshToken) {
      checkAuth().then(valid => {
        if (!valid) {
          clearAuthState();
        }
      });
    } else {
      clearAuthState();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ────────────────────────────
  return {
    doLogin,
    doLogout,
    logout: doLogout,
    checkAuth,
    ensureValidToken,
    refreshTokens,
    getAuthHeader,
    getCurrentUser,
    isAdmin,
    isSuperAdmin,
    refreshUserData,
    applyAuthState,
    clearAuthState
  };

})();
