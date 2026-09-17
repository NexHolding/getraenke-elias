import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVisibleBusinessAccount,
  SYSTEM_ACCOUNT_EMAIL,
} from "../lib/account-visibility";
import { resolveLoginEmail } from "../lib/login-identity";

test("system identity stays usable for login but is excluded from business directories", () => {
  const ids = new Set(["system-id"]);
  const rows = [
    { user_id: "system-id", email: "changed-customer@example.test" },
    { user_id: null, email: " GLOBAL_ADMIN@getraenke-elias.local " },
    { user_id: "owner-id", email: "info@getraenke-elias.de" },
    { user_id: "customer-id", email: "global_admin@example.test" },
  ];
  assert.deepEqual(
    rows.filter((row) => isVisibleBusinessAccount(row, ids)),
    rows.slice(2),
  );
  assert.equal(resolveLoginEmail(" GLOBAL_ADMIN "), SYSTEM_ACCOUNT_EMAIL);
  assert.equal(
    resolveLoginEmail("info@getraenke-elias.de"),
    "info@getraenke-elias.de",
  );
});
