const {getPool,requireUser,sendError}=require('./_db');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const user=await requireUser(req);const db=getPool();
  if(req.method==='POST'&&req.body?.action==='withdraw'){
   if(String(req.body.confirm||'')!=='탈퇴 신청')return res.status(400).json({error:'탈퇴 신청 확인 문구가 올바르지 않습니다.'});
   const r=await db.query("UPDATE public.lyt_profiles SET withdrawal_status='pending',withdrawal_requested_at=COALESCE(withdrawal_requested_at,now()),withdrawal_scheduled_at=COALESCE(withdrawal_scheduled_at,now()+interval '30 days'),updated_at=now() WHERE user_id=$1 RETURNING withdrawal_requested_at,withdrawal_scheduled_at",[user.id]);
   if(!r.rows.length)return res.status(404).json({error:'회원 프로필을 찾을 수 없습니다.'});
   return res.status(200).json({ok:true,...r.rows[0]});
  }
  if(req.method==='GET'){
   const r=await db.query('SELECT withdrawal_status,withdrawal_requested_at,withdrawal_scheduled_at FROM public.lyt_profiles WHERE user_id=$1',[user.id]);
   return res.status(200).json({account:r.rows[0]||{withdrawal_status:'active'}});
  }
  res.setHeader('Allow','GET, POST');return res.status(405).json({error:'지원하지 않는 요청입니다.'});
 }catch(e){return sendError(res,e)}
};