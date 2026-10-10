const { getPool, requireUser, sendError } = require('./_db');

const CONTEXTS = new Set(['일상','육아','여행','업무','가족','연애·관계','건강·운동','취미','기타']);
const TONES = new Set(['담백하게','감성적으로','밝고 유쾌하게','딱딱한 업무톤','다정하게','유머러스하게']);
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    const user = await requireUser(req);
    const db = getPool();
    const journal = String((req.method === 'GET' ? req.query && req.query.journal : req.body && req.body.journal) || '').trim().slice(0,160);
    if (req.method === 'GET') {
      const r = await db.query('SELECT context, tone FROM public.lyt_writing_preferences WHERE user_id=$1 AND journal_name=$2 LIMIT 1',[user.id,journal]);
      return res.status(200).json({preference:r.rows[0] || {context:'일상',tone:'담백하게'}});
    }
    if (req.method === 'PUT') {
      const context=String(req.body && req.body.context || '일상');
      const tone=String(req.body && req.body.tone || '담백하게');
      if(!CONTEXTS.has(context)||!TONES.has(tone)) return res.status(400).json({error:'기록 설정값이 올바르지 않습니다.'});
      const r=await db.query(`INSERT INTO public.lyt_writing_preferences(user_id,journal_name,context,tone,updated_at)
        VALUES($1,$2,$3,$4,now()) ON CONFLICT(user_id,journal_name)
        DO UPDATE SET context=EXCLUDED.context,tone=EXCLUDED.tone,updated_at=now()
        RETURNING context,tone`,[user.id,journal,context,tone]);
      return res.status(200).json({preference:r.rows[0]});
    }
    res.setHeader('Allow','GET, PUT');
    return res.status(405).json({error:'지원하지 않는 요청입니다.'});
  } catch(error) { return sendError(res,error); }
};