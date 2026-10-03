async function register({ registerHook, peertubeHelpers }) {
  try {
    fetch('/plugins/auth-yaknet/router/status')
      .then(function (r) {
        return r.json();
      })
      .then(function (status) {
        if (!status || status.autoRedirectLogin === false) {
          return; // Auto redirect is disabled by administrator
        }

        var isLoginUrl = window.location.pathname.includes('/login');
        var isLocal = window.location.search.includes('local=true');
        var isError = window.location.search.includes('externalAuthError');
        var isExternalToken = window.location.search.includes('externalAuthToken');

        // CRITICAL: Never intercept /login when PeerTube is completing the externalAuthToken handshake!
        if (isLoginUrl && !isLocal && !isError && !isExternalToken) {
          window.location.replace('/plugins/auth-yaknet/router/auth');
          return;
        }

        // Intercept clicks on login links/buttons
        document.addEventListener(
          'click',
          function (e) {
            var el = e.target;
            if (el && el.closest) {
              var isLoginBtn = el.closest(
                'my-login-link, .login-button, a[href*="/login"]:not(#yaktube-show-admin-login), a[aria-label*="Giriş"], a[title*="Giriş"], a[title*="login"], a[aria-label*="login"]'
              );
              if (
                isLoginBtn &&
                !window.location.search.includes('local=true') &&
                !window.location.search.includes('externalAuthToken')
              ) {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = '/plugins/auth-yaknet/router/auth';
              }
            }
          },
          true
        );
      })
      .catch(function () {});

    // Alt+A shortcut for local admin login bypass
    document.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?local=true';
        }
      }
    });
  } catch (err) {
    console.warn('[YakNet SSO] Client init error:', err);
  }
}

export { register, register as registerClient };
export default register;
