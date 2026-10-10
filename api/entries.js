const { getPool, requireUser, sendError } = require('./_db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function hideDuplicateTitle(entry) {
  if (!entry) return entry;
  const title = String(entry.title || '').trim();
  const content = String(entry.content || '').trim();
  // The writing page historically used the entire body as its title.
  // Do not return that duplicate title to readers; keep the saved content intact.
  if (title && content && title === content) return { ...entry, title: '' };
  return entry;
}

function cleanEntry(body) {
  const entryDate = String(body.entry_date || '');
  if (!validDate(entryDate)) {
    const error = new Error('기록 날짜를 확인해 주세요.');
    error.status = 400;
    throw error;
  }
  const title = String(body.title || '').trim().slice(0, 200);
  const content = String(body.content || '').slice(0, 30000);
  if (!content.trim()) {
    const error = new Error('기록 내용을 입력해 주세요.');
    error.status = 400;
    throw error;
  }
  const visibility = ['private', 'public', 'unlisted'].includes(body.visibility) ? body.visibility : 'private';
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
  const image = typeof metadata.imageDataUrl === 'string' ? metadata.imageDataUrl : '';
  const imageUrl = typeof metadata.imageUrl === 'string' ? metadata.imageUrl : '';
  if (image && (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 3500000)) {
    const error = new Error('사진 크기 또는 형식을 확인해 주세요. 사진은 2.5MB 이하로 올려 주세요.');
    error.status = 400;
    throw error;
  }
  if (imageUrl && (!/^https:\/\//i.test(imageUrl) || imageUrl.length > 2000)) {
    const error = new Error('사진 주소를 확인해 주세요.');
    error.status = 400;
    throw error;
  }
  return { entryDate, title, content, visibility, metadata: { ...metadata, imageDataUrl: image || undefined, imageUrl: imageUrl || undefined } };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await requireUser(req);
    const db = getPool();

    if (req.method === 'GET') {
      const id = typeof req.query.id === 'string' ? req.query.id : null;
      if (id) {
        if (!UUID.test(id)) return res.status(400).json({ error: '기록 주소가 올바르지 않습니다.' });
        const one = await db.query(
          `SELECT id, entry_date, title, content, visibility, metadata, created_at, updated_at
           FROM public.lyt_entries WHERE id=$1::uuid AND owner_id=$2 AND deleted_at IS NULL LIMIT 1`,
          [id, user.id]
        );
        if (!one.rows[0]) return res.status(404).json({ error: '기록을 찾을 수 없습니다.' });
        return res.status(200).json({ entry: hideDuplicateTitle(one.rows[0]) });
      }
      const date = typeof req.query.date === 'string' ? req.query.date : null;
      if (date && !validDate(date)) return res.status(400).json({ error: '기록 날짜를 확인해 주세요.' });
      const result = await db.query(
        `SELECT id, entry_date, title, content, visibility, metadata, created_at, updated_at
         FROM public.lyt_entries
         WHERE owner_id = $1 AND deleted_at IS NULL
           AND ($2::date IS NULL OR entry_date = $2::date)
         ORDER BY entry_date DESC, updated_at DESC
         LIMIT 500`,
        [user.id, date]
      );
      return res.status(200).json({ entries: result.rows.map(hideDuplicateTitle) });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = req.body || {};
      const values = cleanEntry(body);
      if (req.method === 'POST') {
        let journalId = null;
        const journalName = String(body.journal_name || '').trim().slice(0, 160);
        if (journalName) {
          const journal = await db.query(
            'SELECT id FROM public.lyt_journals WHERE owner_id = $1 AND title = $2 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
            [user.id, journalName]
          );
          if (journal.rows[0]) journalId = journal.rows[0].id;
        }
        const result = await db.query(
          `INSERT INTO public.lyt_entries (owner_id, journal_id, entry_date, title, content, visibility, metadata)
           VALUES ($1, $2::uuid, $3::date, $4, $5, $6, $7::jsonb)
           RETURNING id, journal_id, entry_date, title, content, visibility, metadata, created_at, updated_at`,
          [user.id, journalId, values.entryDate, values.title, values.content, values.visibility, JSON.stringify(values.metadata)]
        );
        return res.status(201).json({ entry: result.rows[0] });
      }
      const id = String(body.id || (req.query && req.query.id) || '');
      if (!UUID.test(id)) return res.status(400).json({ error: '기록 ID가 올바르지 않습니다.' });
      const result = await db.query(
        `UPDATE public.lyt_entries
         SET entry_date = $3::date, title = $4, content = $5, visibility = $6,
             metadata = $7::jsonb, updated_at = now()
         WHERE id = $1::uuid AND owner_id = $2 AND deleted_at IS NULL
         RETURNING id, entry_date, title, content, visibility, metadata, created_at, updated_at`,
        [id, user.id, values.entryDate, values.title, values.content, values.visibility, JSON.stringify(values.metadata)]
      );
      if (!result.rowCount) return res.status(404).json({ error: '기록을 찾을 수 없습니다.' });
      return res.status(200).json({ entry: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || (req.body && req.body.id) || '');
      if (!UUID.test(id)) return res.status(400).json({ error: '기록 ID가 올바르지 않습니다.' });
      const result = await db.query(
        'UPDATE public.lyt_entries SET deleted_at = now(), updated_at = now() WHERE id = $1::uuid AND owner_id = $2 AND deleted_at IS NULL RETURNING id',
        [id, user.id]
      );
      return res.status(result.rowCount ? 200 : 404).json({ deleted: result.rowCount > 0 });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    return sendError(res, error);
  }
};
