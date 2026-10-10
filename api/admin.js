const crypto = require('crypto');
const { getPool } = require('./_db');

const COOKIE = 'lyt_admin';
const MAX_AGE = 8 * 60 * 60 * 1000;
function sign(value) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || '').update(value).digest('hex');
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cookieValue(req) {
  const raw = req.headers.cookie || '';
  const item = raw.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : '';
}
function isAdmin(req) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) return false;
  const token = cookieValue(req);
  const [expires, mac] = token.split('.');
  if (!expires || !mac || !/^\\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(mac, sign(expires));
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST' && req.body && req.body.action === 'login') {
      if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
        return res.status(503).json({ error: '관리자 계정 설정이 필요합니다. Vercel 환경변수 ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SESSION_SECRET을 확인해 주세요.' });
      }
      if (!safeEqual(req.body.username, process.env.ADMIN_USERNAME) || !safeEqual(req.body.password, process.env.ADMIN_PASSWORD)) {
        return res.status(401).json({ error: '관리자 아이디 또는 비밀번호가 올바르지 않습니다.' });
      }
      const expires = String(Date.now() + MAX_AGE);
      const token = expires + '.' + sign(expires);
      res.setHeader('Set-Cookie', COOKIE + '=' + encodeURIComponent(token) + '; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=' + Math.floor(MAX_AGE / 1000));
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0');
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
    }
    if (!isAdmin(req)) return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
    const db = getPool();
    const [stats, members, contentStats, entries] = await Promise.all([
      db.query(`SELECT
        (SELECT COUNT(*)::int FROM public.lyt_profiles) AS members,
        (SELECT COUNT(*)::int FROM public.lyt_journals WHERE deleted_at IS NULL) AS journals,
        (SELECT COUNT(*)::int FROM public.lyt_entries WHERE deleted_at IS NULL) AS entries,
        (SELECT COUNT(*)::bigint FROM public.lyt_entries WHERE deleted_at IS NULL) AS active_entries,
        (SELECT COALESCE(SUM(octet_length(content)),0)::bigint FROM public.lyt_entries WHERE deleted_at IS NULL) AS content_bytes,
        (SELECT COALESCE(SUM(byte_size),0)::bigint FROM public.lyt_entry_media) AS media_bytes,
        (SELECT COUNT(*)::int FROM public.lyt_entry_media) AS media_files`),
      db.query(`SELECT p.user_id, p.username, p.display_name, p.nickname, p.birth_date, p.phone, p.created_at,
        (SELECT COUNT(*)::int FROM public.lyt_journals j WHERE j.owner_id=p.user_id AND j.deleted_at IS NULL) AS journal_count,
        (SELECT COUNT(*)::int FROM public.lyt_entries e WHERE e.owner_id=p.user_id AND e.deleted_at IS NULL) AS entry_count
        FROM public.lyt_profiles p ORDER BY p.created_at DESC NULLS LAST LIMIT 500`),
      db.query(`SELECT date_trunc('month', created_at) AS month,
        COUNT(*)::int AS entries, COALESCE(SUM(octet_length(content)),0)::bigint AS content_bytes
        FROM public.lyt_entries WHERE deleted_at IS NULL
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12`),
      db.query(`SELECT e.id, e.owner_id, p.username, COALESCE(p.nickname,p.display_name,p.username,'회원') AS author,
        e.entry_date, e.title, e.content, e.visibility, e.metadata, e.created_at
        FROM public.lyt_entries e LEFT JOIN public.lyt_profiles p ON p.user_id=e.owner_id
        WHERE e.deleted_at IS NULL ORDER BY e.entry_date DESC, e.updated_at DESC LIMIT 100`)
    ]);
    return res.status(200).json({
      stats: stats.rows[0],
      members: members.rows,
      contentStats: contentStats.rows,
      entries: entries.rows
    });
  } catch (error) {
    console.error('admin dashboard error', error);
    return res.status(500).json({ error: '관리자 자료를 불러오지 못했습니다.' });
  }
};
