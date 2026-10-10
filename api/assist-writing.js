const { requireUser, sendError } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  }
  try {
    await requireUser(req);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI 글쓰기 기능을 준비 중입니다. 관리자 설정에 AI API 키가 필요합니다.' });
    }
    const body = req.body || {};
    const keywords = String(body.keywords || '').trim().slice(0, 240);
    const length = ['short', 'medium', 'long'].includes(body.length) ? body.length : 'medium';
    const journal = String(body.journal || '').trim().slice(0, 100);
    if (keywords.length < 2) return res.status(400).json({ error: '키워드를 두 글자 이상 입력해 주세요.' });

    const sentenceGuide = { short: '한국어 2~3문장', medium: '한국어 4~6문장', long: '한국어 7~9문장' }[length];
    const prompt = [
      '당신은 한국어 개인 기록을 도와주는 따뜻하고 담백한 글쓰기 도우미입니다.',
      '사용자가 준 키워드에서 벗어나지 말고, 일기 초안을 자연스러운 한국어로 작성하세요.',
      '키워드에 없는 구체적인 사건, 사람 이름, 장소, 대화, 감정을 사실처럼 지어내지 마세요.',
      '정보가 부족한 부분은 과장하지 말고 일반적인 표현으로 연결하세요.',
      '제목, 설명, 따옴표, 목록 없이 본문 문장만 반환하세요.',
      '문체는 자연스럽고 진솔하게, 지나치게 문학적이거나 감상적으로 쓰지 마세요.',
      '길이: ' + sentenceGuide + '.',
      journal ? '기록장 주제: ' + journal : '',
      '사용자 키워드: ' + keywords
    ].filter(Boolean).join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_WRITING_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '한국어 기록 초안 작성 도우미입니다. 사용자가 제공하지 않은 개인적 사실을 만들어내지 않습니다.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: length === 'long' ? 700 : length === 'medium' ? 450 : 240
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('OpenAI writing request failed:', response.status, result.error && result.error.code);
      return res.status(502).json({ error: 'AI 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' });
    }
    const text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text || typeof text !== 'string') return res.status(502).json({ error: 'AI가 문장을 반환하지 않았어요. 다시 시도해 주세요.' });
    return res.status(200).json({ text: text.trim() });
  } catch (error) {
    return sendError(res, error);
  }
};
