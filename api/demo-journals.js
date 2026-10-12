const { getPool, sendError } = require('./_db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIND = 'lyt_demo_journal';
function validImage(value) {
  if (!value) return '';
  if (/^https:\/\//i.test(value) && value.length <= 2000) return value;
  if (/^data:image\/(jpeg|png|webp);base64,/.test(value) && value.length <= 3500000) return value;
  const e = new Error('기록장 사진은 2.5MB 이하로 올려 주세요.'); e.status = 400; throw e;
}
function safe(row) {
  const m = row.metadata || {};
  return {
    id: row.id,
    name: String(m.name || row.title || ''),
    desc: String(m.description || row.content || ''),
    image: String(m.image || ''),
    visibility: m.visibility || 'public',
    deletedAt: m.deletedAt ? Number(m.deletedAt) : null,
    expiresAt: m.expiresAt ? Number(m.expiresAt) : null,
    deletedId: m.deletedId || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = getPool();
    if (req.method === 'GET') {
      const result = await db.query(
        `SELECT id,entry_date,title,content,metadata,created_at,updated_at
         FROM public.lyt_demo_entries
         WHERE metadata->>'_lyt_kind' = $1
         ORDER BY created_at ASC`, [KIND]
      );
      const journals = result.rows.map(safe);
      return res.status(200).json({
        journals: journals.filter(j => !j.deletedAt || j.expiresAt > Date.now()),
        deleted: journals.filter(j => j.deletedAt && j.expiresAt > Date.now())
      });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const items = Array.isArray(body.journals) ? body.journals : [body];
      if (items.length > 100) return res.status(400).json({ error: '한 번에 저장할 수 있는 기록장은 100개까지입니다.' });
      const saved = [];
      for (const item of items) {
        const name = String(item.name || '').trim().slice(0, 160);
        if (!name) continue;
        const id = UUID.test(String(item.id || '')) ? item.id : null;
        const desc = String(item.desc || item.description || '').slice(0, 2000);
        const image = validImage(String(item.image || ''));
        const deletedAt = item.deletedAt ? Number(item.deletedAt) : null;
        const expiresAt = item.expiresAt ? Number(item.expiresAt) : null;
        const deletedId = String(item.deletedId || '');
        const metadata = { _lyt_kind: KIND, name, description: desc, image, visibility: 'public',
          deletedAt: Number.isFinite(deletedAt) ? deletedAt : null,
          expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
          deletedId: deletedId.slice(0, 100) || null };
        const result = await db.query(
          `INSERT INTO public.lyt_demo_entries (id,entry_date,title,content,visibility,metadata)
           VALUES (COALESCE($1::uuid,gen_random_uuid()),CURRENT_DATE,$2,$3,'unlisted',$4::jsonb)
           ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,
             metadata=EXCLUDED.metadata,updated_at=now()
           WHERE public.lyt_demo_entries.metadata->>'_lyt_kind'=$5
           RETURNING id,entry_date,title,content,metadata,created_at,updated_at`,
          [id, name, desc, JSON.stringify(metadata), KIND]
        );
        if (result.rows[0]) saved.push(safe(result.rows[0]));
      }
      return res.status(200).json({ journals: saved });
    }
    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      if (!UUID.test(id)) return res.status(400).json({ error: '기록장 주소가 올바르지 않습니다.' });
      const result = await db.query(
        `UPDATE public.lyt_demo_entries SET metadata = metadata || $2::jsonb, updated_at=now()
         WHERE id=$1::uuid AND metadata->>'_lyt_kind'=$3
         RETURNING id,entry_date,title,content,metadata,created_at,updated_at`,
        [id, JSON.stringify({deletedAt:Date.now(),expiresAt:Date.now()+7*24*60*60*1000,deletedId:Date.now()+'_'+Math.random().toString(36).slice(2)}), KIND]
      );
      if (!result.rows[0]) return res.status(404).json({ error: '기록장을 찾을 수 없습니다.' });
      return res.status(200).json({ journal: safe(result.rows[0]) });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (error) { return sendError(res, error); }
};
