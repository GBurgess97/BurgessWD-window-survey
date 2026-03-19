// functions/auth.js
// Handles login, session validation and user management

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const KV = context.env.BWD_USERS;
  const ADMIN_PASSWORD = context.env.ADMIN_PASSWORD || 'BWDAdmin97';

  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { action, name, password, token, newPassword, role } = await context.request.json();

    // ── Login ──────────────────────────────────────────────
    if (action === 'login') {
      // Admin login
      if (name.toLowerCase() === 'admin' && password === ADMIN_PASSWORD) {
        const sessionToken = generateToken();
        await KV.put('session:' + sessionToken, JSON.stringify({ name: 'admin', role: 'admin', loginAt: Date.now() }), { expirationTtl: 86400 });
        return json({ success: true, token: sessionToken, role: 'admin' }, corsHeaders);
      }
      // Surveyor or installer login
      const requestedRole = role || 'surveyor';
      const userKey = (requestedRole === 'installer' ? 'installer:' : 'user:') + name.toLowerCase().trim();
      const userData = await KV.get(userKey);
      if (!userData) return json({ success: false, error: 'User not found. Please check your name and try again.' }, corsHeaders);
      const user = JSON.parse(userData);
      if (user.password !== hashPassword(password)) return json({ success: false, error: 'Incorrect password' }, corsHeaders);
      const sessionToken = generateToken();
      await KV.put('session:' + sessionToken, JSON.stringify({ name: user.name, role: requestedRole, loginAt: Date.now() }), { expirationTtl: 86400 });
      return json({ success: true, token: sessionToken, role: requestedRole, name: user.name }, corsHeaders);
    }

    // ── Validate session ───────────────────────────────────
    if (action === 'validate') {
      if (!token) return json({ valid: false }, corsHeaders);
      const sessionData = await KV.get('session:' + token);
      if (!sessionData) return json({ valid: false }, corsHeaders);
      const session = JSON.parse(sessionData);
      return json({ valid: true, name: session.name, role: session.role }, corsHeaders);
    }

    // ── Logout ─────────────────────────────────────────────
    if (action === 'logout') {
      if (token) await KV.delete('session:' + token);
      return json({ success: true }, corsHeaders);
    }

    // ── Admin: list users ──────────────────────────────────
    if (action === 'list_users') {
      if (!await isAdmin(token, KV)) return json({ error: 'Unauthorized' }, corsHeaders);
      const pfx = (role === 'installer') ? 'installer:' : 'user:';
      const list = await KV.list({ prefix: pfx });
      const users = await Promise.all(list.keys.map(async k => {
        const data = await KV.get(k.name);
        const user = JSON.parse(data);
        return { name: user.name, key: k.name };
      }));
      return json({ users }, corsHeaders);
    }

    // ── Admin: add/update user ─────────────────────────────
    if (action === 'add_user') {
      if (!await isAdmin(token, KV)) return json({ error: 'Unauthorized' }, corsHeaders);
      if (!name || !password) return json({ error: 'Name and password required' }, corsHeaders);
      const userKey = ((role === 'installer') ? 'installer:' : 'user:') + name.toLowerCase().trim();
      await KV.put(userKey, JSON.stringify({ name: name.trim(), password: hashPassword(password) }));
      return json({ success: true }, corsHeaders);
    }

    // ── Admin: delete user ─────────────────────────────────
    if (action === 'delete_user') {
      if (!await isAdmin(token, KV)) return json({ error: 'Unauthorized' }, corsHeaders);
      const delPrefix = (role === 'installer') ? 'installer:' : 'user:';
      const userKey = delPrefix + name.toLowerCase().trim();
      await KV.delete(userKey);
      return json({ success: true }, corsHeaders);
    }

    // ── Admin: change password ─────────────────────────────
    if (action === 'change_password') {
      if (!await isAdmin(token, KV)) return json({ error: 'Unauthorized' }, corsHeaders);
      const chgPrefix = (role === 'installer') ? 'installer:' : 'user:';
      const userKey = chgPrefix + name.toLowerCase().trim();
      const userData = await KV.get(userKey);
      if (!userData) return json({ error: 'User not found' }, corsHeaders);
      const user = JSON.parse(userData);
      user.password = hashPassword(newPassword);
      await KV.put(userKey, JSON.stringify(user));
      return json({ success: true }, corsHeaders);
    }

    return json({ error: 'Unknown action' }, corsHeaders);

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────
function json(data, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 48; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

function hashPassword(password) {
  // Simple hash — in production use bcrypt but KV Workers don't support it
  let hash = 0;
  const str = password + 'BWD_SALT_2024';
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function isAdmin(token, KV) {
  if (!token) return false;
  const sessionData = await KV.get('session:' + token);
  if (!sessionData) return false;
  const session = JSON.parse(sessionData);
  return session.role === 'admin';
}
