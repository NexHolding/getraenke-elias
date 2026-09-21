import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { fillCustomerDeliveryDefaults } from "../lib/customer-delivery-defaults.ts";
import { customerSchema } from "../lib/operations-validation.ts";
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
  let beforeUpdate = null;
  const client = {
    from(table) {
      assert.ok(["customers", "customer_account_deletions"].includes(table));
      let insert, update;
      const filters = [];
      return {
        select() {
          return this;
        },
        eq(key, value) {
          filters.push([key, value]);
          return this;
        },
        insert(value) {
          insert = value;
          return this;
        },
        update(value) {
          update = value;
          return this;
        },
        async maybeSingle() {
          return this.single();
        },
        async single() {
          try {
            let rows;
            if (insert) {
              const keys = Object.keys(insert);
              rows = await q(
                `insert into customers(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
                Object.values(insert),
              );
            } else if (update) {
              if (beforeUpdate) {
                const hook = beforeUpdate;
                beforeUpdate = null;
                await hook();
              }
              const keys = Object.keys(update);
              rows = await q(
                `update customers set ${keys.map((k, i) => k + "=$" + (i + 1)).join(",")} where ${filters.map(([k], i) => k + "=$" + (keys.length + i + 1)).join(" and ")} returning *`,
                [...Object.values(update), ...filters.map(([, v]) => v)],
              );
            } else {
              rows = await q(
                `select * from ${table} where ${filters.map(([k], i) => k + "=$" + (i + 1)).join(" and ")}`,
                filters.map(([, v]) => v),
              );
            }
            return { data: rows[0] || null, error: null };
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
  const address = {
    street: "Teststraße",
    house_number: "12 a",
    postal_code: "01234",
    city: "Musterstadt",
    phone: "0123456789",
  };
  const signup = await newUser("address@example.test");
  signup.user_metadata = {
    ...signup.user_metadata,
    ...address,
    payment_method: "invoice",
    user_id: impostor.id,
    address: "Forged combined address",
  };
  const initial = await provisionCustomer(client, signup);
  assert.equal(initial.address, "Teststraße 12 a, 01234 Musterstadt");
  for (const [key, value] of Object.entries(address))
    assert.equal(initial[key], value);
  assert.equal(initial.payment_method, "cash");
  assert.equal(initial.user_id, signup.id);
  const command = {
    id: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    revision: null,
    customer_id: initial.id,
    items: [{ id: "elias-036-v1", quantity: 4 }],
    interval: "weekly",
    next_date: "2099-01-01",
    delivery_windows: [{ day: 1, from: "10:00", to: "18:00" }],
    active: true,
    notes: "",
  };
  const subscription = (
    await q("select save_delivery_subscription($1::jsonb,$2,true) result", [
      JSON.stringify(command),
      signup.id,
    ])
  )[0].result;
  assert.equal(subscription.customer_id, initial.id);
  assert.equal(subscription.active, true);
  // A saved profile edit wins over registration metadata, even on the next login.
  const edited = customerSchema.parse({
    ...initial,
    street: "Neue Straße",
    house_number: "7",
    postal_code: "74076",
    city: "Heilbronn",
  });
  await q(
    "update customers set street=$1,house_number=$2,postal_code=$3,city=$4,address=$5 where id=$6",
    [
      edited.street,
      edited.house_number,
      edited.postal_code,
      edited.city,
      edited.address,
      initial.id,
    ],
  );
  assert.equal(
    (await provisionCustomer(client, signup)).address,
    edited.address,
  );
  assert.equal(
    (await q("select (order_customer($1)).address address", [initial.id]))[0]
      .address,
    edited.address,
  );
  // Previously empty profiles recover their own signup data, without email matching.
  const healed = await provisionCustomer(client, {
    ...user,
    user_metadata: address,
  });
  assert.equal(healed.address, initial.address);
  // Authenticated checkout fills missing details, without overwriting a saved address.
  const checkout = await newUser("checkout@example.test");
  const empty = await provisionCustomer(client, checkout);
  const populated = await fillCustomerDeliveryDefaults(
    client,
    empty,
    checkout.id,
    address,
  );
  assert.equal(populated.address, initial.address);
  assert.equal(
    (
      await fillCustomerDeliveryDefaults(client, populated, checkout.id, {
        ...address,
        street: "Gift address",
      })
    ).address,
    initial.address,
  );
  await assert.rejects(
    () => fillCustomerDeliveryDefaults(client, empty, impostor.id, address),
    /FORBIDDEN/,
  );
  // An edit arriving between read and update must not be replaced by defaults.
  const race = await newUser("race@example.test");
  const raceEmpty = await provisionCustomer(client, race);
  beforeUpdate = () =>
    q(
      "update customers set address=$1,street=$2,house_number=$3,postal_code=$4,city=$5,phone=$6 where id=$7",
      [
        edited.address,
        edited.street,
        edited.house_number,
        edited.postal_code,
        edited.city,
        "071311111",
        raceEmpty.id,
      ],
    );
  assert.equal(
    (await fillCustomerDeliveryDefaults(client, raceEmpty, race.id, address))
      .address,
    edited.address,
  );
  // Single-line legacy data must also persist its structured fields for the SQL subscription check.
  const legacy = await newUser("legacy@example.test");
  const legacyEmpty = await provisionCustomer(client, legacy);
  await q("update customers set address=$1,phone=$2 where id=$3", [
    initial.address,
    address.phone,
    legacyEmpty.id,
  ]);
  assert.equal((await provisionCustomer(client, legacy)).postal_code, "01234");
  console.log(
    "PASS delivery defaults: signup → profile → actual subscription RPC; profile edits preserved; legacy data normalized; authenticated checkout fills blanks; cross-user writes blocked; concurrent profile edit preserved.",
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
