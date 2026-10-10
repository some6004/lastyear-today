module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI 글쓰기 준비 중입니다. 관리자에게 API 키 설정을 요청해 주세요.' });

  try {
    const body = req.body || {};
    const keywords = typeof body.keywords === 'string' ? body.keywords.trim().slice(0, 500) : '';
    const context = typeof body.context === 'string' ? body.context.slice(0, 40) : '일상';
    const tone = typeof body.tone === 'string' ? body.tone.slice(0, 40) : '담백하게';
    const date = typeof body.date === 'string' ? body.date.slice(0, 10) : '';
    if (keywords.length < 2) return res.status(400).json({ error: '키워드를 두 글자 이상 입력해 주세요.' });

    const systemPrompt = [
      '당신은 한국어 일기와 개인 기록을 자연스럽게 다듬는 전문 작가다.',
      '사용자가 준 사실과 키워드만 사용한다. 입력하지 않은 사건, 인물 관계, 장소, 대화, 감정, 결과를 절대로 지어내지 않는다.',
      '키워드를 쉼표로 이어 붙이지 말고 의미 관계를 파악해 자연스러운 한국어 문장으로 구성한다.',
      '한국어 조사와 어미를 정확하게 사용하고, 번역투·상투적인 교훈·과장된 감성 표현·불필요한 서론을 피한다.',
      '기록 종류와 문체를 반영한다. 결과는 초안으로 바로 편집할 수 있어야 한다.',
      '반드시 1~2문장으로 짧게 작성한다. 키워드에 없는 스토리나 세부사항을 덧붙이지 않는다. 제목이나 해설 없이 본문만 출력한다.',
      '정보가 부족하면 추측하지 않는다. 키워드만 자연스럽게 연결하고, 새 사실을 추가하지 않는다.'
    ].join('\n');

    const userPrompt = [
      '기록 종류: ' + context,
      '원하는 문체: ' + tone,
      date ? '기록 날짜: ' + date : '',
      '사용자 키워드: ' + keywords,
      '위 정보만 바탕으로 자연스럽고 읽기 좋은 한국어 기록 초안을 작성해 주세요.'
    ].filter(Boolean).join('\n');

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        max_completion_tokens: 1200,
        reasoning_effort: 'minimal',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('OpenAI writing error:', upstream.status, data && data.error && data.error.code);
      return res.status(502).json({ error: 'AI 문장 생성 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    }
    const choice = data.choices && data.choices[0];
    const draft = choice && choice.message && choice.message.content;
    if (!draft || !String(draft).trim()) {
      console.error('OpenAI writing empty response:', JSON.stringify({ model: data.model, finish_reason: choice && choice.finish_reason, usage: data.usage, message: choice && choice.message && { refusal: choice.message.refusal, finish_reason: choice.finish_reason } }));
      return res.status(502).json({ error: 'AI가 문장을 완성하지 못했습니다. 다시 시도해 주세요.' });
    }
    return res.status(200).json({ draft: String(draft).trim() });
  } catch (error) {
    console.error('Writing assistant error:', error && error.message);
    return res.status(500).json({ error: '문장 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};