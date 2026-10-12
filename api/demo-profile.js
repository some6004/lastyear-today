const { getPool, sendError } = require('./_db');
const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const KIND = 'lyt_demo_profile';
function clean(value) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = { _lyt_kind: KIND };
  for (const key of ['name','description','birth','email','phone','plan','photo']) {
    if (typeof v[key] === 'string') out[key] = v[key].slice(0, key === 'photo' ? 3500000 : 2000);
  }
  if (out.photo && !/^data:image\/(jpeg|png|webp);base64,/.test(out.photo)) {
    const e = new Error('프로필 사진 형식을 확인해 주세요.'); e.status = 400; throw e;
  }
  return out;
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  try {
    const db=getPool();
    if(req.method==='GET') {
      const r=await db.query(`SELECT metadata FROM public.lyt_demo_entries WHERE id=$1::uuid AND metadata->>'_lyt_kind'=$2 LIMIT 1`,[PROFILE_ID,KIND]);
      return res.status(200).json({profile:r.rows[0] ? Object.fromEntries(Object.entries(r.rows[0].metadata||{}).filter(([k])=>k!=='_lyt_kind')) : null});
    }
    if(req.method==='PUT'||req.method==='POST') {
      const metadata=clean(req.body||{});
      const result=await db.query(
        `INSERT INTO public.lyt_demo_entries(id,entry_date,title,content,visibility,metadata)
         VALUES($1::uuid,CURRENT_DATE,'__profile__','', 'unlisted',$2::jsonb)
         ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,updated_at=now()
         RETURNING metadata`,[PROFILE_ID,JSON.stringify(metadata)]);
      const profile=Object.fromEntries(Object.entries(result.rows[0].metadata||{}).filter(([k])=>k!=='_lyt_kind'));
      return res.status(200).json({profile});
    }
    res.setHeader('Allow','GET, PUT, POST');
    return res.status(405).json({error:'지원하지 않는 요청입니다.'});
  } catch(error) { return sendError(res,error); }
};
