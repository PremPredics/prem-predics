import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import webpush from 'npm:web-push@3.6.7';
import { allowedPushEndpoint, notificationTTL } from './push-policy.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession:false, autoRefreshToken:false },
});
const cors = { 'Access-Control-Allow-Origin':'https://prempredics.com', 'Access-Control-Allow-Methods':'GET, OPTIONS', 'Vary':'Origin' };
const json = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
async function rpc(name:string,args:Record<string,unknown>={}) {
  const {data,error} = await db.rpc(name,args);
  if (error) throw new Error('Notification database operation failed: '+name);
  return data;
}
async function sameSecret(a:string,b:string) {
  if (!a || !b) return false;
  const hash=async (v:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
  const [x,y]=await Promise.all([hash(a),hash(b)]);
  return x.reduce((acc,value,i)=>acc | (value^y[i]),0)===0;
}
Deno.serve(async req => {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  try {
    if (req.method==='GET') {
      const key=await rpc('pp_push_public_key');
      return json({publicKey:key},key?200:503);
    }
    if (req.method!=='POST') return json({error:'Method not allowed'},405);
    const supplied=req.headers.get('X-Prem-Push-Secret') || '';
    if (!supplied || supplied.length>128) return json({error:'Unauthorized'},401);
    let secrets=await rpc('pp_push_runtime');
    if (!await sameSecret(supplied,secrets?.cronSecret)) return json({error:'Unauthorized'},401);
    if (!secrets.publicKey) {
      const keys=webpush.generateVAPIDKeys();
      await rpc('pp_push_initialize',{p_public:keys.publicKey,p_private:keys.privateKey});
      secrets=await rpc('pp_push_runtime');
    }
    const jobs=await rpc('pp_push_claim');
    let sent=0,failed=0;
    // Bounded batches and network deadlines keep work inside the five-minute lease.
    for (let offset=0;offset<jobs.length;offset+=10) {
      await Promise.all(jobs.slice(offset,offset+10).map(async (job:any) => {
        let status=0;
        try {
          const ttl=notificationTTL(job.expiresAt);
          if (!allowedPushEndpoint(job.endpoint) || !ttl) status=400;
          else {
            const details=webpush.generateRequestDetails({endpoint:job.endpoint,keys:job.keys},JSON.stringify(job.payload),{
              TTL:ttl,urgency:'normal',contentEncoding:'aes128gcm',
              vapidDetails:{subject:'https://prempredics.com',publicKey:secrets.publicKey,privateKey:secrets.privateKey},
            });
            const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,
              redirect:'error',signal:AbortSignal.timeout(10000)});
            status=response.status;
            await response.body?.cancel();
          }
        } catch { status=0; }
        await rpc('pp_push_finish',{p_id:job.id,p_status:status});
        if (status>=200 && status<300) sent++; else failed++;
      }));
    }
    return json({processed:jobs.length,sent,failed});
  } catch(error) {
    // Do not log subscriptions, tokens, VAPID keys or the cron secret.
    console.error(error instanceof Error?error.message:'Notification worker failed');
    return json({error:'Notification worker unavailable'},500);
  }
});
