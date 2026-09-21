import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  await db.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/crm/:path*",
    "/api/admin",
    "/api/finance",
    "/api/receipts/:path*",
    "/api/inventory/:path*",
    "/api/auth/:path*",
    "/passwort",
    "/konto/:path*",
    "/api/customer/:path*",
    "/api/communications/:path*",
    "/api/operations",
    "/api/terminal",
    "/api/upload",
    "/api/documents/:path*",
    "/auth/:path*",
  ],
};
