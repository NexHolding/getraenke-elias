import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authEmailMessages,
  confirmationDestination,
  type AuthEmailPayload,
} from "../lib/auth-email";
import { Webhook } from "standardwebhooks";
const payload: AuthEmailPayload = {
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "kunde@example.test",
  },
  email_data: {
    email_action_type: "signup",
    token_hash: "test-secret-confirmation-token",
    token: "123456",
  },
};
test("signup and recovery emails contain access link, archive never exposes reusable tokens", () => {
  for (const type of ["signup", "recovery", "invite", "magiclink"]) {
    const [m] = authEmailMessages(
      {
        ...payload,
        email_data: { ...payload.email_data, email_action_type: type },
      },
      "https://getraenke-elias.vercel.app",
    );
    assert.match(
      m.body,
      /https:\/\/getraenke-elias.vercel.app\/auth\/bestaetigen/,
    );
    assert.ok(m.body.includes(payload.email_data.token_hash!));
    assert.ok(!m.archiveBody.includes(payload.email_data.token_hash!));
    assert.ok(!m.archiveBody.includes("123456"));
    assert.ok(m.body.includes(payload.user.email));
  }
  assert.equal(confirmationDestination("recovery"), "/passwort?bestaetigt=1");
  assert.equal(confirmationDestination("invite"), "/passwort?bestaetigt=1");
  assert.equal(confirmationDestination("signup"), "/konto?bestaetigt=1");
});
test("secure email change sends correct reversed token hashes to old and new address", () => {
  const messages = authEmailMessages(
    {
      ...payload,
      user: { ...payload.user, new_email: "neu@example.test" },
      email_data: {
        email_action_type: "email_change",
        token_hash: "new-address-secret",
        token_hash_new: "old-address-secret",
      },
    },
    "https://getraenke-elias.vercel.app",
  );
  assert.equal(messages.length, 2);
  assert.equal(messages[0].recipient, "kunde@example.test");
  assert.ok(messages[0].body.includes("old-address-secret"));
  assert.equal(messages[1].recipient, "neu@example.test");
  assert.ok(messages[1].body.includes("new-address-secret"));
  assert.throws(() =>
    authEmailMessages(
      { ...payload, email_data: { email_action_type: "signup" } },
      "https://getraenke-elias.vercel.app",
    ),
  );
});
test("signed auth hooks reject tampering and old replays", () => {
  const secret = "whsec_" + Buffer.alloc(32, 7).toString("base64"),
    wh = new Webhook(secret);
  const now = new Date(),
    body = JSON.stringify(payload),
    id = "hook-123";
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(+now / 1000)),
    "webhook-signature": wh.sign(id, now, body),
  };
  assert.deepEqual(wh.verify(body, headers), payload);
  assert.throws(() => wh.verify(body + " ", headers));
  const old = new Date(Date.now() - 3600000);
  assert.throws(() =>
    wh.verify(body, {
      ...headers,
      "webhook-timestamp": String(Math.floor(+old / 1000)),
      "webhook-signature": wh.sign(id, old, body),
    }),
  );
});
