const { getPool, requireUser, sendError } = require('./_db');

module.exports = async function handler(req, res) {
  try {
    const user = await requireUser(req);
    const db = getPool();
    if (req.method === 'GET') {
      const result = await db.query(
        'SELECT user_id, username, display_name, nickname, birth_date, phone, email, avatar_url, privacy_policy_version, privacy_consent_at, marketing_email_consent, marketing_email_consent_at FROM public.lyt_profiles WHERE user_id = $1 LIMIT 1',
        [user.id]
      );
      return res.status(200).json({ profile: result.rows[0] || null });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = req.body || {};
      const username = String(body.username || '').trim().toLowerCase();
      const displayName = String(body.name || '').trim();
      const nickname = String(body.nickname || '').trim();
      const birthDate = String(body.birth_date || '').trim();
      const phone = String(body.phone || '').replace(/[\s-]/g, '');
      const email = String(body.email || user.email || '').trim().toLowerCase();
      const privacyConsent = body.privacy_consent === true;
      const policyVersion = String(body.privacy_policy_version || '').trim();
      const marketingConsent = body.marketing_email_consent === true;
      if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: '아이디는 영문 소문자, 숫자, 밑줄로 3~24자 입력해 주세요.' });
      if (!displayName || displayName.length > 80) return res.status(400).json({ error: '이름을 입력해 주세요.' });
      if (!nickname || nickname.length > 40) return res.status(400).json({ error: '표시할 대화명을 1~40자로 입력해 주세요.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) return res.status(400).json({ error: '생년월일을 확인해 주세요.' });
      if (!/^\+?\d{9,15}$/.test(phone)) return res.status(400).json({ error: '전화번호를 확인해 주세요.' });
      if (body.privacy_consent !== undefined && (!privacyConsent || !policyVersion)) return res.status(400).json({ error: '필수 개인정보 동의가 필요합니다.' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '이메일 주소를 확인해 주세요.' });
      const result = await db.query(
        `INSERT INTO public.lyt_profiles (user_id, username, display_name, nickname, birth_date, phone, email, privacy_policy_version, privacy_consent_at, marketing_email_consent, marketing_email_consent_at, updated_at)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,CASE WHEN $9 THEN now() ELSE NULL END,$10,CASE WHEN $10 THEN now() ELSE NULL END,now())
         ON CONFLICT (user_id) DO UPDATE SET username=EXCLUDED.username, display_name=EXCLUDED.display_name, nickname=EXCLUDED.nickname, birth_date=EXCLUDED.birth_date, phone=EXCLUDED.phone, email=COALESCE(EXCLUDED.email, public.lyt_profiles.email), privacy_policy_version=COALESCE(EXCLUDED.privacy_policy_version, public.lyt_profiles.privacy_policy_version), privacy_consent_at=COALESCE(EXCLUDED.privacy_consent_at, public.lyt_profiles.privacy_consent_at), marketing_email_consent=EXCLUDED.marketing_email_consent, marketing_email_consent_at=CASE WHEN EXCLUDED.marketing_email_consent THEN now() ELSE NULL END, updated_at=now()
         RETURNING user_id, username, display_name, nickname, birth_date, phone, email, avatar_url, privacy_policy_version, privacy_consent_at, marketing_email_consent, marketing_email_consent_at`,
        [user.id, username, displayName, nickname, birthDate, phone, email || null, policyVersion || null, privacyConsent, marketingConsent]
      );
      return res.status(200).json({ profile: result.rows[0] });
    }
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    if (error && error.code === '23505') return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
    return sendError(res, error);
  }
};
