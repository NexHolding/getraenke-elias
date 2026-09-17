import {cookies} from "next/headers";
import {tokenHash} from "@/lib/terminal";
import {serviceDb} from "@/lib/server";
import { userDb, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  sameOrigin(req);
  const db = await userDb();
  await db.auth.signOut();
  const jar=await cookies();const token=jar.get("elias-operator")?.value;if(token)await serviceDb().from("terminal_sessions").delete().eq("token_hash",tokenHash(token));jar.delete("elias-operator");
  return Response.json({ ok: true });
}
