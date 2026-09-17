import { z } from "zod";
export const authEmailSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    new_email: z.string().optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  email_data: z.object({
    email_action_type: z.string().max(80),
    token: z.string().optional(),
    token_hash: z.string().optional(),
    token_new: z.string().optional(),
    token_hash_new: z.string().optional(),
    old_email: z.string().optional(),
  }),
});
export type AuthEmailPayload = z.infer<typeof authEmailSchema>;
const actions: Record<
  string,
  { subject: string; intro: string; label?: string }
> = {
  signup: {
    subject: "Bestätige dein Elias-Kundenkonto",
    intro:
      "Willkommen bei Getränke Elias! Du hast dein Passwort bei der Registrierung selbst gewählt. Bitte bestätige jetzt deine E-Mail-Adresse, um dein Konto freizuschalten.",
    label: "E-Mail-Adresse bestätigen",
  },
  recovery: {
    subject: "Dein neues Passwort bei Getränke Elias",
    intro:
      "Du hast einen Link zum Zurücksetzen deines Passworts angefordert. Bestätige die Anfrage über den folgenden Link und wähle anschließend ein neues Passwort.",
    label: "Neues Passwort festlegen",
  },
  invite: {
    subject: "Dein Zugang zu Getränke Elias",
    intro:
      "Dein Kundenkonto bei Getränke Elias ist vorbereitet. Bestätige deine E-Mail-Adresse und lege dein eigenes Passwort fest.",
    label: "Kundenkonto aktivieren",
  },
  magiclink: {
    subject: "Dein Anmeldelink bei Getränke Elias",
    intro:
      "Über diesen Link kannst du dich sicher bei Getränke Elias anmelden.",
    label: "Bei Elias anmelden",
  },
  email_change: {
    subject: "E-Mail-Adresse bei Getränke Elias bestätigen",
    intro:
      "Für dein Elias-Konto wurde eine Änderung der E-Mail-Adresse angefordert. Bitte bestätige diese Änderung.",
    label: "E-Mail-Änderung bestätigen",
  },
  reauthentication: {
    subject: "Sicherheitsbestätigung für dein Elias-Konto",
    intro:
      "Für eine geschützte Änderung an deinem Konto wurde ein Bestätigungscode angefordert.",
  },
  password_changed_notification: {
    subject: "Dein Elias-Passwort wurde geändert",
    intro:
      "Das Passwort für dein Elias-Konto wurde geändert. Falls du das nicht selbst warst, setze dein Passwort bitte umgehend über die Website zurück und kontaktiere uns.",
  },
  email_changed_notification: {
    subject: "Deine Elias-E-Mail-Adresse wurde geändert",
    intro:
      "Die E-Mail-Adresse für dein Elias-Konto wurde geändert. Falls du das nicht selbst warst, kontaktiere uns bitte umgehend.",
  },
};
export function authEmailMessages(payload: AuthEmailPayload, siteUrl: string) {
  const { user, email_data: d } = payload;
  const action = actions[d.email_action_type];
  if (!action) throw new Error("Unsupported auth email action");
  const origin = new URL(siteUrl).origin;
  const recipients =
    d.email_action_type === "email_change"
      ? [
          ...(d.token_hash_new
            ? [{ email: user.email, hash: d.token_hash_new, token: d.token }]
            : []),
          {
            email: z.email().parse(user.new_email),
            hash: d.token_hash,
            token: d.token_new || d.token,
          },
        ]
      : [
          {
            email:
              d.email_action_type === "email_changed_notification" &&
              d.old_email
                ? z.email().parse(d.old_email)
                : user.email,
            hash: d.token_hash,
            token: d.token,
          },
        ];
  return recipients.map((r) => {
    const prefix = `${action.intro}\n\nDein Zugang: ${user.email}\nKundenkonto: ${origin}/konto\n\n`;
    let secret = "",
      archived = "";
    if (action.label) {
      if (!r.hash) throw new Error("Missing authentication token");
      const url = new URL("/auth/bestaetigen", origin);
      url.searchParams.set("token_hash", r.hash);
      url.searchParams.set(
        "type",
        d.email_action_type === "magiclink" ? "magiclink" : d.email_action_type,
      );
      secret = `${action.label}: ${url}\n\n`;
      archived = `${action.label}: [Persönlicher Sicherheitslink – nur in der E-Mail verfügbar]\n\n`;
    } else if (d.email_action_type === "reauthentication") {
      if (!r.token) throw new Error("Missing authentication code");
      secret = `Dein Bestätigungscode: ${r.token}\n\n`;
      archived =
        "Dein Bestätigungscode: [Aus Sicherheitsgründen nicht archiviert]\n\n";
    }
    const footer =
      (action.label || d.email_action_type === "reauthentication"
        ? "Der Link bzw. Code ist zeitlich begrenzt und nur einmal verwendbar. Wenn du diese Anfrage nicht gestellt hast, ignoriere diese Nachricht.\n\n"
        : "") +
      "Dein Getränkeshop Elias\nWartbergstraße 3 · 74076 Heilbronn\n07131 / 797 52 25";
    return {
      recipient: r.email,
      subject: action.subject,
      body: prefix + secret + footer,
      archiveBody: prefix + archived + footer,
    };
  });
}
export const confirmationTypes = [
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
  "email",
] as const;
export function confirmationDestination(type: string) {
  return ["recovery", "invite"].includes(type)
    ? "/passwort?bestaetigt=1"
    : "/konto?bestaetigt=1";
}
