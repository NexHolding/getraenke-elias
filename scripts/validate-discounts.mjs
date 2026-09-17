import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
for (const file of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql") && !f.includes("015_"))
  .sort())
  await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const owner = crypto.randomUUID(),
  staff = crypto.randomUUID(),
  inactive = crypto.randomUUID(),
  noTill = crypto.randomUUID();
for (const [id, role, permissions, active] of [
  [owner, "owner", [], true],
  [staff, "staff", ["kasse", "artikel"], true],
  [inactive, "staff", ["kasse"], false],
  [noTill, "staff", ["inventur"], true],
]) {
  await q("insert into auth.users values($1,$2)", [id, id + "@example.test"]);
  await q(
    "insert into staff(user_id,role,name,permissions,active) values($1,$2,$3,$4,$5)",
    [id, role, "QA", JSON.stringify(permissions), active],
  );
}
await db.exec(
  await readFile("supabase/migrations/202609170015_discounts.sql", "utf8"),
);
assert.deepEqual(
  (await q("select permissions from staff where user_id=$1", [staff]))[0]
    .permissions,
  ["kasse", "artikel", "rabatt"],
);
assert.equal(
  (await q("select active from staff where user_id=$1", [inactive]))[0].active,
  false,
);
const first = "elias-036-v1",
  second = "elias-036-v2";
await q("update products set stock=100 where id in ($1,$2)", [first, second]);
await q("update products set price_cents=125,tax_rate=7 where id=$1", [second]);
const sale = async (
  actor,
  lines,
  discount = 0,
  returns = [],
  id = crypto.randomUUID(),
) =>
  (
    await q("select save_sale($1,$2,$3,$4,$5,$6) s", [
      id,
      JSON.stringify(lines),
      "cash",
      actor,
      JSON.stringify(returns),
      discount,
    ])
  )[0].s;
const id = crypto.randomUUID();
const lines = [
  {
    id: first,
    quantity: 2,
    discount_percent: 50,
    discount_reason: "Kurzes Mindesthaltbarkeitsdatum",
  },
  { id: second, quantity: 1 },
];
const result = await sale(
  staff,
  lines,
  0,
  [{ deposit_cents: 15, quantity: 3 }],
  id,
);
assert.equal(result.total_cents, 1690); // 890 + 125 + 720 - 45
assert.equal(result.deposit_cents, 675);
assert.equal(result.net_cents, 1432);
assert.equal(result.tax_cents, 258);
assert.equal(
  result.items.find((x) => x.id === first).original_price_cents,
  890,
);
assert.equal(result.items.find((x) => x.id === first).discount_scope, "item");
assert.equal(
  result.items.find((x) => x.id === first).discount_reason,
  "Kurzes Mindesthaltbarkeitsdatum",
);
assert.equal(result.items.find((x) => x.id === second).price_cents, 125);
assert.deepEqual(await sale(staff, lines, 0, [], id), result);
assert.equal(
  (await q("select stock from products where id=$1", [first]))[0].stock,
  98,
);
const cart = await sale(
  staff,
  [
    { id: first, quantity: 2 },
    { id: second, quantity: 3 },
  ],
  10,
);
assert.equal(cart.total_cents, 3141); // 2*801 + 3*113 + 5*240
assert.equal(cart.items[0].discount_scope, "cart");
const free = await sale(
  staff,
  [{ id: first, quantity: 1, discount_percent: 100 }],
  0,
);
assert.equal(free.total_cents, 240);
assert.equal(free.deposit_cents, 240);
const stocks = await q("select id,stock from products order by id");
const count = (await q("select count(*) n from sales"))[0].n;
for (const [actor, ls, rate] of [
  [staff, [{ id: first, quantity: 1, discount_percent: 10 }], 10],
  [staff, [{ id: first, quantity: 1, discount_percent: 101 }], 0],
  [staff, [{ id: first, quantity: 1, discount_percent: -1 }], 0],
  [
    staff,
    [
      {
        id: first,
        quantity: 1,
        discount_percent: 20,
        discount_reason: "forged",
      },
    ],
    0,
  ],
  [inactive, [{ id: first, quantity: 1 }], 0],
  [noTill, [{ id: first, quantity: 1 }], 0],
  [crypto.randomUUID(), [{ id: first, quantity: 1 }], 0],
])
  await assert.rejects(() => sale(actor, ls, rate));
assert.deepEqual(await q("select id,stock from products order by id"), stocks);
assert.equal((await q("select count(*) n from sales"))[0].n, count);
await q(`update staff set permissions='["kasse"]' where user_id=$1`, [staff]);
await assert.rejects(() =>
  sale(staff, [{ id: first, quantity: 1, discount_percent: 50 }], 0),
);
await assert.rejects(() => sale(staff, [{ id: first, quantity: 1 }], 10));
await sale(staff, [{ id: first, quantity: 1 }], 0);
await db.exec(
  `update settings set value=jsonb_set(value,'{live_mode}','true') where id=1`,
);
await assert.rejects(
  () => sale(owner, [{ id: first, quantity: 1 }], 10),
  /TSE adapter required/,
);
console.log(
  "PASS discounts: existing rights granted, other permissions preserved, mixed VAT, returns, 100%, cart discount, reasons, stored original prices, idempotency, permission revocation, rollback, TSE guard",
);
await db.close();
