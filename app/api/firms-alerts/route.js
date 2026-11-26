import {adminClient,body,failure,json,RequestError,reserve} from '../../../lib/secureRequest';
import {prepareBoundaries,screenPoint,parseCsv,normalize} from '../../../lib/geowatch';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=30;
const SOURCE='VIIRS_NOAA20_NRT';
export async function POST(req){try{
 const db=await adminClient(req);
 const mapKey=process.env.FIRMS_MAP_KEY;if(!mapKey||!/^[A-Za-z0-9_-]{10,128}$/.test(mapKey))throw new RequestError(503,'NASA FIRMS is not configured. Set FIRMS_MAP_KEY on the server.');
 const args=await body(req),companyId=String(args.company_id||''),days=Number(args.days||1);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)||![1,2,3].includes(days))throw new RequestError(400,'Select company and 1–3 day window.');
 const l=await db.from('spatial_layers').select('id,layer_name,geojson').eq('company_id',companyId).eq('layer_type','company_boundary').limit(101);if(l.error)throw new RequestError(503,'Boundary register unavailable.');if(l.data.length>100)throw new RequestError(422,'Too many boundary layers; consolidate them first.');
 const boundaries=prepareBoundaries(l.data);if(!boundaries.length)throw new RequestError(422,'Upload a valid company boundary before using satellite monitoring.');
 let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;for(const b of boundaries){w=Math.min(w,b.bbox[0]);s=Math.min(s,b.bbox[1]);e=Math.max(e,b.bbox[2]);n=Math.max(n,b.bbox[3]);}
 const pad=.015;w=Math.floor((w-pad)*1000)/1000;s=Math.floor((s-pad)*1000)/1000;e=Math.ceil((e+pad)*1000)/1000;n=Math.ceil((n+pad)*1000)/1000;
 if(w<90||e>145||s< -15||n>10||e<=w||n<=s||(e-w)*(n-s)>4)throw new RequestError(422,'Boundary extent is too broad or outside the supported Indonesia region; use a smaller company/site boundary.');
 await reserve(db,'firms',24);
 const url='https://firms.modaps.eosdis.nasa.gov/api/area/csv/'+encodeURIComponent(mapKey)+'/'+SOURCE+'/'+[w,s,e,n].join(',')+'/'+days;
 let response;try{response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(18000),headers:{accept:'text/csv'}});}catch{throw new RequestError(502,'NASA FIRMS connection failed. No risk conclusion can be drawn.');}
 if(!response.ok)throw new RequestError(502,'NASA FIRMS rejected the request. Check MAP_KEY and service limits.');
 const text=await response.text();if(text.length>6000000||!/^latitude,longitude,/i.test(text.trim()))throw new RequestError(502,'Unexpected NASA FIRMS response. No observations were accepted.');
 let all;try{all=parseCsv(text);}catch{throw new RequestError(502,'Invalid FIRMS CSV response.');}
 if(all.length>50000)throw new RequestError(422,'Too many observations. Use a shorter window.');
 const unique=new Map();
 for(const f of all){const c=f.geometry?.coordinates,p=f.properties||{};if(!Array.isArray(c)||!c.every(Number.isFinite)||c[0]<w||c[0]>e||c[1]<s||c[1]>n||!/^\d{4}-\d{2}-\d{2}$/.test(String(p.acq_date||'')))throw new RequestError(502,'Invalid FIRMS observation.');const matches=screenPoint(c,boundaries);if(!matches.length)continue;const k=[c[0],c[1],p.acq_date,p.acq_time,p.satellite].join('|');unique.set(k,{type:'Feature',geometry:f.geometry,properties:{acq_date:p.acq_date,acq_time:p.acq_time,confidence:p.confidence,frp:p.frp,satellite:p.satellite,instrument:p.instrument,matched_boundaries:matches.join('; ')}});}
 const geojson=unique.size?normalize({type:'FeatureCollection',features:[...unique.values()]},'hotspot'):{type:'FeatureCollection',features:[]};
 return json({source:SOURCE,provider:'NASA FIRMS',days,fetched_at:new Date().toISOString(),bbox:[w,s,e,n],bbox_observations:all.length,inside:geojson.features.length,geojson});
 }catch(e){return failure(e);}}
