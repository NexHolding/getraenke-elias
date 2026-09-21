import test from 'node:test';import assert from 'node:assert/strict';
import { totals } from '../lib/money';import{buildFinanceReport,financeCsv}from'../lib/finance-report';import{voluntaryReturnOpen,returnDeadline,reversalSchema}from'../lib/reversals';import{businessAddressFields,businessAddress}from'../lib/business-address';import type{Sale}from'../lib/types';import{can}from'../lib/permissions';
const line={id:'toy',name:'Spielzeug',quantity:1,price_cents:1190,deposit_cents:0,tax_rate:19,deposit_tax_rate:19,return_eligible:true};
const s:Sale={id:'1',number:1,created_at:'2026-09-28T11:00:00Z',items:[line],total_cents:1190,net_cents:1000,tax_cents:190,deposit_cents:0,payment:'cash',test_mode:true};
test('September purchase returned in October changes October cash and tax only',()=>{
 const r:Sale={...s,id:'2',number:2,created_at:'2026-10-10T11:00:00Z',record_type:'return',original_sale_id:s.id,original_number:1,reversal_reason:'Freiwillige Rückgabe',items:[{...line,quantity:-1,original_line:0}],total_cents:-1190,net_cents:-1000,tax_cents:-190};
 assert.equal(buildFinanceReport([s,r],[],'2026-09',{}).all.cash,1190);
 const october=buildFinanceReport([s,r],[],'2026-10',{});assert.equal(october.all.cash,-1190);assert.equal(october.all.tax,-190);assert.equal(october.documents[0].reference,'E-1');assert.match(financeCsv(october),/Freiwillige Rückgabe/);
 assert.equal(voluntaryReturnOpen(s,new Date('2026-10-10T20:00:00Z')),true);assert.equal(returnDeadline(s),'2026-10-12');assert.equal(voluntaryReturnOpen(s,new Date('2026-10-12T21:59:59Z')),true);assert.equal(voluntaryReturnOpen(s,new Date('2026-10-12T22:00:00Z')),false);
});
test('Partial refunds preserve stored cent allocations and future tax rates in exports',()=>{
 assert.equal(totals([{...line,quantity:-1,price_cents:1,net_cents:0,deposit_net_cents:0}]).net,0);
 const future={...line,tax_rate:16,price_cents:116};const t=totals([future]);const report=buildFinanceReport([{...s,items:[future],total_cents:t.gross,net_cents:t.net,tax_cents:t.tax}],[],'2026-09',{});assert.match(financeCsv(report),/Netto 16%/);
});
test('Reversal permission is opt-in for staff and never bypasses finance read-only',()=>{
 assert.equal(can({role:'owner'},'storno'),true);assert.equal(can({role:'staff',permissions:['kasse']},'storno'),false);assert.equal(can({role:'staff',permissions:['storno']},'storno'),true);assert.equal(can({role:'staff',permissions:['storno'],finance_readonly:true},'storno'),false);
 assert.equal(reversalSchema.safeParse({}).success,false);
});
test('Business address migrates the legacy line into four lossless fields',()=>{
 const fields=businessAddressFields({business_address:'Wartbergstraße 3 · 74076 Heilbronn'});assert.deepEqual(fields,{business_street:'Wartbergstraße',business_house_number:'3',business_postal_code:'74076',business_city:'Heilbronn'});assert.equal(businessAddress(fields),'Wartbergstraße 3 · 74076 Heilbronn');
});
