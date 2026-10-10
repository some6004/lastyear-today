const { getPool } = require('./_db');
function fail(res,status,error){return res.status(status).json({error})}
function clean(v,max){return String(v||'').trim().slice(0,max)}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const db=getPool();
  if(req.method==='POST'){
   const name=clean(req.body?.name,80),email=clean(req.body?.email,254).toLowerCase(),subject=clean(req.body?.subject,160),message=clean(req.body?.message,10000),userId=clean(req.body?.user_id,128)||null;
   if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||subject.length<2||message.length<5)return fail(res,400,'이름, 이메일, 제목과 문의 내용을 확인해 주세요.');
   const client=await db.connect();
   try{
    await client.query('BEGIN');
    const q=await client.query('INSERT INTO public.lyt_inquiries(name,email,user_id,subject) VALUES($1,$2,$3,$4) RETURNING id,name,email,subject,status,created_at,updated_at',[name,email,userId,subject]);
    const inquiry=q.rows[0];
    await client.query("INSERT INTO public.lyt_inquiry_messages(inquiry_id,sender_type,sender_name,message) VALUES($1,'customer',$2,$3)",[inquiry.id,name,message]);
    await client.query('COMMIT');return res.status(201).json({inquiry});
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  if(req.method==='GET'){
   const email=clean(req.query?.email,254).toLowerCase(),name=clean(req.query?.name,80),id=Number(req.query?.id||0);
   if(!email||!name||!id)return fail(res,400,'문의번호, 이름, 이메일을 입력해 주세요.');
   const q=await db.query('SELECT id,name,email,subject,status,created_at,updated_at FROM public.lyt_inquiries WHERE id=$1 AND lower(email)=lower($2) AND name=$3',[id,email,name]);
   if(!q.rows.length)return fail(res,404,'일치하는 문의를 찾을 수 없습니다. 문의번호·이름·이메일을 확인해 주세요.');
   const messages=await db.query('SELECT sender_type,sender_name,message,created_at FROM public.lyt_inquiry_messages WHERE inquiry_id=$1 ORDER BY created_at ASC',[id]);
   return res.status(200).json({inquiry:q.rows[0],messages:messages.rows});
  }
  res.setHeader('Allow','GET, POST');return fail(res,405,'지원하지 않는 요청입니다.');
 }catch(e){console.error('inquiries api error',e);return fail(res,500,'문의 처리 중 오류가 발생했습니다.')}
};