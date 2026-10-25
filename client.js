async function register({ registerHook, peertubeHelpers }) {
  try {
    var currentStatus = {
      autoRedirectLogin: true,
      showAccountLink: true,
      showLoginButton: true,
      showErrorHints: true,
      authBaseUrl: 'https://developer-console.yakhub.com.tr'
    };

    function saveReturnUrlBeforeLogin() {
      try {
        var currentPath = window.location.pathname + window.location.search + window.location.hash;
        if (currentPath && !window.location.pathname.includes('/login')) {
          localStorage.setItem('yaktube_return_url', currentPath);
          localStorage.setItem('yaktube_return_url_time', String(Date.now()));
          sessionStorage.setItem('yaktube_return_url', currentPath);
          sessionStorage.setItem('redirect-url-after-login', currentPath);
        }
      } catch (e) {}
    }

    function checkPendingPostLoginRedirect() {
      try {
        if (window.location.pathname.includes('/login')) return;
        var token = localStorage.getItem('access_token');
        if (!token) return;
        var savedUrl =
          localStorage.getItem('yaktube_return_url') ||
          sessionStorage.getItem('yaktube_return_url') ||
          sessionStorage.getItem('redirect-url-after-login');
        if (!savedUrl) return;
        var savedTime = parseInt(localStorage.getItem('yaktube_return_url_time') || '0', 10);
        localStorage.removeItem('yaktube_return_url');
        localStorage.removeItem('yaktube_return_url_time');
        sessionStorage.removeItem('yaktube_return_url');
        sessionStorage.removeItem('redirect-url-after-login');
        if (savedTime && Date.now() - savedTime > 15 * 60 * 1000) return;
        var currentFull = window.location.pathname + window.location.search + window.location.hash;
        if (
          typeof savedUrl === 'string' &&
          savedUrl.startsWith('/') &&
          !savedUrl.startsWith('//') &&
          !savedUrl.startsWith('/login') &&
          savedUrl !== currentFull
        ) {
          window.location.replace(savedUrl);
        }
      } catch (e) {}
    }

    checkPendingPostLoginRedirect();
    window.addEventListener('popstate', checkPendingPostLoginRedirect);
    setInterval(checkPendingPostLoginRedirect, 800);

    // Left Menu Hook for "YakNet Hesabım" Link (Configurable from Settings)
    if (typeof registerHook === 'function') {
      try {
        registerHook({
          target: 'filter:left-menu.links.create.result',
          handler: function (sections) {
            if (!currentStatus || currentStatus.showAccountLink === false) return sections;
            var token = localStorage.getItem('access_token');
            if (!token || !Array.isArray(sections)) return sections;

            var targetSec =
              sections.find(function (s) {
                return s && (s.key === 'my-video-space' || s.key === 'in-my-library' || s.key === 'library');
              }) || sections[0];

            if (targetSec && Array.isArray(targetSec.links)) {
              var already = targetSec.links.some(function (l) {
                return l && (l.key === 'yaknet-account' || l.label === 'YakNet Hesabım');
              });
              if (!already) {
                targetSec.links.push({
                  key: 'yaknet-account',
                  label: 'YakNet Hesabım',
                  url: (currentStatus.authBaseUrl || 'https://developer-console.yakhub.com.tr') + '/profile',
                  external: true,
                  svgIcon:
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>'
                });
              }
            }
            return sections;
          }
        });
      } catch (hookErr) {
        console.warn('[YakNet SSO] Left menu hook register error:', hookErr);
      }
    }

    // Dynamic UI Injector (Login Page Button, Error Hints & User Dropdown Link)
    function injectYakNetUI() {
      try {
        var isLoginPage = window.location.pathname.includes('/login');

        // 1. Error Hints on Login Page
        if (
          isLoginPage &&
          currentStatus.showErrorHints !== false &&
          window.location.search.includes('externalAuthError')
        ) {
          if (!document.getElementById('yaknet-auth-error-box')) {
            var targetContainer = document.querySelector('my-login, .login-container, .login-form, form');
            if (targetContainer) {
              var errBox = document.createElement('div');
              errBox.id = 'yaknet-auth-error-box';
              errBox.className = 'yaknet-auth-error-box';
              errBox.setAttribute('role', 'alert');
              errBox.innerHTML =
                '<div class="yaknet-error-title">⚠️ YakNet ile Giriş Yapılamadı</div>' +
                '<p class="yaknet-error-desc">' +
                'YakNet oturum isteği tamamlanamadı. Hesabınızın e-posta doğrulamasını yapmamış olabilir veya giriş isteğini iptal etmiş olabilirsiniz.' +
                '</p>' +
                '<div class="yaknet-error-actions">' +
                '<a href="/plugins/auth-yaknet/router/auth" class="yaknet-retry-btn">🔄 Tekrar Dene</a>' +
                '<a href="' +
                (currentStatus.authBaseUrl || 'https://developer-console.yakhub.com.tr') +
                '" target="_blank" rel="noopener noreferrer" class="yaknet-help-btn">🌐 YakNet Hesabını Kontrol Et ↗</a>' +
                '</div>';
              targetContainer.prepend(errBox);
            }
          }
        }

        // 2. Prominent YakNet Button on Login Page
        if (isLoginPage && currentStatus.showLoginButton !== false) {
          if (!document.getElementById('yaknet-sso-login-btn')) {
            var formElem = document.querySelector('form[name="loginForm"], .login-form, form');
            if (formElem) {
              var wrapper = document.createElement('div');
              wrapper.id = 'yaknet-sso-login-btn';
              wrapper.className = 'yaknet-sso-login-wrapper';
              wrapper.innerHTML =
                '<a href="/plugins/auth-yaknet/router/auth" class="yaknet-sso-btn" role="button">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>' +
                '<span>YakNet ile Tek Tıkla Giriş Yap</span>' +
                '</a>' +
                '<div class="yaknet-divider"><span>veya yerel hesap şifresiyle</span></div>';
              formElem.prepend(wrapper);

              wrapper.querySelector('.yaknet-sso-btn').addEventListener('click', function () {
                saveReturnUrlBeforeLogin();
              });
            }
          }
        }

        // 3. User Dropdown Menu Quick Link (when user is logged in)
        if (currentStatus.showAccountLink !== false) {
          var token = localStorage.getItem('access_token');
          if (token) {
            var userMenu = document.querySelector('.user-dropdown-menu, my-user-dropdown-content, .popover-content');
            if (userMenu && !userMenu.querySelector('.yaknet-dropdown-item')) {
              var accountLink = document.createElement('a');
              accountLink.className = 'dropdown-item yaknet-dropdown-item yaknet-account-link';
              accountLink.href = (currentStatus.authBaseUrl || 'https://developer-console.yakhub.com.tr') + '/profile';
              accountLink.target = '_blank';
              accountLink.rel = 'noopener noreferrer';
              accountLink.innerHTML =
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg> ' +
                '<span>YakNet Hesabımı Yönet ↗</span>';
              userMenu.appendChild(accountLink);
            }
          }
        }
      } catch (uiErr) {}
    }

    setInterval(injectYakNetUI, 1000);
    document.addEventListener('DOMContentLoaded', injectYakNetUI);

    // Fetch Plugin Configuration from Backend
    fetch('/plugins/auth-yaknet/router/status')
      .then(function (r) {
        return r.json();
      })
      .then(function (status) {
        if (status) {
          currentStatus = status;
        }

        injectYakNetUI();

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
                saveReturnUrlBeforeLogin();
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
