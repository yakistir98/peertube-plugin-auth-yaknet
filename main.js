const crypto = require('crypto');
const https = require('https');
const http = require('http');

let clientId = '';
let clientSecret = '';
let authBaseUrl = 'https://developer-console.yakhub.com.tr';

function postRequest(urlStr, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
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

function getRequest(urlStr, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
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
    const autoRedir = await settingsManager.getSetting('auto-redirect-login');
    if (cid) clientId = cid;
    if (csec) clientSecret = csec;
    if (burl) authBaseUrl = burl.replace(/\/+$/, '');
    if (autoRedir !== undefined && autoRedir !== null) {
      autoRedirectLogin = autoRedir === true || autoRedir === 'true';
    } else {
      autoRedirectLogin = true;
    }
    syncConfigFiles(autoRedirectLogin);
  }
  await loadSettings();
  settingsManager.onSettingsChange(loadSettings);

  const webserverUrl = peertubeHelpers.config.getWebserverUrl();
  const callbackUrl = `${webserverUrl}/plugins/peertube-plugin-auth-yaknet/router/auth-callback`;

  const externalAuth = registerExternalAuth({
    authName: 'yaknet',
    authDisplayName: () => 'YakNet ile Giriş Yap',
    onAuthRequest: (req, res) => {
      const state = crypto.randomBytes(16).toString('hex');
      const authUrl = `${authBaseUrl}/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=&state=${state}`;
      return res.redirect(authUrl);
    }
  });

  const router = getRouter();

  router.get('/status', (req, res) => {
    return res.json({
      autoRedirectLogin: autoRedirectLogin !== false
    });
  });

  router.get('/auth', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = `${authBaseUrl}/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=&state=${state}`;
    return res.redirect(authUrl);
  });

  router.get('/auth-callback', async (req, res) => {
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
      const tokenRes = await postRequest(`${authBaseUrl}/oauth/token`, {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        code: code
      });

      if (!tokenRes.data || !tokenRes.data.access_token) {
        logger.error('Failed to get access token from YakNet:', tokenRes);
        return res.redirect('/login?externalAuthError=true');
      }

      const accessToken = tokenRes.data.access_token;
      const userRes = await getRequest(`${authBaseUrl}/api/user`, accessToken);
      if (!userRes.data || !userRes.data.email) {
        logger.error('Failed to get user profile from YakNet:', userRes);
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

      logger.info(`YakNet Authenticated user: ${username} (${email})`);

      externalAuth.userAuthenticated({
        req,
        res,
        username,
        email,
        displayName,
        role
      });

      if (peertubeHelpers && peertubeHelpers.database && peertubeHelpers.database.query) {
        setTimeout(async () => {
          try {
            await peertubeHelpers.database.query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', {
              bind: [email]
            });
          } catch (e) {
            logger.warn('Failed to auto-verify email in DB for ' + email, e);
          }
        }, 1000);
      }
    } catch (err) {
      logger.error('Error processing YakNet auth callback:', err);
      return res.redirect('/login?externalAuthError=true');
    }
  });

  logger.info('YakNet SSO Plugin initialized with Callback URL: ' + callbackUrl);
}

async function unregister() {
  return true;
}

module.exports = {
  register,
  unregister
};
