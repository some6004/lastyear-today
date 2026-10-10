const { getPool, sendError } = require('./_db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validDate(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function clean(body) {
  const entry_date = String(body.entry_date || '');
  if (!validDate(entry_date)) { const e = new Error('기록 날짜를 확인해 주세요.'); e.status = 400; throw e; }
  const content = String(body.content || '').trim().slice(0, 30000);
  if (!content) { const e = new Error('기록 내용을 입력해 주세요.'); e.status = 400; throw e; }
  const title = String(body.title || '').trim().slice(0, 200);
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
  const image = typeof metadata.imageDataUrl === 'string' ? metadata.imageDataUrl : '';
  const imageUrl = typeof metadata.imageUrl === 'string' ? metadata.imageUrl : '';
  if (image && (!/^data:image\\/(jpeg|png|webp);base64,/.test(image) || image.length > 3500000)) { const e = new Error('사진은 2.5MB 이하로 올려 주세요.'); e.status = 400; throw e; }
  if (imageUrl && (!/^https:\\/\\//i.test(imageUrl) || imageUrl.length > 2000)) { const e = new Error('사진 주소를 확인해 주세요.'); e.status = 400; throw e; }
  return { entry_date, title, content, visibility: ['private','public','unlisted'].includes(body.visibility) ? body.visibility : 'private', metadata };
}
function safe(row) {
  if (!row) return row;
  if (String(row.title || '').trim() && String(row.title).trim() === String(row.content || '').trim()) return { ...row, title: '' };
  return row;
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = getPool();
    if (req.method === 'GET') {
      const id = typeof req.query.id === 'string' ? req.query.id : '';
      const date = typeof req.query.date === 'string' ? req.query.date : '';
      if (id) {
        if (!UUID.test(id)) return res.status(400).json({ error: '기록 주소가 올바르지 않습니다.' });
        const result = await db.query('SELECT id,entry_date,title,content,visibility,metadata,created_at,updated_at FROM public.lyt_demo_entries WHERE id=$1::uuid LIMIT 1',[id]);
        if (!result.rows[0]) return res.status(404).json({ error: '시연 기록을 찾을 수 없습니다.' });
        return res.status(200).json({ entry: safe(result.rows[0]) });
      }
      if (date && !validDate(date)) return res.status(400).json({ error: '기록 날짜를 확인해 주세요.' });
      const result = await db.query('SELECT id,entry_date,title,content,visibility,metadata,created_at,updated_at FROM public.lyt_demo_entries WHERE ($1::date IS NULL OR entry_date=$1::date) ORDER BY entry_date DESC,created_at DESC LIMIT 500',[date || null]);
      return res.status(200).json({ entries: result.rows.map(safe) });
    }
    if (req.method === 'POST') {
      const v = clean(req.body || {});
      const result = await db.query(`INSERT INTO public.lyt_demo_entries(entry_date,title,content,visibility,metadata) VALUES($1::date,$2,$3,$4,$5::jsonb) RETURNING id,entry_date,title,content,visibility,metadata,created_at,updated_at`,[v.entry_date,v.title,v.content,v.visibility,JSON.stringify(v.metadata)]);
      return res.status(201).json({ entry: safe(result.rows[0]) });
    }
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({ error:'지원하지 않는 요청입니다.' });
  } catch (error) { return sendError(res,error); }
};
