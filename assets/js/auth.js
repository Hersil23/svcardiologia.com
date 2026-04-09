/**
 * SVC App - Auth Module
 * Login, logout, session management, role-based access
 */
const SVCAuth = (() => {

  const STORAGE_TOKEN = 'svc_token';
  const STORAGE_USER  = 'svc_user';

  // ── doLogin ───────────────────────────────
  async function doLogin(email, password) {
    const res = await SVC.api.post('auth.php?action=login', { email, password });

    if (res.success && res.data) {
      const { token, user } = res.data;
      SVC.auth.setSession(token, user);
      applyAuthState(user);
      return user;
    }

    throw new Error(res.message || 'Error al iniciar sesion');
  }

  // ── doLogout ──────────────────────────────
  async function doLogout() {
    try {
      await SVC.api.post('auth.php?action=logout', {});
    } catch {
      // Logout even if API call fails
    }

    SVC.auth.clearSession();
    clearAuthState();
    SVC.router.navigate('home');
  }

  // ── checkAuth ─────────────────────────────
  async function checkAuth() {
    const token = SVC.auth.getToken();
    if (!token) {
      clearAuthState();
      return false;
    }

    // Check token expiry client-side (JWT payload is base64)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp < Date.now() / 1000) {
        SVC.auth.clearSession();
        clearAuthState();
        return false;
      }
    } catch {
      SVC.auth.clearSession();
      clearAuthState();
      return false;
    }

    // Try to get fresh user data
    try {
      const userData = await refreshUserData();
      return !!userData;
    } catch {
      // Token might be invalid server-side
      SVC.auth.clearSession();
      clearAuthState();
      return false;
    }
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

    // Hide login, show app
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.classList.add('hidden');

    const app = document.getElementById('app');
    if (app) app.classList.add('ready');
  }

  function clearAuthState() {
    document.body.classList.remove('authenticated', 'role-member', 'role-admin', 'role-superadmin');

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.classList.remove('hidden');
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos dias';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  // ── Login Form Handler ────────────────────
  function initLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
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
        toggleBtn.setAttribute('aria-label', isPassword ? 'Ocultar contrasena' : 'Mostrar contrasena');
        // Swap icon via data attribute
        toggleBtn.dataset.visible = isPassword ? 'true' : 'false';
      });
    }

    // Form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim();
      const password = passInput.value;

      // Clear previous errors
      errorBox.classList.remove('visible');
      emailInput.classList.remove('error');
      passInput.classList.remove('error');

      // Basic validation
      if (!email) {
        showLoginError('Ingresa tu correo electronico', emailInput);
        return;
      }

      if (!password) {
        showLoginError('Ingresa tu contrasena', passInput);
        return;
      }

      // Start loading
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      try {
        const user = await doLogin(email, password);

        // Success animation
        if (typeof gsap !== 'undefined') {
          gsap.to('#login-screen', {
            opacity: 0,
            scale: 0.95,
            duration: 0.4,
            ease: 'power2.in',
            onComplete() {
              document.getElementById('login-screen').classList.add('hidden');
              // Animate dashboard in
              gsap.fromTo('#view-home .hero-welcome', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
              gsap.fromTo('#view-home .stats-grid .card', { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.1, ease: 'power3.out', delay: 0.15 });
            }
          });
        }

        SVC.toast.success(`Bienvenido, Dr. ${user.first_name || ''}`);

      } catch (err) {
        showLoginError(err.message || 'Credenciales invalidas');
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

    // Check existing session on load
    const token = SVC.auth.getToken();
    if (token) {
      // Try to restore session
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
    checkAuth,
    getAuthHeader,
    getCurrentUser,
    isAdmin,
    isSuperAdmin,
    refreshUserData,
    applyAuthState,
    clearAuthState
  };

})();
