import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const q = async (s, v = []) => (await db.query(s, v)).rows;
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const owner = crypto.randomUUID(),
    employee = crypto.randomUUID(),
    outsider = crypto.randomUUID();
  await q("insert into auth.users values($1,$2),($3,$4),($5,$6)", [
    owner,
    "qa-owner@example.test",
    employee,
    "qa-employee@example.test",
    outsider,
    "qa-outsider@example.test",
  ]);
  await q(
    `insert into staff(user_id,role,name,permissions) values($1,'owner','Inhaber','[]'),($2,'staff','Zählteam','["inventur"]'),($3,'staff','Kasse','["kasse"]')`,
    [owner, employee, outsider],
  );
  const pid = "elias-036-v1",
    pid2 = "elias-036-v2";
  await q("update products set active=(id=$1 or id=$2)", [pid, pid2]);
  const day = (
    await q("select to_char(now() at time zone 'Europe/Berlin','YYYY-MM-DD') d")
  )[0].d;
  const cmd = async (action, value, actor = owner) =>
    (
      await q("select inventory_command($1,$2,$3) r", [
        action,
        JSON.stringify(value),
        actor,
      ])
    )[0].r;
  const stock = async (id = pid) =>
    (await q("select * from products where id=$1", [id]))[0];
  const run = async (id) =>
    (await q("select * from inventory_runs where id=$1", [id]))[0];
  const lines = async (id) =>
    await q(
      "select * from inventory_lines where run_id=$1 order by product_id",
      [id],
    );
  const start = () =>
    cmd("start", {
      run_id: crypto.randomUUID(),
      title: "Kontrollinventur",
      location: "Heilbronn",
      inventory_date: day,
    });
  const count = async (r, id, packs, cost = 800, actor = employee) => {
    const l = (await lines(r.id)).find((l) => l.product_id === id),
      p = await stock(id);
    return cmd(
      "count",
      {
        run_id: r.id,
        line_id: l.id,
        revision: l.revision,
        stock_version: p.stock_version,
        packs,
        loose: 0,
        cost_net_cents: cost,
        reason: "count_error",
        note: "Erneut geprüft",
      },
      actor,
    );
  };
  const transition = async (r, action, extra = {}, actor = owner) =>
    cmd(
      action,
      { run_id: r.id, revision: (await run(r.id)).revision, ...extra },
      actor,
    );
  await assert.rejects(
    () => cmd("start", { run_id: crypto.randomUUID() }, outsider),
    /FORBIDDEN/,
  );
  let r = await start();
  assert.equal((await lines(r.id)).length, 2);
  await assert.rejects(() => start(), /offene Inventur/);
  await assert.rejects(() => transition(r, "submit"), /alle Positionen/);
  await count(r, pid, 10, null);
  await count(r, pid2, 0);
  await transition(r, "submit", {}, employee);
  await assert.rejects(
    () =>
      transition(r, "apply", { confirmation: "BESTAND ÜBERNEHMEN" }, employee),
    /FORBIDDEN/,
  );
  await assert.rejects(() => transition(r, "apply"), /ausdrücklich/);
  await assert.rejects(
    () => transition(r, "apply", { confirmation: "BESTAND ÜBERNEHMEN" }),
    /Einkaufswert/,
  );
  await transition(r, "reopen");
  await count(r, pid, 10);
  const newId = crypto.randomUUID();
  const added = await cmd(
    "add",
    {
      run_id: r.id,
      id: newId,
      name: "Inventurfund Test",
      category: "Saft",
      pack_count: 6,
      volume_ml: 330,
      barcode: "QA-UNIQUE-001",
    },
    employee,
  );
  assert.equal((await stock(added.product_id)).active, false);
  await count(r, added.product_id, 1);
  // Sale against unknown stock invalidates the first count instead of inventing an opening balance.
  await q("select save_sale($1,$2,$3,$4,$5,$6)", [
    crypto.randomUUID(),
    JSON.stringify([{ id: pid, quantity: 1 }]),
    "cash",
    owner,
    "[]",
    0,
  ]);
  await transition(r, "submit");
  await assert.rejects(
    () => transition(r, "apply", { confirmation: "BESTAND ÜBERNEHMEN" }),
    /erneut zählen/,
  );
  assert.equal((await stock()).stock, null); // apply rolled back all earlier line updates
  await transition(r, "reopen");
  await count(r, pid, 10);
  await transition(r, "submit");
  await transition(r, "apply", { confirmation: "BESTAND ÜBERNEHMEN" });
  assert.equal((await stock()).stock, 10);
  assert.equal((await stock(added.product_id)).stock, 1);
  await transition(r, "apply", { confirmation: "BESTAND ÜBERNEHMEN" });
  assert.equal((await stock()).stock, 10);
  await assert.rejects(
    () =>
      q("update inventory_lines set counted_units=5 where run_id=$1", [r.id]),
    /immutable/,
  );
  await assert.rejects(
    () => q("delete from inventory_events where run_id=$1", [r.id]),
    /immutable/,
  );
  await assert.rejects(
    () => q("update inventory_runs set title=$1 where id=$2", ["Wrong", r.id]),
    /immutable/,
  );
  console.log(
    "PASS first inventory, all articles, owner confirmation, valuation, employee rights, new article, intervening unknown-stock sale, atomic rollback, immutability",
  );
  // A known stock movement after counting must not be overwritten on apply.
  r = await start();
  for (const l of await lines(r.id))
    await count(
      r,
      l.product_id,
      l.product_id === pid ? 8 : l.product_id === pid2 ? 0 : 1,
    );
  const staleLine = (await lines(r.id)).find((l) => l.product_id === pid),
    staleProduct = await stock();
  await q("select save_sale($1,$2,$3,$4,$5,$6)", [
    crypto.randomUUID(),
    JSON.stringify([{ id: pid, quantity: 1 }]),
    "cash",
    owner,
    "[]",
    0,
  ]);
  await assert.rejects(
    () =>
      cmd("count", {
        run_id: r.id,
        line_id: staleLine.id,
        revision: staleLine.revision,
        stock_version: staleProduct.stock_version,
        packs: 8,
        loose: 0,
        cost_net_cents: 800,
        reason: "loss",
        note: "",
      }),
    /während der Zählung/,
  );
  await assert.rejects(
    () => q("select reset_setup($1)", [owner]),
    /Offene Inventur/,
  );
  await transition(r, "submit");
  await transition(r, "apply", { confirmation: "BESTAND ÜBERNEHMEN" });
  assert.equal((await stock()).stock, 7);
  const final = (await lines(r.id)).find((l) => l.product_id === pid);
  assert.equal(final.movement_since_count, -(await stock()).pack_count);
  assert.equal(final.applied_units, 7 * (await stock()).pack_count);
  // Setup reset restores only movements newer than the accepted physical count.
  await q("select reset_setup($1)", [owner]);
  assert.equal((await stock()).stock, 8);
  assert.equal((await run(r.id)).status, "applied");
  console.log(
    "PASS subsequent count reconciles sale, stale writes rejected, setup reset respects physical count baseline",
  );
  const adj = {
    id: crypto.randomUUID(),
    product_id: pid,
    delta_units: -1,
    reason: "breakage",
    note: "Flasche beim Transport zerbrochen",
    reference: "Notiz QA",
    occurred_on: day,
  };
  await assert.rejects(() => cmd("adjust", adj, employee), /FORBIDDEN/);
  await q(
    `update staff set permissions='["inventur","bestandskorrektur"]' where user_id=$1`,
    [employee],
  );
  const a = await cmd("adjust", adj, employee);
  await cmd("adjust", adj, employee);
  const p = await stock();
  assert.equal(p.stock, 7);
  assert.equal(p.loose_stock, p.pack_count - 1);
  assert.equal(a.before_units - a.after_units, 1);
  await assert.rejects(
    () =>
      cmd("adjust", { ...adj, id: crypto.randomUUID(), delta_units: -100000 }),
    /übersteigt/,
  );
  await assert.rejects(
    () =>
      cmd(
        "adjust",
        { ...adj, id: crypto.randomUUID(), delta_units: 1, reason: "found" },
        employee,
      ),
    /Inhaber/,
  );
  await assert.rejects(
    () => q("delete from stock_adjustments where id=$1", [a.id]),
    /immutable/,
  );
  const reversal = {
    id: crypto.randomUUID(),
    reverses_id: a.id,
    note: "Meldung war irrtümlich doppelt",
    occurred_on: day,
  };
  await assert.rejects(() => cmd("reverse", reversal, employee), /FORBIDDEN/);
  await cmd("reverse", reversal);
  await cmd("reverse", reversal);
  assert.equal((await stock()).stock, 8);
  assert.equal((await stock()).loose_stock, 0);
  await assert.rejects(
    () => cmd("reverse", { ...reversal, id: crypto.randomUUID() }),
    /bereits gegengebucht/,
  );
  // Optional explanations must retain stock evidence, idempotency and mandatory fields.
  for (const [reason, note] of [
    ["breakage", undefined],
    ["loss", ""],
    ["personal_use", "A"],
    ["other", ""],
  ]) {
    const before = await stock();
    const value = { ...adj, id: crypto.randomUUID(), reason, note };
    const result = await cmd("adjust", value, employee);
    assert.equal(result.note, note || "");
    assert.equal(result.reason, reason);
    assert.equal(result.actor, employee);
    assert.equal(result.occurred_on, day);
    assert.equal(result.product_snapshot.sku, before.sku);
    assert.equal(
      result.before_units,
      before.stock * before.pack_count + before.loose_stock,
    );
    assert.equal(result.after_units, result.before_units - 1);
    assert.ok(result.number && result.created_at);
    await cmd("adjust", value, employee);
    const after = await stock();
    assert.equal(
      after.stock * after.pack_count + after.loose_stock,
      result.after_units,
    );
    assert.equal(
      (
        await q(
          "select count(*)::int n from stock_movements where adjustment_id=$1",
          [result.id],
        )
      )[0].n,
      1,
    );
    await assert.rejects(
      () =>
        q("update stock_adjustments set note='changed' where id=$1", [
          result.id,
        ]),
      /immutable/,
    );
  }
  for (const extra of [
    { reason: null },
    { delta_units: 0 },
    { delta_units: null },
    { occurred_on: null },
    { occurred_on: "2099-01-01" },
    { note: "a".repeat(1501) },
  ]) {
    await assert.rejects(
      () => cmd("adjust", { ...adj, id: crypto.randomUUID(), ...extra }),
      /HINWEIS/,
    );
  }
  console.log(
    "PASS optional adjustment notes retain reason, actor, date, product snapshot, immutable evidence and exactly one stock movement",
  );
  // Article edits cannot change quantities or reinterpret full packs.
  let pp = await stock();
  await assert.rejects(
    () =>
      q("select save_product($1,$2,$3)", [
        JSON.stringify({ ...pp, stock: 99 }),
        pp.revision,
        owner,
      ]),
    /Inventur/,
  );
  await assert.rejects(
    () =>
      q("select save_product($1,$2,$3)", [
        JSON.stringify({ ...pp, pack_count: pp.pack_count * 2 }),
        pp.revision,
        owner,
      ]),
    /Gebinde/,
  );
  assert.equal(
    (
      await q("select save_product($1,$2,$3) ok", [
        JSON.stringify({ ...pp, name: pp.name + " geprüft" }),
        pp.revision,
        owner,
      ])
    )[0].ok,
    true,
  );
  pp = await stock();
  const created = {
    ...pp,
    id: "qa-new-article",
    sku: "QA-NEW-ARTICLE",
    stock: null,
  };
  delete created.loose_stock;
  delete created.stock_version;
  delete created.cost_net_cents;
  assert.equal(
    (
      await q("select save_product($1,$2,$3) ok", [
        JSON.stringify(created),
        null,
        owner,
      ])
    )[0].ok,
    true,
  );
  assert.equal((await stock(created.id)).loose_stock, 0);
  await db.exec("set role anon");
  await assert.rejects(() => cmd("adjust", adj), /permission denied/);
  await db.exec("reset role");
  console.log(
    "PASS single-bottle breakage, idempotency, insufficient stock, separate rights, counterbooking, stock-edit protection, new product defaults, anonymous RPC denial",
  );
} catch (e) {
  console.error("FAIL inventory:", e.message, e.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
