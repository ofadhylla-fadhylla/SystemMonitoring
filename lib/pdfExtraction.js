const ROOT='/smd-doc-assets/';
let pdfPromise,ocrPromise;
function loadScript(src,globalName,type){if(globalThis[globalName])return Promise.resolve(globalThis[globalName]);return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;if(type)s.type=type;s.onload=()=>globalThis[globalName]?resolve(globalThis[globalName]):reject(Error('Document library did not initialise.'));s.onerror=()=>reject(Error('Document extraction assets could not be loaded.'));document.head.appendChild(s);});}
async function pdfLibrary(){if(!pdfPromise)pdfPromise=loadScript(ROOT+'pdf-loader.mjs','smdPdfJs','module').catch(e=>{pdfPromise=null;throw e;});return pdfPromise;}
async function ocrLibrary(){if(!ocrPromise)ocrPromise=loadScript(ROOT+'tesseract.min.js','Tesseract').catch(e=>{ocrPromise=null;throw e;});return ocrPromise;}
export async function extractPdf(file,{onProgress=()=>{},forceOcr=false}={}){
 const pdf=await pdfLibrary();pdf.GlobalWorkerOptions.workerSrc=ROOT+'pdf.worker.mjs';
 const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,cMapUrl:ROOT+'cmaps/',cMapPacked:true,standardFontDataUrl:ROOT+'standard_fonts/',wasmUrl:ROOT+'wasm/',iccUrl:ROOT+'iccs/',useWorkerFetch:true,maxImageSize:16000000,canvasMaxAreaInBytes:64000000});
 let worker=null,documentPdf=null,ocrCount=0;const pages=[];let total=0;
 try{
  documentPdf=await task.promise;if(documentPdf.numPages>100)throw Error('PDF exceeds 100 pages; split it into smaller documents.');
  for(let n=1;n<=documentPdf.numPages;n++){
   onProgress('Reading page '+n+' / '+documentPdf.numPages);const page=await documentPdf.getPage(n);let canvas=null;
   try{const content=await page.getTextContent();let text=content.items.map(x=>typeof x.str==='string'?x.str+(x.hasEOL?'\n':' '):'').join('').trim();let label='Page '+n;
    if(forceOcr||text.replace(/\s/g,'').length<25){if(++ocrCount>15)throw Error('OCR limited to 15 scanned pages per file. Split the scan and retry.');onProgress('OCR page '+n+' / '+documentPdf.numPages);
     if(!worker){const T=await ocrLibrary();worker=await T.createWorker(['ind','eng'],1,{workerPath:ROOT+'worker.min.js',corePath:ROOT+'core',langPath:ROOT+'lang',workerBlobURL:false,cacheMethod:'none'});}
     const v=page.getViewport({scale:1});const scale=Math.min(2.3,Math.sqrt(4000000/(v.width*v.height)));const viewport=page.getViewport({scale});canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas unavailable.');await page.render({canvas,canvasContext:ctx,viewport}).promise;
     const r=await worker.recognize(canvas);const recognized=String(r?.data?.text||'').trim();if(recognized)text=recognized;label+=' — OCR, verify';if(!text)label+=' — no text recognized';
    }
    const result='['+label+']\n'+text;total+=result.length;if(total>1000000)throw Error('Extracted text exceeds 1 million characters. Split document.');pages.push(result);
   }finally{if(canvas){canvas.width=0;canvas.height=0;}page.cleanup();}
  }
  if(!pages.some(p=>p.split('\n').slice(1).join('\n').trim()))throw Error('No readable text. Add approved text manually.');
  return pages.join('\n\n');
 }finally{if(worker)await worker.terminate().catch(()=>{});if(documentPdf)await documentPdf.destroy().catch(()=>{});else await task.destroy().catch(()=>{});}
}
