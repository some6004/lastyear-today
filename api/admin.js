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
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
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
    if (req.method === 'POST' && req.body && req.body.action === 'update_member') {
      if (!isAdmin(req)) return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
      const body = req.body;
      const userId = String(body.user_id || '').trim();
      const name = String(body.name || '').trim();
      const nickname = String(body.nickname || '').trim();
      const birthDate = String(body.birth_date || '').trim();
      const phone = String(body.phone || '').replace(/[\\s-]/g, '');
      if (!userId || !name || name.length > 80) return res.status(400).json({ error: '회원 이름을 확인해 주세요.' });
      if (!nickname || nickname.length > 40) return res.status(400).json({ error: '대화명을 1~40자로 입력해 주세요.' });
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) return res.status(400).json({ error: '생년월일을 YYYY-MM-DD 형식으로 입력해 주세요.' });
      if (!/^\\+?\\d{9,15}$/.test(phone)) return res.status(400).json({ error: '전화번호를 확인해 주세요.' });
      const db = getPool();
      const authUser = await db.query('SELECT id::text AS id, email FROM neon_auth."user" WHERE id::text=$1 LIMIT 1', [userId]);
      if (!authUser.rows.length) return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
      await db.query('UPDATE neon_auth."user" SET name=$2, "updatedAt"=now() WHERE id::text=$1', [userId, name]);
      const username = String(authUser.rows[0].email || '').split('@')[0].toLowerCase();
      await db.query(`INSERT INTO public.lyt_profiles (user_id, username, display_name, nickname, birth_date, phone, updated_at)
        VALUES ($1,$2,$3,$4,$5::date,$6,now())
        ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, nickname=EXCLUDED.nickname, birth_date=EXCLUDED.birth_date, phone=EXCLUDED.phone, updated_at=now()`,
        [userId, username, name, nickname, birthDate, phone]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'POST' && req.body && req.body.action === 'reply_inquiry') {
      if (!isAdmin(req)) return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
      const id = Number(req.body.inquiry_id || 0);
      const message = String(req.body.message || '').trim().slice(0, 10000);
      if (!id || message.length < 2) return res.status(400).json({ error: '문의와 답변 내용을 확인해 주세요.' });
      const db = getPool();
      const inquiry = await db.query('SELECT id FROM public.lyt_inquiries WHERE id=$1', [id]);
      if (!inquiry.rows.length) return res.status(404).json({ error: '문의를 찾을 수 없습니다.' });
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query("INSERT INTO public.lyt_inquiry_messages(inquiry_id,sender_type,sender_name,message) VALUES($1,'admin','작년, 오늘 관리자',$2)", [id, message]);
        await client.query("UPDATE public.lyt_inquiries SET status='answered',updated_at=now() WHERE id=$1", [id]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'POST' && req.body && req.body.action === 'restore_withdrawal') {
      if (!isAdmin(req)) return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
      const userId = String(req.body.user_id || '').trim();
      if (!userId) return res.status(400).json({ error: '회원 계정을 확인해 주세요.' });
      const db = getPool();
      const result = await db.query("UPDATE public.lyt_profiles SET withdrawal_status='active',withdrawal_requested_at=NULL,withdrawal_scheduled_at=NULL,updated_at=now() WHERE user_id=$1 AND withdrawal_status='pending' RETURNING user_id", [userId]);
      if (!result.rows.length) return res.status(404).json({ error: '탈퇴 접수 중인 회원을 찾을 수 없습니다.' });
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
    const [stats, members, contentStats, entries, inquiries] = await Promise.all([
      db.query(`SELECT
        (SELECT COUNT(*)::int FROM neon_auth."user") AS members,
        (SELECT COUNT(*)::int FROM public.lyt_journals WHERE deleted_at IS NULL) AS journals,
        (SELECT COUNT(*)::int FROM public.lyt_entries WHERE deleted_at IS NULL) AS entries,
        (SELECT COUNT(*)::bigint FROM public.lyt_entries WHERE deleted_at IS NULL) AS active_entries,
        (SELECT COALESCE(SUM(octet_length(content)),0)::bigint FROM public.lyt_entries WHERE deleted_at IS NULL) AS content_bytes,
        (SELECT COALESCE(SUM(byte_size),0)::bigint FROM public.lyt_entry_media) AS media_bytes,
        (SELECT COUNT(*)::int FROM public.lyt_entry_media) AS media_files`),
      db.query(`SELECT u.id::text AS user_id,
        COALESCE(p.username, NULLIF(split_part(u.email, '@', 1), '')) AS username,
        COALESCE(p.display_name, u.name) AS display_name,
        COALESCE(p.nickname, p.display_name, u.name) AS nickname,
        p.birth_date, p.phone, p.withdrawal_status, p.withdrawal_requested_at, p.withdrawal_scheduled_at, COALESCE(p.created_at, u."createdAt") AS created_at,
        (SELECT COUNT(*)::int FROM public.lyt_journals j WHERE j.owner_id=u.id::text AND j.deleted_at IS NULL) AS journal_count,
        (SELECT COUNT(*)::int FROM public.lyt_entries e WHERE e.owner_id=u.id::text AND e.deleted_at IS NULL) AS entry_count
        FROM neon_auth."user" u
        LEFT JOIN public.lyt_profiles p ON p.user_id=u.id::text
        ORDER BY u."createdAt" DESC NULLS LAST LIMIT 500`),
      db.query(`SELECT date_trunc('month', created_at) AS month,
        COUNT(*)::int AS entries, COALESCE(SUM(octet_length(content)),0)::bigint AS content_bytes
        FROM public.lyt_entries WHERE deleted_at IS NULL
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12`),
      db.query(`SELECT e.id, e.owner_id, p.username, COALESCE(p.nickname,p.display_name,p.username,'회원') AS author,
        e.entry_date, e.title, e.content, e.visibility, e.metadata, e.created_at
        FROM public.lyt_entries e LEFT JOIN public.lyt_profiles p ON p.user_id=e.owner_id
        WHERE e.deleted_at IS NULL ORDER BY e.entry_date DESC, e.updated_at DESC LIMIT 100`),
      db.query(`SELECT i.id,i.name,i.email,i.subject,i.status,i.created_at,i.updated_at,
        (SELECT m.message FROM public.lyt_inquiry_messages m WHERE m.inquiry_id=i.id AND m.sender_type='customer' ORDER BY m.created_at ASC LIMIT 1) AS initial_message,
        (SELECT COUNT(*)::int FROM public.lyt_inquiry_messages m WHERE m.inquiry_id=i.id) AS message_count
        FROM public.lyt_inquiries i ORDER BY CASE WHEN i.status='open' THEN 0 ELSE 1 END, i.updated_at DESC LIMIT 300`)
    ]);
    return res.status(200).json({
      stats: stats.rows[0],
      members: members.rows,
      contentStats: contentStats.rows,
      entries: entries.rows,
      inquiries: inquiries.rows
    });
  } catch (error) {
    console.error('admin dashboard error', error);
    return res.status(500).json({ error: '관리자 자료를 불러오지 못했습니다.' });
  }
};
