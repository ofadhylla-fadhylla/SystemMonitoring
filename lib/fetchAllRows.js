// Fetch all rows visible to the current authenticated user under existing RLS.
// Rebuild the query on each page and use a deterministic unique tie-breaker.
// Return an error instead of partial records if any request fails.
export async function fetchAllRows(buildQuery,pageSize=500){
 const rows=[];
 try{
  for(let from=0;;from+=pageSize){
   const result=await buildQuery().order('id',{ascending:true}).range(from,from+pageSize-1);
   if(result.error)return {data:null,error:result.error};
   if(!Array.isArray(result.data))return {data:null,error:new Error('Unexpected query response')};
   rows.push(...result.data);
   if(result.data.length<pageSize)return {data:rows,error:null};
  }
 }catch(error){return {data:null,error};}
}
