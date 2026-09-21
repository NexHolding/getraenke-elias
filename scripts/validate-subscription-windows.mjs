import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const q = async (s, a = []) =>
    JSON.parse(JSON.stringify((await db.query(s, a)).rows));
  const owner = crypto.randomUUID(),
    user = crypto.randomUUID(),
    other = crypto.randomUUID(),
    cid = crypto.randomUUID();
  for (const id of [owner, user, other])
    await q("insert into auth.users values($1,$2)", [id, id + "@example.test"]);
  await q("insert into staff(user_id,name,role)values($1,'Owner','owner')", [
    owner,
  ]);
  await q(
    "insert into customers(id,user_id,name,email,phone,address,street,house_number,postal_code,city)values($1,$2,'Test','test@example.test','01234','Test 1, 74076 Heilbronn','Test','1','74076','Heilbronn')",
    [cid, user],
  );
  const tomorrow = (
    await q("select ((now() at time zone 'Europe/Berlin')::date+1)::text d")
  )[0].d;
  const windows = [{ day: 2, from: "12:00", to: "16:00" }];
  const draft = {
    id: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    revision: null,
    customer_id: cid,
    interval: "weekly",
    next_date: tomorrow,
    active: true,
    notes: "",
    items: [{ id: "elias-036-v1", quantity: 4 }],
  };
  const save = (v, actor = user, isCustomer = true) =>
    q("select save_delivery_subscription($1,$2,$3)v", [v, actor, isCustomer]);
  await assert.rejects(() => save(draft), /Lieferzeiten/);
  await assert.rejects(
    () => save({ ...draft, delivery_windows: windows }, other),
    /FORBIDDEN/,
  );
  await assert.rejects(
    () =>
      save({
        ...draft,
        delivery_windows: [{ day: 2, from: "16:00", to: "12:00" }],
      }),
    /Lieferzeiten/,
  );
  assert.deepEqual(
    (await q("select windows from customers where id=$1", [cid]))[0].windows,
    [],
  );
  await assert.rejects(
    () =>
      save({
        ...draft,
        delivery_windows: windows,
        items: [{ id: "missing", quantity: 4 }],
      }),
    /verfügbar/,
  );
  assert.deepEqual(
    (await q("select windows from customers where id=$1", [cid]))[0].windows,
    [],
    "window write rolled back with invalid subscription",
  );
  const command = { ...draft, delivery_windows: windows };
  const saved = (await save(command))[0].v;
  assert.deepEqual(
    (await q("select windows from customers where id=$1", [cid]))[0].windows,
    windows,
  );
  assert.deepEqual((await save(command))[0].v, saved);
  const edited = (
    await save({
      ...command,
      request_id: crypto.randomUUID(),
      revision: saved.revision,
      delivery_windows: [{ day: 3, from: "10:00", to: "11:00" }],
    })
  )[0].v;
  assert.deepEqual(
    (await q("select windows from customers where id=$1", [cid]))[0].windows,
    windows,
    "existing profile times are not overwritten by a stale form",
  );
  saved.revision = edited.revision;
  await q("update customers set windows='[]' where id=$1", [cid]);
  await save({
    ...draft,
    request_id: crypto.randomUUID(),
    revision: saved.revision,
    active: false,
  });
  const staffDraft = {
    request_id: crypto.randomUUID(),
    customer_id: cid,
    delivery_date: tomorrow,
    interval: "weekly",
    items: draft.items,
    notes: "",
  };
  await assert.rejects(
    () => q("select create_staff_order($1,$2)", [staffDraft, owner]),
    /Lieferzeiten/,
  );
  const created = (
    await q("select create_staff_order($1,$2)v", [
      { ...staffDraft, delivery_windows: windows },
      owner,
    ])
  )[0].v;
  assert.deepEqual(
    (
      await q("select preference_snapshot from orders where id=$1", [
        created.id,
      ])
    )[0].preference_snapshot.windows,
    windows,
  );
  await q("update customers set windows='[]' where id=$1", [cid]);
  const s = (
    await q("select * from subscriptions where id=$1", [
      created.subscription_id,
    ])
  )[0];
  await assert.rejects(
    () =>
      q("select save_staff_subscription($1,$2)", [
        { ...s, next_date: s.next_date.slice(0, 10) },
        owner,
      ]),
    /Lieferzeiten/,
  );
  await q("select save_staff_subscription($1,$2)", [
    { ...s, next_date: s.next_date.slice(0, 10), delivery_windows: windows },
    owner,
  ]);
  assert.deepEqual(
    (await q("select windows from customers where id=$1", [cid]))[0].windows,
    windows,
  );
  for (const role of ["anon", "authenticated", "service_role"])
    assert.equal(
      (
        await q(
          "select has_function_privilege($1,'ensure_subscription_windows(uuid,jsonb)','EXECUTE')v",
          [role],
        )
      )[0].v,
      false,
    );
  console.log(
    "PASS missing windows required for customer/staff/legacy editors; ownership; invalid times; atomic rollback; profile and first-order snapshot; replay; pause without windows; private helper.",
  );
} finally {
  await db.close();
}
