const { Pool } = require('pg');
const { createRemoteJWKSet, jwtVerify } = require('jose');

let pool;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

let jwks;
async function requireUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    const error = new Error('로그인이 필요합니다.');
    error.status = 401;
    throw error;
  }
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  if (!jwksUrl) throw new Error('Neon Auth is not configured');
  try {
    if (!jwks) jwks = createRemoteJWKSet(new URL(jwksUrl));
    const { payload } = await jwtVerify(token, jwks);
    const id = typeof payload.sub === 'string' ? payload.sub : '';
    if (!id) throw new Error('Missing subject');
    return { id, email: typeof payload.email === 'string' ? payload.email : undefined };
  } catch (cause) {
    const error = new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
    error.status = 401;
    throw error;
  }
}

function sendError(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error('API request failed:', error);
  res.status(status).json({ error: status >= 500 ? '서버 처리 중 오류가 발생했습니다.' : error.message });
}

module.exports = { getPool, requireUser, sendError };
