// Limited, dependency-free WGS84 SHP ZIP geometry importer.
// Reads only one .shp + matching .prj. DBF attributes are intentionally not imported.
const MAX=24*1024*1024;
const fail=m=>{throw Error(m)};
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function entries(bytes){
 const d=view(bytes),len=bytes.length;let end=-1;
 for(let i=len-22;i>=Math.max(0,len-65557);i--)if(d.getUint32(i,true)===0x06054b50&&i+22+d.getUint16(i+20,true)===len){end=i;break;}
 if(end<0)fail('Invalid ZIP central directory.');
 if(d.getUint16(end+4,true)||d.getUint16(end+6,true))fail('Multi-disk ZIP not supported.');
 const count=d.getUint16(end+10,true),size=d.getUint32(end+12,true),offset=d.getUint32(end+16,true);
 if(count>100||count!==d.getUint16(end+8,true)||offset+size>end)fail('ZIP directory exceeds supported limits.');
 const out=[];let pos=offset,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>offset+size||d.getUint32(pos,true)!==0x02014b50)fail('Invalid ZIP entry.');
  const flags=d.getUint16(pos+8,true),method=d.getUint16(pos+10,true),crc=d.getUint32(pos+16,true),compressed=d.getUint32(pos+20,true),length=d.getUint32(pos+24,true),n=d.getUint16(pos+28,true),extra=d.getUint16(pos+30,true),comment=d.getUint16(pos+32,true),local=d.getUint32(pos+42,true);
  if(pos+46+n+extra+comment>offset+size||flags&1||![0,8].includes(method)||length>MAX||local+30>offset||d.getUint32(local,true)!==0x04034b50)fail('Unsupported or damaged ZIP entry.');
  const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+n));const data=local+30+d.getUint16(local+26,true)+d.getUint16(local+28,true);
  if(data+compressed>offset||d.getUint16(local+8,true)!==method)fail('Invalid ZIP data offset.');
  total+=length;if(total>MAX)fail('Expanded ZIP exceeds 24 MB.');
  out.push({name,method,crc,length,data:bytes.subarray(data,data+compressed)});pos+=46+n+extra+comment;
 }
 if(pos!==offset+size)fail('ZIP directory length mismatch.');return out;
}
function crc32(b){let crc=0xffffffff;for(const x of b){crc^=x;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
async function unzip(e){
 let bytes=e.data;
 if(e.method===8){if(typeof DecompressionStream==='undefined')fail('Browser cannot decompress ZIP; use current Chrome or convert to GeoJSON.');let reader;try{reader=new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();}catch{fail('Browser does not support raw ZIP deflate; use current Chrome or GeoJSON.');}
 const out=new Uint8Array(e.length);let pos=0;try{for(;;){const {value,done}=await reader.read();if(done)break;if(pos+value.length>out.length)fail('ZIP expanded length exceeded.');out.set(value,pos);pos+=value.length;}if(pos!==out.length)fail('ZIP expanded length mismatch.');}finally{await reader.cancel().catch(()=>{});}bytes=out;}
 if(bytes.length!==e.length||crc32(bytes)!==e.crc)fail('ZIP entry checksum failed.');return bytes;
}
function isWgs84(text){
 const s=text.trim();if(!/^(GEOGCS|GEOGCRS|GEODCRS)\s*\[/i.test(s)||/\b(PROJCS|PROJCRS|COMPD_CS|COMPOUNDCRS)\s*\[/i.test(s))return false;
 return /(?:WGS[_ ]?1984|WGS[_ ]?84|World Geodetic System 1984)/i.test(s)&&/(?:UNIT|ANGLEUNIT)\s*\[\s*"degree"/i.test(s);
}
function area(r){let a=0;for(let i=1;i<r.length;i++)a+=r[i-1][0]*r[i][1]-r[i][0]*r[i-1][1];return a/2;}
function inside(p,r){let v=false;for(let i=1,j=0;i<r.length;j=i++){const a=r[j],b=r[i];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;}
export function parseShp(bytes){
 const d=view(bytes),len=bytes.length;if(len<100||d.getInt32(0,false)!==9994||d.getInt32(24,false)*2!==len||d.getInt32(28,true)!==1000)fail('Invalid SHP header.');
 const shape=d.getInt32(32,true);if(![1,5].includes(shape))fail('Only 2D Point or Polygon SHP are supported.');
 const features=[];let pos=100,vertices=0;
 while(pos<len){
  if(pos+12>len)fail('Truncated SHP record.');const size=d.getInt32(pos+4,false)*2,start=pos+8,end=start+size;const type=d.getInt32(start,true);if(size<4||end>len)fail('Invalid SHP record length.');pos=end;
  if(type===0)continue;if(type!==shape)fail('Mixed or unsupported SHP type.');
  let geometry;
  if(type===1){if(size!==20)fail('Invalid Point record.');geometry={type:'Point',coordinates:[d.getFloat64(start+4,true),d.getFloat64(start+12,true)]};vertices++;}
  else {
   if(size<44)fail('Truncated Polygon record.');const parts=d.getInt32(start+36,true),points=d.getInt32(start+40,true),coords=start+44+parts*4;
   if(parts<1||parts>10000||points<4||points>500000||coords+points*16!==end)fail('Invalid Polygon counts or length.');
   const offsets=Array.from({length:parts},(_,i)=>d.getInt32(start+44+i*4,true));offsets.push(points);if(offsets[0]!==0)fail('Invalid ring start.');
   const shells=[],holes=[];
   for(let i=0;i<parts;i++){const a=offsets[i],b=offsets[i+1];if(a<0||b>points||b-a<4)fail('Invalid ring index.');const ring=Array.from({length:b-a},(_,j)=>[d.getFloat64(coords+(a+j)*16,true),d.getFloat64(coords+(a+j)*16+8,true)]);if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])fail('Unclosed SHP ring.');const signed=area(ring);if(!Number.isFinite(signed)||Math.abs(signed)<1e-14)fail('Degenerate polygon ring.');(signed<0?shells:holes).push({ring,area:Math.abs(signed),holes:[]});}
   if(!shells.length)fail('Polygon has no clockwise outer ring per SHP specification.');
   if(shells.length*holes.length>100000)fail('Polygon ring complexity exceeds limit.');
   for(const h of holes){const owners=shells.filter(s=>s.area>h.area&&inside(h.ring[0],s.ring)).sort((a,b)=>a.area-b.area);if(!owners.length)fail('Unassigned interior ring; repair geometry in GIS.');owners[0].holes.push(h.ring);}
   const polygons=shells.map(s=>[s.ring,...s.holes]);geometry=polygons.length===1?{type:'Polygon',coordinates:polygons[0]}:{type:'MultiPolygon',coordinates:polygons};vertices+=points;
  }
  features.push({type:'Feature',properties:{shp_record:d.getInt32(start-8,false)},geometry});if(vertices>500000||features.length>50000)fail('SHP exceeds feature/vertex limit.');
 }
 if(!features.length)fail('No non-null SHP geometry.');return {type:'FeatureCollection',features};
}
export async function importShpZip(file){const es=entries(new Uint8Array(await file.arrayBuffer()));const layers=es.filter(e=>/\.shp$/i.test(e.name)&&!e.name.startsWith('__MACOSX/'));if(layers.length!==1)fail('ZIP must contain exactly one shapefile layer.');const e=layers[0],prj=es.filter(x=>x.name.toLowerCase()===e.name.replace(/\.shp$/i,'.prj').toLowerCase());if(prj.length!==1)fail('Matching .prj required. Export WGS84 EPSG:4326 in QGIS.');const projection=new TextDecoder().decode(await unzip(prj[0]));if(!isWgs84(projection))fail('Only geographic WGS84 EPSG:4326 SHP supported. Reproject before uploading.');return parseShp(await unzip(e));}

// Bounded ZIP entry extraction for Office Open XML documents.
export async function readZipEntry(file,name){if(!file||file.size>20*1024*1024)fail('Document exceeds 20 MB.');const matches=entries(new Uint8Array(await file.arrayBuffer())).filter(e=>e.name===name);if(matches.length!==1)fail('Required document XML entry is missing or duplicated.');return new TextDecoder().decode(await unzip(matches[0]));}
