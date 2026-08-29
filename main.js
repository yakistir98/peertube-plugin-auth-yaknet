const crypto = require('crypto');
const https = require('https');
const http = require('http');

let clientId = '01a03c41-f758-721e-b927-619bffde5c23';
let clientSecret = 'hNx0p20XT8QI0Ut9irh0o5cvqW6rNQOuS2tgoqir';
let authBaseUrl = 'https://auth.yakhub.com.tr';

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
    private: false,
    default: '01a03c41-f758-721e-b927-619bffde5c23'
  });

  registerSetting({
    name: 'client-secret',
    label: 'YakNet Client Secret',
    type: 'input-password',
    private: true,
    default: 'hNx0p20XT8QI0Ut9irh0o5cvqW6rNQOuS2tgoqir'
  });

  registerSetting({
    name: 'auth-base-url',
    label: 'YakNet Auth URL',
    type: 'input',
    private: false,
    default: 'https://auth.yakhub.com.tr'
  });

  async function loadSettings() {
    const cid = await settingsManager.getSetting('client-id');
    const csec = await settingsManager.getSetting('client-secret');
    const burl = await settingsManager.getSetting('auth-base-url');
    if (cid) clientId = cid;
    if (csec) clientSecret = csec;
    if (burl) authBaseUrl = burl.replace(/\/+$/, '');
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
      const role = rawUser.is_admin === 1 || rawUser.is_admin === true ? 0 : 2;

      logger.info(`YakNet Authenticated user: ${username} (${email})`);

      externalAuth.userAuthenticated({
        req,
        res,
        username,
        email,
        displayName,
        role
      });
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
