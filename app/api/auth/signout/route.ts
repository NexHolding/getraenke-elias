import { userDb, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  sameOrigin(req);
  const db = await userDb();
  await db.auth.signOut();
  return Response.json({ ok: true });
}
