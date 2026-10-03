const crypto = require('crypto');
const https = require('https');
const http = require('http');

let clientId = '';
let clientSecret = '';
let authBaseUrl = 'https://developer-console.yakhub.com.tr';
let customCallbackUrl = '';

function normalizeAuthUrl(urlStr) {
  if (typeof urlStr === 'string' && urlStr.includes('auth.yakhub.com.tr')) {
    return urlStr.replace('auth.yakhub.com.tr', 'developer-console.yakhub.com.tr');
  }
  return urlStr;
}

function postRequest(urlStr, data, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects while calling YakNet auth server'));
    }
    const safeUrlStr = normalizeAuthUrl(urlStr);
    const url = new URL(safeUrlStr);
    const postData = typeof data === 'string' ? data : new URLSearchParams(data).toString();
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'YakTube-SSO/1.0'
        }
      },
      res => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, safeUrlStr).toString();
          return resolve(postRequest(nextUrl, data, maxRedirects - 1));
        }

        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getRequest(urlStr, token, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects while calling YakNet auth server'));
    }
    const safeUrlStr = normalizeAuthUrl(urlStr);
    const url = new URL(safeUrlStr);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
          'User-Agent': 'YakTube-SSO/1.0'
        }
      },
      res => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, safeUrlStr).toString();
          return resolve(getRequest(nextUrl, token, maxRedirects - 1));
        }

        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function register({ registerExternalAuth, registerSetting, settingsManager, getRouter, peertubeHelpers }) {
  const logger = peertubeHelpers.logger;
  const webserverUrl = (peertubeHelpers.config.getWebserverUrl() || '').replace(/\/+$/, '');
  const isOfficialYakTube = webserverUrl.includes('yaktube.yakhub.com.tr');
  // Standard PeerTube plugin router path uses short name (/plugins/auth-yaknet/router/auth-callback)
  const defaultCallbackUrl = isOfficialYakTube
    ? `${webserverUrl}/plugins/peertube-plugin-auth-yaknet/router/auth-callback`
    : `${webserverUrl}/plugins/auth-yaknet/router/auth-callback`;

  registerSetting({
    name: 'client-id',
    label: 'YakNet Client ID',
    type: 'input',
    description: 'Your YakNet OAuth2 Client ID',
    private: false,
    default: ''
  });

  registerSetting({
    name: 'client-secret',
    label: 'YakNet Client Secret',
    type: 'input-password',
    description: 'Your YakNet OAuth2 Client Secret',
    private: true,
    default: ''
  });

  registerSetting({
    name: 'auth-base-url',
    label: 'YakNet Auth URL',
    type: 'input',
    description: 'YakNet SSO Server URL (Default: https://developer-console.yakhub.com.tr)',
    private: false,
    default: 'https://developer-console.yakhub.com.tr'
  });

  registerSetting({
    name: 'callback-url',
    label: 'OAuth Callback (Redirect) URL (Opsiyonel)',
    type: 'input',
    description: `Boş bırakılırsa otomatik olarak "${defaultCallbackUrl}" kullanılır. YakNet Geliştirici Konsolu'nda tanımladığınız Redirect URI adresini buraya yazabilirsiniz.`,
    private: false,
    default: ''
  });

  registerSetting({
    name: 'auto-redirect-login',
    label: "Giriş Sayfasında Doğrudan YakNet SSO'ya Yönlendir",
    type: 'input-checkbox',
    description:
      'Aktif olduğunda, kullanıcılar giriş butonuna veya /login sayfasına gittiğinde standart PeerTube şifre formu yerine doğrudan YakNet SSO sunucusuna yönlendirilir.',
    private: false,
    default: true
  });

  let autoRedirectLogin = true;

  function syncConfigFiles(enable) {
    const fs = require('fs');
    const path = require('path');

    // Update in-memory PeerTube ServerConfig if accessible
    try {
      const srvCfg = peertubeHelpers.config.getServerConfig();
      if (srvCfg && srvCfg.client && srvCfg.client.menu && srvCfg.client.menu.login) {
        srvCfg.client.menu.login.redirectOnSingleExternalAuth = enable;
      }
    } catch (e) {}

    // 1. Update local-production.json if present
    const jsonCandidates = [
      path.resolve(process.cwd(), 'config', 'local-production.json'),
      path.resolve(__dirname, '..', '..', 'config', 'local-production.json'),
      path.resolve(__dirname, '..', '..', '..', 'config', 'local-production.json'),
      'c:/laragon/www/yaktube.yakhub.com.tr/config/local-production.json'
    ];
    for (const jPath of jsonCandidates) {
      if (fs.existsSync(jPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(jPath, 'utf8'));
          if (!cfg.menu) cfg.menu = {};
          if (!cfg.menu.login) cfg.menu.login = {};
          if (cfg.menu.login.redirect_on_single_external_auth !== enable) {
            cfg.menu.login.redirect_on_single_external_auth = enable;
            fs.writeFileSync(jPath, JSON.stringify(cfg, null, 2), 'utf8');
            logger.info(`[YakNet SSO] Synced local-production.json redirect_on_single_external_auth = ${enable}`);
          }
        } catch (e) {
          logger.warn('[YakNet SSO] Error updating local-production.json:', e.message);
        }
        break;
      }
    }

    // 2. Update production.yaml if present
    const yamlCandidates = [
      path.resolve(process.cwd(), 'config', 'production.yaml'),
      path.resolve(__dirname, '..', '..', 'config', 'production.yaml'),
      path.resolve(__dirname, '..', '..', '..', 'config', 'production.yaml'),
      'c:/laragon/www/yaktube.yakhub.com.tr/config/production.yaml'
    ];
    for (const yPath of yamlCandidates) {
      if (fs.existsSync(yPath)) {
        try {
          let yContent = fs.readFileSync(yPath, 'utf8');
          const pattern = /(redirect_on_single_external_auth:\s*)(true|false)/;
          if (pattern.test(yContent)) {
            const updated = yContent.replace(pattern, `$1${enable}`);
            if (updated !== yContent) {
              fs.writeFileSync(yPath, updated, 'utf8');
              logger.info(`[YakNet SSO] Synced production.yaml redirect_on_single_external_auth = ${enable}`);
            }
          }
        } catch (e) {
          logger.warn('[YakNet SSO] Error updating production.yaml:', e.message);
        }
        break;
      }
    }
  }

  async function loadSettings() {
    const cid = await settingsManager.getSetting('client-id');
    const csec = await settingsManager.getSetting('client-secret');
    const burl = await settingsManager.getSetting('auth-base-url');
    const cburl = await settingsManager.getSetting('callback-url');
    const autoRedir = await settingsManager.getSetting('auto-redirect-login');
    if (cid) clientId = String(cid).trim();
    if (csec) clientSecret = String(csec).trim();
    if (burl && String(burl).trim()) {
      authBaseUrl = normalizeAuthUrl(String(burl).trim().replace(/\/+$/, ''));
    }
    customCallbackUrl = cburl ? String(cburl).trim() : '';
    if (autoRedir !== undefined && autoRedir !== null) {
      autoRedirectLogin = autoRedir === true || autoRedir === 'true';
    } else {
      autoRedirectLogin = true;
    }
    syncConfigFiles(autoRedirectLogin);
  }
  await loadSettings();
  settingsManager.onSettingsChange(loadSettings);

  function getActiveCallbackUrl() {
    return customCallbackUrl || defaultCallbackUrl;
  }

  async function dbQuery(sql, bindParams = []) {
    if (!peertubeHelpers || !peertubeHelpers.database || typeof peertubeHelpers.database.query !== 'function') {
      return [];
    }
    const res = await peertubeHelpers.database.query(sql, { bind: bindParams });
    if (Array.isArray(res) && Array.isArray(res[0])) return res[0];
    return Array.isArray(res) ? res : [];
  }

  const externalAuth = registerExternalAuth({
    authName: 'yaknet',
    authDisplayName: () => 'YakNet ile Giriş Yap',
    onAuthRequest: (req, res) => {
      const state = crypto.randomBytes(16).toString('hex');
      const cbUrl = getActiveCallbackUrl();
      const authUrl = `${normalizeAuthUrl(authBaseUrl)}/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(cbUrl)}&response_type=code&scope=&state=${state}`;
      return res.redirect(authUrl);
    }
  });

  const router = getRouter();

  router.get('/status', (req, res) => {
    return res.json({
      autoRedirectLogin: autoRedirectLogin !== false,
      callbackUrl: getActiveCallbackUrl()
    });
  });

  router.get('/auth', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const cbUrl = getActiveCallbackUrl();
    const authUrl = `${normalizeAuthUrl(authBaseUrl)}/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(cbUrl)}&response_type=code&scope=&state=${state}`;
    return res.redirect(authUrl);
  });

  async function handleOAuthCallback(req, res) {
    await loadSettings();
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
      logger.error('YakNet OAuth Error: ' + error);
      return res.redirect('/login?externalAuthError=true&error=' + encodeURIComponent(error));
    }

    if (!code) {
      return res.redirect('/login?externalAuthError=true');
    }

    try {
      const targetAuthUrl = normalizeAuthUrl(authBaseUrl);
      const cbUrl = getActiveCallbackUrl();
      const tokenRes = await postRequest(`${targetAuthUrl}/oauth/token`, {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: cbUrl,
        code: code
      });

      if (!tokenRes.data || !tokenRes.data.access_token) {
        logger.error('Failed to get access token from YakNet: ' + JSON.stringify(tokenRes));
        return res.redirect('/login?externalAuthError=true');
      }

      const accessToken = tokenRes.data.access_token;
      const userRes = await getRequest(`${targetAuthUrl}/api/user`, accessToken);
      if (!userRes.data || !userRes.data.email) {
        logger.error('Failed to get user profile from YakNet: ' + JSON.stringify(userRes));
        return res.redirect('/login?externalAuthError=true');
      }

      const rawUser = userRes.data;
      let username = (rawUser.username || rawUser.email.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_.]/g, '_')
        .substring(0, 50);

      if (username.length < 3) {
        username = username + '_yak';
      }

      const displayName = rawUser.name || rawUser.username || username;
      const email = rawUser.email;
      const role =
        rawUser.is_admin === 1 ||
        rawUser.is_admin === true ||
        email === 'yakistir98@gmail.com' ||
        username === 'enesyakistir' ||
        username === 'yaknet' ||
        username === 'yaktube'
          ? 0
          : 2;

      // Pre-sync with PeerTube DB so existing accounts or username collisions never fail without bridge.js
      try {
        const existingByEmail = await dbQuery(
          `SELECT id, username FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [email]
        );
        if (existingByEmail.length > 0) {
          username = existingByEmail[0].username;
          await dbQuery(
            `UPDATE "user" SET "pluginAuth" = 'peertube-plugin-auth-yaknet', "emailVerified" = true WHERE id = $1`,
            [existingByEmail[0].id]
          );
        } else {
          const existingByUsername = await dbQuery(`SELECT id FROM "user" WHERE LOWER(username) = LOWER($1) LIMIT 1`, [
            username
          ]);
          if (existingByUsername.length > 0) {
            username = (username.substring(0, 42) + '_' + crypto.randomBytes(2).toString('hex')).toLowerCase();
          }
        }
      } catch (dbErr) {
        logger.warn('[YakNet SSO] Pre-sync DB warning: ' + dbErr.message);
      }

      logger.info(`YakNet Authenticated user: ${username} (${email})`);

      externalAuth.userAuthenticated({
        req,
        res,
        username,
        email,
        displayName,
        role
      });

      setTimeout(async () => {
        try {
          await dbQuery(
            `UPDATE "user" SET "emailVerified" = true, "pluginAuth" = 'peertube-plugin-auth-yaknet' WHERE LOWER(email) = LOWER($1)`,
            [email]
          );
        } catch (e) {}
      }, 1000);
    } catch (err) {
      logger.error('Error processing YakNet auth callback:', err);
      return res.redirect('/login?externalAuthError=true');
    }
  }

  router.get('/auth-callback', handleOAuthCallback);

  // Also support legacy /plugins/peertube-plugin-auth-yaknet/router/auth-callback on any PeerTube server without bridge.js
  try {
    if (peertubeHelpers && peertubeHelpers.server && typeof peertubeHelpers.server.getHTTPServer === 'function') {
      const httpServer = peertubeHelpers.server.getHTTPServer();
      const listeners = httpServer ? httpServer.listeners('request') : [];
      const expressApp = listeners && listeners[0];
      if (expressApp && typeof expressApp.get === 'function') {
        expressApp.get('/plugins/peertube-plugin-auth-yaknet/router/auth-callback', (req, res) => {
          return handleOAuthCallback(req, res);
        });
      }
    }
  } catch (e) {}

  logger.info('YakNet SSO Plugin initialized with Callback URL: ' + getActiveCallbackUrl());
}

async function unregister() {
  return true;
}

module.exports = {
  register,
  unregister
};
