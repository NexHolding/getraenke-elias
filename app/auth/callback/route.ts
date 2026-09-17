import { userDb, sameOrigin } from "@/lib/server";
import { NextResponse } from "next/server";
import { confirmationTypes, confirmationDestination } from "@/lib/auth-email";
import type { EmailOtpType } from "@supabase/supabase-js";
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const token = u.searchParams.get("token_hash");
  if (token) {
    const next = new URL("/auth/bestaetigen", u.origin);
    next.searchParams.set("token_hash", token);
    next.searchParams.set("type", u.searchParams.get("type") || "email");
    return NextResponse.redirect(next);
  }
  if (code) {
    const { error } = await (await userDb()).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          u.searchParams.get("next") === "/passwort"
            ? "/passwort?bestaetigt=1"
            : "/konto?bestaetigt=1",
          u.origin,
        ),
      );
  }
  return NextResponse.redirect(new URL("/konto?error=confirmation", u.origin));
}
export async function POST(req: Request) {
  const u = new URL(req.url);
  try {
    // no-referrer confirmation pages may submit Origin: null in browsers.
    // Fetch Metadata still proves that this form originated on our own site.
    if (req.headers.get("origin") === "null") {
      if (req.headers.get("sec-fetch-site") !== "same-origin")
        throw new Error("FORBIDDEN");
    } else sameOrigin(req);
    const form = await req.formData();
    const type = String(form.get("type"));
    const token = String(form.get("token_hash"));
    if (
      !confirmationTypes.some((t) => t === type) ||
      !/^[a-zA-Z0-9_-]{20,512}$/.test(token)
    )
      throw new Error("Invalid link");
    const { error } = await (
      await userDb()
    ).auth.verifyOtp({ type: type as EmailOtpType, token_hash: token });
    if (error) throw error;
    const response = NextResponse.redirect(
      new URL(confirmationDestination(type), u.origin),
      303,
    );
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.warn(
      "Auth confirmation failed",
      error instanceof Error ? error.message : "invalid request",
    );
    return NextResponse.redirect(
      new URL("/konto?error=confirmation", u.origin),
      303,
    );
  }
}
