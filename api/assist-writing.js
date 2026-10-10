const { getPool, requireUser, sendError } = require('./_db');

const DAILY_LIMIT = 10;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  }

  try {
    const user = await requireUser(req);
    const db = getPool();

    if (req.method === 'GET') {
      const usage = await db.query(
        "SELECT request_count AS used FROM public.lyt_ai_writing_usage WHERE user_id=$1 AND usage_date=(now() AT TIME ZONE 'Asia/Seoul')::date",
        [user.id]
      );
      const used = Number(usage.rows[0]?.used || 0);
      return res.status(200).json({ used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI 글쓰기 기능을 준비 중입니다. 관리자 설정에 AI API 키가 필요합니다.' });
    }

    const body = req.body || {};
    const keywords = String(body.keywords || '').trim().slice(0, 240);
    const context = String(body.context || '일상').trim().slice(0, 40);
    const tone = String(body.tone || '담백하게').trim().slice(0, 40);
    const journal = String(body.journal || '').trim().slice(0, 100);
    if (keywords.length < 2) return res.status(400).json({ error: '키워드를 두 글자 이상 입력해 주세요.' });

    // Atomic daily quota reservation, based on Korea Standard Time.
    const reservation = await db.query(
      "INSERT INTO public.lyt_ai_writing_usage (user_id, usage_date, request_count, updated_at) VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date, 1, now()) ON CONFLICT (user_id, usage_date) DO UPDATE SET request_count=public.lyt_ai_writing_usage.request_count + 1, updated_at=now() WHERE public.lyt_ai_writing_usage.request_count < $2 RETURNING request_count AS used",
      [user.id, DAILY_LIMIT]
    );

    if (!reservation.rows.length) {
      const usage = await db.query(
        "SELECT request_count AS used FROM public.lyt_ai_writing_usage WHERE user_id=$1 AND usage_date=(now() AT TIME ZONE 'Asia/Seoul')::date",
        [user.id]
      );
      const used = Number(usage.rows[0]?.used || DAILY_LIMIT);
      return res.status(429).json({
        error: '오늘 사용할 수 있는 10회를 모두 사용했어요. 내일 다시 이용해 주세요.',
        used,
        remaining: 0,
        limit: DAILY_LIMIT
      });
    }

    const used = Number(reservation.rows[0].used);
    const remaining = Math.max(0, DAILY_LIMIT - used);
    const prompt = [
      '당신은 한국어 개인 기록을 도와주는 글쓰기 도우미입니다.',
      '사용자가 입력한 키워드의 관계와 맥락을 파악해 자연스러운 기록 문장을 만들어 주세요.',
      '보통은 한 문장으로 작성하고, 서로 관련된 키워드가 여러 장면이나 생각을 담고 있어 두 문장이 더 자연스러울 때만 최대 두 문장으로 작성하세요.',
      '키워드에 없는 구체적인 사건, 사람 이름, 장소, 대화, 감정을 사실처럼 지어내지 마세요. 정보가 부족하면 과장하지 말고 일반적인 표현으로 연결하세요.',
      '제목, 설명, 목록, 따옴표 없이 기록 본문만 반환하세요.',
      '기록의 성격: ' + context,
      '문체: ' + tone,
      journal ? '기록장 이름: ' + journal : '',
      '사용자 키워드: ' + keywords
    ].filter(Boolean).join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_WRITING_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '사용자가 준 키워드에 근거해 한두 문장의 한국어 기록을 작성합니다. 제공되지 않은 개인적 사실은 만들지 않습니다.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 180
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('OpenAI writing request failed:', response.status, result.error && result.error.code);
      return res.status(502).json({ error: 'AI 문장을 만들지 못했어요. 잠시 후 다시 시도해 주세요.', used, remaining, limit: DAILY_LIMIT });
    }
    const text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text || typeof text !== 'string') {
      return res.status(502).json({ error: 'AI가 문장을 반환하지 않았어요. 다시 시도해 주세요.', used, remaining, limit: DAILY_LIMIT });
    }
    return res.status(200).json({ text: text.trim(), used, remaining, limit: DAILY_LIMIT });
  } catch (error) {
    return sendError(res, error);
  }
};
