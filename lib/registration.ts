import { z } from "zod";
import { deliveryAddressShape } from "./delivery-address";

export const registrationProfileSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(3).max(80),
  ...deliveryAddressShape,
});

type RegistrationError = { code?: string; status?: number; message?: string };

// Do not expose raw provider responses, account existence or email addresses.
export function registrationErrorMessage(error: RegistrationError) {
  if (
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      error.code || "",
    ) ||
    error.status === 429
  )
    return "Zu viele Anfragen. Bitte warte einige Minuten und versuche die Registrierung erneut.";
  if (error.code === "weak_password")
    return "Bitte wähle ein stärkeres Passwort mit mindestens zwölf Zeichen.";
  if (error.code === "email_address_invalid")
    return "Bitte prüfe die eingegebene E-Mail-Adresse.";
  if (
    [
      "email_address_not_authorized",
      "hook_timeout",
      "hook_timeout_after_retry",
      "hook_payload_invalid_content_type",
      "hook_payload_over_size_limit",
      "hook_payload_invalid",
      "unexpected_failure",
    ].includes(error.code || "") ||
    /due to hook|sending confirmation email/i.test(error.message || "")
  )
    return "Die E-Mail-Bestätigung ist momentan nicht verfügbar. Bitte kontaktiere Getränke Elias unter 07131 / 797 52 25. Deine Registrierung konnte noch nicht abgeschlossen werden.";
  if (error.code === "signup_disabled")
    return "Neue Online-Konten können momentan nicht angelegt werden. Bitte kontaktiere Getränke Elias unter 07131 / 797 52 25.";
  return "Die Registrierung konnte nicht abgeschlossen werden. Bitte versuche es später erneut oder nutze die Anmeldung, falls du bereits ein Konto hast.";
}
