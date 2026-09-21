import test from "node:test";
import assert from "node:assert/strict";
import { canUseTerminal, terminalRoster, type TerminalStaff } from "../lib/terminal-access";
import { SYSTEM_ACCOUNT_EMAIL } from "../lib/account-visibility";

test("Only active cashiers and owners can unlock a register", () => {
  assert.equal(canUseTerminal({role:"owner",active:true}), true);
  assert.equal(canUseTerminal({role:"staff",active:true,permissions:["kasse"]}), true);
  assert.equal(canUseTerminal({role:"staff",active:true,permissions:["finanzen"]}), false);
  assert.equal(canUseTerminal({role:"owner",active:false}), false);
  assert.equal(canUseTerminal({role:"staff",active:true,permissions:["kasse"],finance_readonly:true}), false);
});
test("Terminal roster includes support only as Administration and never exposes hashes or email", () => {
  const base: TerminalStaff = {user_id:"1",name:"Mara",email:"private@example.test",number:1,role:"staff",active:true,permissions:["kasse"],pin_hash:"secret-hash"};
  const roster = terminalRoster([base,{...base,user_id:"2",email:SYSTEM_ACCOUNT_EMAIL,name:"global_admin",role:"owner"},{...base,user_id:"3",name:"Tim",pin_hash:null},{...base,user_id:"4",permissions:["finanzen"]}]);
  assert.equal(roster.length, 3);
  assert.equal(roster[0].name, "Administration");
  assert.equal(roster.find(p=>p.user_id==="3")?.has_pin,false);
  assert.ok(!JSON.stringify(roster).includes("secret-hash"));
  assert.ok(!JSON.stringify(roster).includes("email"));
  assert.ok(!JSON.stringify(roster).includes("global_admin"));
});
