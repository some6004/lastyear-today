const { getPool, requireUser, sendError } = require('./_db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await requireUser(req);
    const db = getPool();

    if (req.method === 'GET') {
      const result = await db.query(
        `SELECT id, title AS name, description AS description, cover_image_key AS image,
                visibility, created_at, updated_at
         FROM public.lyt_journals
         WHERE owner_id = $1 AND deleted_at IS NULL
         ORDER BY created_at ASC`,
        [user.id]
      );
      return res.status(200).json({ journals: result.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const items = Array.isArray(body.journals) ? body.journals : [body];
      if (items.length > 100) return res.status(400).json({ error: '한 번에 저장할 수 있는 기록장은 100개까지입니다.' });

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const saved = [];
        for (const item of items) {
          const title = String(item.name || item.title || '').trim().slice(0, 160);
          if (!title) continue;
          const id = UUID.test(String(item.id || '')) ? item.id : null;
          const description = String(item.desc || item.description || '').slice(0, 2000);
          const rawImage = typeof item.image === 'string' ? item.image : '';
          const image = /^https:\/\//i.test(rawImage) && rawImage.length <= 2000
            ? rawImage
            : (/^data:image\/(jpeg|png|webp);base64,/.test(rawImage) && rawImage.length <= 3500000 ? rawImage : null);
          const visibility = ['private', 'public', 'unlisted'].includes(item.visibility) ? item.visibility : 'private';
          const result = await client.query(
            `INSERT INTO public.lyt_journals (id, owner_id, title, description, cover_image_key, visibility)
             VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title,
               description = EXCLUDED.description, cover_image_key = EXCLUDED.cover_image_key,
               visibility = EXCLUDED.visibility, updated_at = now()
             WHERE public.lyt_journals.owner_id = EXCLUDED.owner_id
             RETURNING id, title AS name, description AS description, cover_image_key AS image, visibility, created_at, updated_at`,
            [id, user.id, title, description, image, visibility]
          );
          if (result.rows[0]) saved.push(result.rows[0]);
        }
        await client.query('COMMIT');
        return res.status(200).json({ journals: saved });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      if (!UUID.test(id)) return res.status(400).json({ error: '기록장 ID가 올바르지 않습니다.' });
      const result = await db.query(
        'UPDATE public.lyt_journals SET deleted_at = now(), updated_at = now() WHERE id = $1::uuid AND owner_id = $2 AND deleted_at IS NULL RETURNING id',
        [id, user.id]
      );
      return res.status(result.rowCount ? 200 : 404).json({ deleted: result.rowCount > 0 });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    return sendError(res, error);
  }
};
