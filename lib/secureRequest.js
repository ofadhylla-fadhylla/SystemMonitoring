import {createClient} from '@supabase/supabase-js';
export class RequestError extends Error{constructor(status,message){super(message);this.status=status;}}
export const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function failure(error){return json({error:error instanceof RequestError?error.message:'Request could not be completed.'},error instanceof RequestError?error.status:500);}
export async function adminClient(req){
 const token=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];if(!token||token.length>8192)throw new RequestError(401,'Sign in required.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new RequestError(503,'Authentication unavailable.');
 const client=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const result=await client.auth.getUser(token);if(result.error||!result.data.user)throw new RequestError(401,'Session expired. Sign in again.');
 const role=await client.rpc('smd_is_admin');if(role.error)throw new RequestError(503,'Access could not be verified.');if(role.data!==true)throw new RequestError(403,'Administrator access required.');return client;
}
export async function body(req){if(!req.headers.get('content-type')?.includes('application/json'))throw new RequestError(415,'JSON required.');const length=Number(req.headers.get('content-length')||0);if(length>4096)throw new RequestError(413,'Request too large.');const text=await req.text();if(text.length>4096)throw new RequestError(413,'Request too large.');try{return JSON.parse(text);}catch{throw new RequestError(400,'Invalid JSON.');}}
export async function reserve(client,service,max){const day=new Date().toISOString().slice(0,10);const read=await client.from('smd2_external_request_slots').select('slot').eq('service',service).eq('request_day',day);if(read.error)throw new RequestError(503,'Usage limit could not be verified.');const used=new Set(read.data.map(x=>x.slot));for(let slot=1;slot<=max;slot++){if(used.has(slot))continue;const r=await client.from('smd2_external_request_slots').insert({service,slot});if(!r.error)return;if(r.error.code!=='23505')throw new RequestError(503,'Usage slot unavailable.');}throw new RequestError(429,'Daily request limit reached. Try again after 00:00 UTC.');}
