const { Pool } = require('pg');

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

async function requireUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    const error = new Error('로그인이 필요합니다.');
    error.status = 401;
    throw error;
  }

  const baseUrl = process.env.LYT_SUPABASE_URL || 'https://gjdmunclzeiylqqiivyr.supabase.co';
  const anonKey = process.env.LYT_SUPABASE_KEY || 'sb_publishable_P0zpjVI04FqYaUgNkRqtXA_7fHuCivp';
  const response = await fetch(baseUrl + '/auth/v1/user', {
    headers: { apikey: anonKey, Authorization: 'Bearer ' + token }
  });
  if (!response.ok) {
    const error = new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
    error.status = 401;
    throw error;
  }
  const user = await response.json();
  if (!user || typeof user.id !== 'string' || !user.id) {
    const error = new Error('사용자 인증에 실패했습니다.');
    error.status = 401;
    throw error;
  }
  return user;
}

function sendError(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error('API request failed:', error);
  res.status(status).json({ error: status >= 500 ? '서버 처리 중 오류가 발생했습니다.' : error.message });
}

module.exports = { getPool, requireUser, sendError };
