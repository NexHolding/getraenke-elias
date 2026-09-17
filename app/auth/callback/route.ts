import { userDb } from "@/lib/server";
import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const u = new URL(req.url);
  const db = await userDb();
  const code = u.searchParams.get("code");
  const token = u.searchParams.get("token_hash");
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/konto", u.origin));
  }
  if (token) {
    const { error } = await db.auth.verifyOtp({
      token_hash: token,
      type: "email",
    });
    if (!error) return NextResponse.redirect(new URL("/konto", u.origin));
  }
  return NextResponse.redirect(new URL("/konto?error=confirmation", u.origin));
}
