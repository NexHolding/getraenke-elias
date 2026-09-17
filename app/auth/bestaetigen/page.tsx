import { Logo } from "@/components/site-shell";
import Link from "next/link";
import { confirmationTypes } from "@/lib/auth-email";
export const metadata = {
  title: "E-Mail bestätigen | Getränke Elias",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";
  const valid =
    /^[a-zA-Z0-9_-]{20,512}$/.test(token) &&
    confirmationTypes.some((t) => t === type);
  const recovery = type === "recovery";
  return (
    <main className="login-page">
      <div className="login-card">
        <Logo />
        <h1>
          {recovery ? "Neues Passwort anfordern." : "Deine E-Mail bestätigen."}
        </h1>
        {valid ? (
          <>
            <p>
              {recovery
                ? "Bestätige den Link. Anschließend kannst du dein neues Passwort eingeben."
                : "Mit deiner Bestätigung schaltest du deinen persönlichen Zugang frei."}
            </p>
            <form action="/auth/callback" method="post" className="form-grid">
              <input type="hidden" name="token_hash" value={token} />
              <input type="hidden" name="type" value={type} />
              <button className="button">
                {recovery ? "Link bestätigen" : "E-Mail bestätigen"}
              </button>
            </form>
          </>
        ) : (
          <p role="alert" className="notice danger">
            Dieser Link ist unvollständig. Bitte fordere eine neue E-Mail an.
          </p>
        )}
        <Link
          className="text-link"
          href={recovery ? "/passwort-vergessen" : "/konto"}
        >
          {recovery ? "Neuen Link anfordern" : "Zum Kundenkonto"}
        </Link>
      </div>
    </main>
  );
}
