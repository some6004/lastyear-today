const { getPool, requireUser, sendError } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await requireUser(req);
    const db = getPool();

    if (req.method === 'GET') {
      const date = typeof req.query.date === 'string' ? req.query.date : null;
      const result = await db.query(
        `SELECT id, entry_date, title, content, visibility, metadata, created_at, updated_at
         FROM public.lyt_entries
         WHERE owner_id = $1 AND deleted_at IS NULL
           AND ($2::date IS NULL OR entry_date = $2::date)
         ORDER BY entry_date DESC, updated_at DESC
         LIMIT 500`,
        [user.id, date]
      );
      return res.status(200).json({ entries: result.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const entryDate = String(body.entry_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || Number.isNaN(Date.parse(entryDate + 'T00:00:00Z'))) {
        return res.status(400).json({ error: '기록 날짜를 확인해 주세요.' });
      }
      const title = String(body.title || '').trim().slice(0, 200);
      const content = String(body.content || '').slice(0, 30000);
      if (!content.trim()) return res.status(400).json({ error: '기록 내용을 입력해 주세요.' });
      const visibility = ['private', 'public', 'unlisted'].includes(body.visibility) ? body.visibility : 'private';
      const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
      const image = typeof metadata.imageDataUrl === 'string' ? metadata.imageDataUrl : '';
      if (image && (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 3500000)) {
        return res.status(400).json({ error: '사진 크기 또는 형식을 확인해 주세요. 사진은 2.5MB 이하로 올려 주세요.' });
      }
      const result = await db.query(
        `INSERT INTO public.lyt_entries (owner_id, entry_date, title, content, visibility, metadata)
         VALUES ($1, $2::date, $3, $4, $5, $6::jsonb)
         RETURNING id, entry_date, title, content, visibility, metadata, created_at, updated_at`,
        [user.id, entryDate, title, content, visibility, JSON.stringify({ ...metadata, imageDataUrl: image || undefined })]
      );
      return res.status(201).json({ entry: result.rows[0] });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    return sendError(res, error);
  }
};
