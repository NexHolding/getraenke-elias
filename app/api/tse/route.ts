import { requireStaff,sameOrigin,safeError } from "@/lib/server";
import { checkFiskaly } from "@/lib/fiskaly";
export async function POST(req:Request) {
 try {sameOrigin(req);const staff=await requireStaff("einstellungen");if(staff.role!=="owner")throw Error("FORBIDDEN");return Response.json(await checkFiskaly(),{headers:{"Cache-Control":"no-store"}});}catch(e){return safeError(e);}
}
