// Supabase-JWT-Prüfung für das Express-Backend (User-Layer, Phase 1: verify-only).
//
// Login-Flows (alle via supabase-js im Frontend, alle liefern dasselbe JWT):
//   - E-Mail + Passwort: supabase.auth.signInWithPassword() -> access_token
//   - OAuth (Google/Apple): supabase.auth.signInWithOAuth({ provider }) ->
//     Provider-Redirect -> Rücksprung auf /login -> access_token
//   Frontend: fetch('/api/...', { headers: { Authorization: `Bearer ${token}` } })
//   Backend hier: Bearer-Token extrahieren, per Supabase-Auth `auth.getUser(token)`
//   verifizieren (Netzwerk-Verifizierung; funktioniert für ES256-asymmetrisch —
//   dieses Projekt, siehe JWKS-Endpoint — wie für HS256-symmetrisch) und den
//   verifizierten Nutzer als `req.user = { id, email, ... }` anhängen.
//
// Die OAuth-2.1-Endpoints (oauth/authorize, oauth/token, OIDC-Discovery) braucht
// diese First-Party-App NICHT direkt: Sie sind nur für externe Drittanwendungen
// relevant, die dieses Supabase-Projekt als Identity-Provider nutzen. Die App
// loggt sich über supabase-js ein (nutzt intern /auth/v1/token mit
// grant_type=password bzw. den PKCE-Code-Flow).
//
// Modi:
//   - Auth NICHT konfiguriert (SUPABASE_URL oder SUPABASE_ANON_KEY fehlt):
//     `authGate` lässt alles anonym durch (req.user = null). Rückwärtskompatibel,
//     bestehende Tests und das MCP bleiben grün.
//   - AUTH_REQUIRED=true: `authGate` verlangt einen gültigen Bearer-Token
//     (401 ohne/bei ungültigem Token, 503 bei Fehlkonfiguration).
//   - GET /api/me meldet immer den aktuellen Nutzer (200) oder 401.

function supabaseUrl() {
  return (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

function supabaseAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ''
  ).trim();
}

function isAuthConfigured() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

function isAuthRequired() {
  return ['true', '1', 'required'].includes(
    String(process.env.AUTH_REQUIRED || '').trim().toLowerCase()
  );
}

// Extrahiert den Bearer-Token aus dem Authorization-Header. Gibt null zurück,
// wenn keiner vorhanden ist (kein Throw — die Middleware entscheidet).
function extractBearerToken(req) {
  const header =
    (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const match = String(header).match(/^\s*Bearer\s+(.+?)\s*$/i);
  return match ? match[1] : null;
}

// Supabase-Client für die Token-Verifizierung (lazy, damit der Server auch ohne
// installiertes @supabase/supabase-js startet — z. B. in Tests ohne Auth).
// Der Client wird pro URL+Key-Kombi gecacht; Env-Wechsel (Tests) erzeugen neu.
let cachedVerifier = null;
function getVerifier() {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (cachedVerifier && cachedVerifier.url === url && cachedVerifier.key === key) {
    return cachedVerifier.client;
  }
  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch {
    const err = new Error(
      'Supabase-Auth ist konfiguriert, aber @supabase/supabase-js ist nicht installiert (npm install im Projekt-Root ausführen).'
    );
    err.code = 'SUPABASE_LIB_MISSING';
    throw err;
  }
  const client = createClient(url, key);
  cachedVerifier = { url, key, client };
  return client;
}

// Verifiziert einen Access-Token gegen den Supabase-Auth-Server.
// Löst mit { id, email, appMetadata, userMetadata, aud, iss } auf,
// wirft mit code INVALID_TOKEN bei ungültigem/abgelaufenem Token.
async function verifyAccessToken(token) {
  if (!isAuthConfigured()) {
    const err = new Error('Supabase-Auth ist nicht konfiguriert (SUPABASE_URL / SUPABASE_ANON_KEY fehlen).');
    err.code = 'AUTH_NOT_CONFIGURED';
    throw err;
  }
  const { data, error } = await getVerifier().auth.getUser(token);
  if (error || !data || !data.user) {
    const err = new Error('Ungültiger oder abgelaufener Token.');
    err.code = 'INVALID_TOKEN';
    err.cause = error;
    throw err;
  }
  const { user } = data;
  return {
    id: user.id,
    email: user.email || null,
    appMetadata: user.app_metadata || {},
    userMetadata: user.user_metadata || {},
    aud: user.aud || null,
  };
}

// Optional: hängt req.user an, wenn ein gültiger Token mitkommt, lässt die
// Anfrage sonst anonym durch (Verify-only-Default).
async function optionalAuth(req, _res, next) {
  req.user = null;
  const token = extractBearerToken(req);
  if (!token || !isAuthConfigured()) {
    return next();
  }
  try {
    req.user = await verifyAccessToken(token);
  } catch {
    req.user = null;
  }
  return next();
}

// Strikt: verlangt einen gültigen Token. 503 bei Fehlkonfiguration, sonst 401.
async function requireAuth(req, res, next) {
  if (!isAuthConfigured()) {
    return res.status(503).json({
      error:
        'Authentifizierung ist erforderlich (AUTH_REQUIRED), aber Supabase ist nicht konfiguriert (SUPABASE_URL / SUPABASE_ANON_KEY fehlen).',
    });
  }
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Anmeldung erforderlich (Bearer-Token fehlt).' });
  }
  try {
    req.user = await verifyAccessToken(token);
    return next();
  } catch (err) {
    if (err && err.code === 'SUPABASE_LIB_MISSING') {
      return res.status(503).json({ error: err.message });
    }
    return res.status(401).json({ error: 'Ungültiger oder abgelaufener Token.' });
  }
}

// Tor für die Journey-/Daten-Routen: strikt nur mit AUTH_REQUIRED=true,
// sonst verify-only (öffentlich wie bisher, Nutzer wird angehängt wenn da).
function authGate(req, res, next) {
  if (isAuthRequired()) {
    return requireAuth(req, res, next);
  }
  return optionalAuth(req, res, next);
}

function authStatus() {
  const url = supabaseUrl();
  return {
    enabled: isAuthConfigured(),
    required: isAuthRequired(),
    issuer: url ? `${url}/auth/v1` : null,
  };
}

module.exports = {
  isAuthConfigured,
  isAuthRequired,
  extractBearerToken,
  verifyAccessToken,
  optionalAuth,
  requireAuth,
  authGate,
  authStatus,
};
