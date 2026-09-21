import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationErrorMessage } from "../lib/registration";
test("registration translates actual hook failure and rate limiting without exposing raw provider details", () => {
  assert.match(
    registrationErrorMessage({
      status: 500,
      message: "Service currently unavailable due to hook",
    }),
    /E-Mail-Bestätigung ist momentan nicht verfügbar/,
  );
  assert.match(
    registrationErrorMessage({ code: "email_address_not_authorized" }),
    /E-Mail-Bestätigung/,
  );
  assert.match(registrationErrorMessage({ status: 429 }), /Zu viele Anfragen/);
  assert.match(
    registrationErrorMessage({ code: "weak_password" }),
    /stärkeres Passwort/,
  );
  assert.equal(
    registrationErrorMessage({
      code: "user_already_exists",
      message: "private@example.test",
    }).includes("private@example.test"),
    false,
  );
});
