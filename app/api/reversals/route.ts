import { requireStaff, serviceDb, sameOrigin, safeError } from "@/lib/server";
import { can } from "@/lib/permissions";
import { reversalSchema } from "@/lib/reversals";
import { receiptArchive } from "@/lib/receipt-archive";
export async function GET(req: Request) {
 try {
  const staff=await requireStaff();
  if(!can(staff,"kasse")&&!can(staff,"finanzen")&&!can(staff,"storno"))throw Error("FORBIDDEN");
  const search=(new URL(req.url).searchParams.get("q")||"").trim().replace(/^E-/i,"");
  const db=serviceDb();let query=db.from("sales").select("*").order("created_at",{ascending:false}).limit(50);
  if(!can(staff,"finanzen")&&!can(staff,"storno"))query=query.eq("actor",staff.user.id);
  if(search) {
   if(/^\d{1,12}$/.test(search))query=query.eq("number",Number(search));
   else if(/^[0-9a-f-]{36}$/i.test(search))query=query.eq("id",search);
   else return Response.json({sales:[],reversals:[]},{headers:{"Cache-Control":"no-store"}});
  }
  const {data:sales,error}=await query;if(error)throw error;
  const ids=(sales||[]).map(s=>s.id);
  const related=ids.length?await db.from("sales").select("*").in("original_sale_id",ids):{data:[],error:null};if(related.error)throw related.error;
  return Response.json({sales,reversals:related.data},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return safeError(e);}
}
export async function POST(req: Request) {
 try {
  sameOrigin(req);const staff=await requireStaff("storno");
  const value=reversalSchema.parse(await req.json());
  const {data,error}=await serviceDb().rpc("reverse_sale",{p_value:value,p_actor:staff.user.id});
  if(error)throw new Error(error.message);
  let archived=false;try {await receiptArchive(data);archived=true;}catch{/* Booking is committed; archive can be retried independently. */}
  return Response.json({...data,archive_status:archived?"saved":"pending"});
 }catch(e){return safeError(e);}
}
