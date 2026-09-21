import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { provisionCustomer } from "../lib/customer-provision.ts";
const db = new PGlite();
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const q = async (sql, values = []) => (await db.query(sql, values)).rows;
  const client = {
    from(table) {
      assert.equal(table, "customers");
      let insert, filter;
      return {
        select() {
          return this;
        },
        eq(key, value) {
          assert.equal(key, "user_id");
          filter = value;
          return this;
        },
        insert(value) {
          insert = value;
          return this;
        },
        async maybeSingle() {
          return {
            data:
              (
                await q("select * from customers where user_id=$1", [filter])
              )[0] || null,
            error: null,
          };
        },
        async single() {
          try {
            return {
              data: (
                await q(
                  "insert into customers(user_id,email,name) values($1,$2,$3) returning *",
                  [insert.user_id, insert.email, insert.name],
                )
              )[0],
              error: null,
            };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
    },
  };
  const newUser = async (email) => {
    const id = crypto.randomUUID();
    await q("insert into auth.users values($1,$2)", [id, email]);
    return {
      id,
      email,
      email_confirmed_at: new Date().toISOString(),
      user_metadata: { name: "New Online Customer" },
    };
  };
  const user = await newUser("new@example.test");
  // Orphan correspondence must not be attached through an unverified address.
  await q(
    "insert into customer_communications(source_key,kind,recipient,subject,body) values('orphan','invoice_document',$1,'Private archive','Secret')",
    [user.email],
  );
  await q(
    "insert into customer_communications(source_key,kind,auth_user_id,recipient,subject,body) values('own','auth_signup',$1,$2,'Own access','Safe')",
    [user.id, user.email],
  );
  const [a, b] = await Promise.all([
    provisionCustomer(client, user),
    provisionCustomer(client, user),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.user_id, user.id);
  assert.equal(
    (
      await q("select count(*)::int n from customers where user_id=$1", [
        user.id,
      ])
    )[0].n,
    1,
  );
  assert.equal(
    (
      await q(
        "select customer_id from customer_communications where source_key='orphan'",
      )
    )[0].customer_id,
    null,
  );
  assert.equal(
    (
      await q(
        "select customer_id from customer_communications where source_key='own'",
      )
    )[0].customer_id,
    a.id,
  );
  const oldEmail = "old@example.test";
  const old = (
    await q(
      "insert into customers(name,email,address) values('Private old customer',$1,'Private address') returning *",
      [oldEmail],
    )
  )[0];
  const impostor = await newUser(oldEmail);
  await assert.rejects(() => provisionCustomer(client, impostor), /Zuordnung/);
  assert.equal(
    (await q("select user_id from customers where id=$1", [old.id]))[0].user_id,
    null,
  );
  // Explicitly linked accounts remain accessible; changing metadata cannot claim another account.
  assert.equal(
    (await provisionCustomer(client, { ...user, email: oldEmail })).id,
    a.id,
  );
  await assert.rejects(
    () =>
      provisionCustomer(client, { ...impostor, email_confirmed_at: undefined }),
    /UNAUTHORIZED/,
  );
  await assert.rejects(
    () =>
      provisionCustomer(client, {
        ...impostor,
        email: "global_admin@getraenke-elias.local",
      }),
    /FORBIDDEN/,
  );
  await db.exec("set role anon");
  await assert.rejects(() => q("select * from customers"), /permission denied/);
  await db.exec("reset role");
  console.log(
    "PASS account provisioning: new customer and parallel first load; existing unlinked records cannot be claimed by email; explicit links preserved; orphan correspondence isolated; unconfirmed/system accounts denied; anonymous customer data denied.",
  );
} finally {
  await db.close();
}
