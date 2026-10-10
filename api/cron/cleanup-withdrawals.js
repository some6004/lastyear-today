const {getPool}=require('../_db');
module.exports=async function handler(req,res){
 const secret=process.env.CRON_SECRET,auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!secret||auth!==secret)return res.status(401).json({error:'Unauthorized'});
 const db=getPool();
 try{
  const due=await db.query("SELECT user_id FROM public.lyt_profiles WHERE withdrawal_status='pending' AND withdrawal_scheduled_at<=now() ORDER BY withdrawal_scheduled_at LIMIT 100");
  let deleted=0;
  for(const row of due.rows){
   const client=await db.connect();
   try{
    await client.query('BEGIN');
    const check=await client.query("SELECT user_id FROM public.lyt_profiles WHERE user_id=$1 AND withdrawal_status='pending' AND withdrawal_scheduled_at<=now() FOR UPDATE",[row.user_id]);
    if(!check.rows.length){await client.query('ROLLBACK');continue}
    const uid=row.user_id;
    await client.query('DELETE FROM public.lyt_entry_media WHERE entry_id IN (SELECT id FROM public.lyt_entries WHERE owner_id=$1)',[uid]);
    await client.query('DELETE FROM public.lyt_entries WHERE owner_id=$1',[uid]);
    await client.query('DELETE FROM public.lyt_journals WHERE owner_id=$1',[uid]);
    await client.query('DELETE FROM public.lyt_profiles WHERE user_id=$1',[uid]);
    await client.query('DELETE FROM neon_auth."user" WHERE id::text=$1',[uid]);
    await client.query('COMMIT');deleted++;
   }catch(e){await client.query('ROLLBACK');console.error('withdrawal cleanup failed',row.user_id,e)}finally{client.release()}
  }
  return res.status(200).json({ok:true,deleted,checked:due.rows.length});
 }catch(e){console.error('withdrawal cleanup error',e);return res.status(500).json({error:'Cleanup failed'})}
};