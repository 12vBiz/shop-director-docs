/**
 * Cloudflare Worker: Docs Auth
 *
 * Validates Rails tokens and manages session cookies for docs access.
 *
 * Environment variables needed:
 * - DOCS_SIGNING_SECRET: Shared secret with Rails app
 * - RAILS_APP_URL: Base URL of Rails app (e.g., https://app.shopdirector.app)
 */

const COOKIE_NAME = 'docs_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check for token in URL FIRST (from Rails redirect) - before public path check
    const token = url.searchParams.get('token');

    if (token) {
      const validation = await validateRailsToken(token, env.DOCS_SIGNING_SECRET);

      if (validation.valid) {
        // Valid token - set session cookie and redirect to clean URL
        url.searchParams.delete('token');
        const newSession = await createSession(validation.payload, env.DOCS_SIGNING_SECRET);

        // Build redirect response manually (Response.redirect doesn't allow adding cookies)
        const domainParts = url.hostname.split('.');
        const rootDomain = domainParts.slice(-2).join('.');

        const headers = new Headers();
        headers.set('Location', url.toString());
        headers.set('Set-Cookie',
          `${COOKIE_NAME}=${newSession}; ` +
          `Max-Age=${COOKIE_MAX_AGE}; ` +
          `Path=/; ` +
          `Domain=.${rootDomain}; ` +
          `HttpOnly; ` +
          `Secure; ` +
          `SameSite=Lax`
        );

        return new Response(null, { status: 302, headers });
      }
    }

    // Allow public paths without auth (after token check)
    if (isPublicPath(path)) {
      return fetch(request);
    }

    // Check for existing session cookie
    const cookies = parseCookies(request.headers.get('Cookie') || '');
    const sessionToken = cookies[COOKIE_NAME];

    if (sessionToken && await isValidSession(sessionToken, env.DOCS_SIGNING_SECRET)) {
      // Valid session - allow access and refresh cookie
      const response = await fetch(request);
      return addSessionCookie(response, sessionToken, url.hostname);
    }

    // No valid auth - redirect to Rails login
    const railsUrl = env.RAILS_APP_URL || 'https://app.shopdirector.app';
    const returnPath = path === '/' ? '' : path;
    const loginUrl = `${railsUrl}/login?return_to=${encodeURIComponent('/help' + returnPath)}`;

    return Response.redirect(loginUrl, 302);
  }
};

function isPublicPath(path) {
  // Landing page and assets are public
  if (path === '/' || path === '/index.html') return true;

  // Static assets (CSS, JS, images)
  if (path.startsWith('/assets/') ||
      path.startsWith('/stylesheets/') ||
      path.startsWith('/javascripts/') ||
      path.startsWith('/images/') ||
      path.endsWith('.css') ||
      path.endsWith('.js') ||
      path.endsWith('.png') ||
      path.endsWith('.jpg') ||
      path.endsWith('.svg') ||
      path.endsWith('.ico') ||
      path.endsWith('.woff') ||
      path.endsWith('.woff2')) {
    return true;
  }

  return false;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name] = rest.join('=');
  });

  return cookies;
}

async function validateRailsToken(token, secret) {
  try {
    // Rails MessageVerifier format: base64(data)--base64(signature)
    const parts = token.split('--');
    if (parts.length !== 2) {
      return { valid: false };
    }

    const [encodedData, encodedSignature] = parts;

    // Verify HMAC signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(encodedData)
    );

    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // URL-safe base64 comparison
    const providedSignature = encodedSignature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    if (expectedSignature !== providedSignature) {
      return { valid: false };
    }

    // Decode and parse payload
    const data = JSON.parse(atob(encodedData.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiry (Rails includes _expires_at in token)
    if (data._expires_at && new Date(data._expires_at) < new Date()) {
      return { valid: false };
    }

    return { valid: true, payload: data };
  } catch {
    return { valid: false };
  }
}

async function createSession(payload, secret) {
  const sessionData = {
    user_id: payload.user_id || payload[0],
    account_id: payload.account_id || payload[1],
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + COOKIE_MAX_AGE * 1000).toISOString()
  };

  const encodedData = btoa(JSON.stringify(sessionData))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedData)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${encodedData}--${encodedSignature}`;
}

async function isValidSession(sessionToken, secret) {
  try {
    const parts = sessionToken.split('--');
    if (parts.length !== 2) return false;

    const [encodedData, encodedSignature] = parts;

    // Verify signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(encodedData)
    );

    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const providedSignature = encodedSignature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    if (expectedSignature !== providedSignature) return false;

    // Check expiry
    const data = JSON.parse(atob(encodedData.replace(/-/g, '+').replace(/_/g, '/')));
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function addSessionCookie(response, sessionToken, hostname) {
  const newResponse = new Response(response.body, response);

  // Extract root domain for cookie (e.g., shopdirector.app from support.shopdirector.app)
  const domainParts = hostname.split('.');
  const rootDomain = domainParts.slice(-2).join('.');

  newResponse.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${sessionToken}; ` +
    `Max-Age=${COOKIE_MAX_AGE}; ` +
    `Path=/; ` +
    `Domain=.${rootDomain}; ` +
    `HttpOnly; ` +
    `Secure; ` +
    `SameSite=Lax`
  );

  return newResponse;
}
