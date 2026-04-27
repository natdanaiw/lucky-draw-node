(function attachAuthHelpers() {
  const TOKEN_KEY = 'lucky_draw_admin_token';

  function getToken() {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  }

  function clearToken() {
    window.localStorage.removeItem(TOKEN_KEY);
  }

  function getLoginUrl() {
    const current = `${window.location.pathname}${window.location.search}`;
    return `/login.html?redirect=${encodeURIComponent(current)}`;
  }

  function requireAdminAuth() {
    if (getToken()) return true;
    window.location.replace(getLoginUrl());
    return false;
  }

  function getAuthHeaders(baseHeaders) {
    const token = getToken();
    const headers = { ...(baseHeaders || {}) };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async function authFetch(url, options = {}) {
    const opts = { ...options };
    opts.headers = getAuthHeaders(options.headers);

    const response = await fetch(url, opts);

    if (response.status === 401) {
      clearToken();
      window.location.replace(getLoginUrl());
      return response;
    }

    return response;
  }

  function logout() {
    clearToken();
    window.location.replace('/login.html');
  }

  window.Auth = {
    getToken,
    setToken,
    clearToken,
    requireAdminAuth,
    authFetch,
    logout
  };
})();
