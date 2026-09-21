"use client";
import { useEffect, useState, useRef } from "react";
import { X, Search } from "lucide-react";
import type { Sale } from "@/lib/types";
import { euro } from "@/lib/money";
import { receiptKind, returnDeadline, voluntaryReturnOpen, reversalReasons, reversalRestocks } from "@/lib/reversals";
import { receiptDownload } from "./checkout-flow";
import { useDialog } from "./use-dialog";
import NumberInput from "./number-input";
type Selection={index:number;quantity:number};
type Command={id:string;original_sale_id:string;kind:"cancellation"|"return";reason:string;note:string;payment:string;confirmed:true;lines:Selection[]};
export default function ReceiptManager({close,allowed,onChanged}:{close:()=>void;allowed:boolean;onChanged:()=>Promise<void>}) {
 const [q,setQ]=useState("");const [sales,setSales]=useState<Sale[]>([]);const [related,setRelated]=useState<Sale[]>([]);
 const [sale,setSale]=useState<Sale|null>(null);const [kind,setKind]=useState<"cancellation"|"return">("cancellation");
 const [lines,setLines]=useState<Selection[]>([]);const [reason,setReason]=useState<string>(reversalReasons[0]);const [note,setNote]=useState("");const [payment,setPayment]=useState("cash");const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [booked,setBooked]=useState<Sale|null>(null);const [pending,setPending]=useState<Command|null>(null);const lock=useRef(false);const changed=useRef(false);
 const dismiss=()=>{if(!busy&&!pending){if(changed.current)void onChanged();close();}};
 useDialog(true,dismiss);
 async function load(search:string) {setBusy(true);setError("");try{const r=await fetch(`/api/reversals?q=${encodeURIComponent(search)}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error);setSales(d.sales);setRelated(d.reversals);}catch(e){setError(e instanceof Error?e.message:"Belege nicht erreichbar.");}finally{setBusy(false);}}
 useEffect(()=>{
  const abort=new AbortController();
  fetch("/api/reversals",{cache:"no-store",signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);return d;}).then(d=>{setSales(d.sales);setRelated(d.reversals);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
  return ()=>abort.abort();
 },[]);
 const remaining=(s:Sale,index:number)=>Math.max(0,Math.abs(s.items[index].quantity)-related.filter(r=>r.original_sale_id===s.id).reduce((sum,r)=>sum+r.items.filter(l=>l.original_line===index).reduce((n,l)=>n+Math.abs(l.quantity),0),0));
 function choose(s:Sale,k:"cancellation"|"return") {setSale(s);setKind(k);setPayment(s.payment);setReason(k==="return"?"Freiwillige Rückgabe":reversalReasons[0]);setNote("");setConfirmed(false);setError("");setLines(s.items.map((l,index)=>({index,quantity:k==="return"?0:remaining(s,index)})));}
 const amount=sale?lines.reduce((n,l)=>n-Math.sign(sale.items[l.index].quantity)*l.quantity*(sale.items[l.index].price_cents+sale.items[l.index].deposit_cents),0):0;
 async function book() {
  if(lock.current||!sale)return;lock.current=true;setBusy(true);setError("");
  const command=pending||{id:crypto.randomUUID(),original_sale_id:sale.id,kind,reason,note,payment,confirmed:true as const,lines:lines.filter(l=>l.quantity>0)};setPending(command);
  try {const r=await fetch('/api/reversals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});const d=await r.json();if(!r.ok){if(r.status<500)setPending(null);throw Error(d.error||"Buchungsstatus unklar.");}setBooked(d);setPending(null);changed.current=true;}catch(e){setError(e instanceof Error?e.message:"Verbindung unterbrochen. Mit derselben Vorgangsnummer erneut prüfen.");}finally{setBusy(false);lock.current=false;}
 }
 return <div className="receipt-manager-overlay" role="dialog" aria-modal="true" aria-label="Belege, Storno und Rückgabe"><section className="receipt-manager"><header><div><span className="eyebrow">ELIAS BELEGARCHIV</span><h2>Belege · Storno · Rückgabe</h2></div><button autoFocus type="button" disabled={busy||!!pending} aria-label="Belegarchiv schließen" onClick={dismiss}><X/></button></header><div className="receipt-manager-content">
 {error&&<p role="alert" className="notice danger">{error}</p>}
 {pending&&!busy&&<p className="notice">Die Antwort ist unklar. Bitte denselben Vorgang erneut prüfen; es wird keine zweite Korrektur angelegt.</p>}
 {booked?<><h3>{receiptKind(booked)} E-{booked.number} gespeichert</h3><p>Gegenbeleg zu E-{booked.original_number}. Betrag: <strong>{euro(booked.total_cents)}</strong>. Buchungsdatum: {new Date(booked.created_at).toLocaleDateString("de-DE",{timeZone:"Europe/Berlin"})}.</p><p>Der Originalbeleg bleibt unverändert. Tages- und Monatsauswertung berücksichtigen den Gegenbeleg an diesem Buchungstag.</p><button className="button" onClick={()=>receiptDownload(booked.id)}>Gegenbeleg anzeigen</button><button className="button secondary" onClick={dismiss}>Fertig</button></>:sale?<>
 <button className="text-link" disabled={busy||!!pending} onClick={()=>setSale(null)}>← Zur Belegsuche</button><h3>{kind==="return"?"Freiwillige 14-Tage-Rückgabe":"Beleg korrigieren / stornieren"} · E-{sale.number}</h3>
 <p>{kind==="return"?`Rücknahme bis ${new Date(returnDeadline(sale)+"T12:00:00Z").toLocaleDateString("de-DE")}: nur unbenutzte, vollständige, freigegebene Nicht-Lebensmittel mit Originalbon. Gesetzliche Mängelrechte bleiben unberührt.`:"Positionen und Mengen auswählen. Die Ware wird automatisch zurück ins Lager gebucht. Bei „Beschädigung / Bruch“ und „Abgelaufene oder mangelhafte Ware“ erfolgt keine Bestandsrückbuchung."}</p>
 <fieldset disabled={busy||!!pending} className="reversal-fields">
 {sale.items.map((item,index)=>{const max=remaining(sale,index);const eligible=kind!=="return"||(item.quantity>0&&item.return_eligible&&voluntaryReturnOpen(sale));return <div className="reversal-line" key={index}><div><strong>{item.name}</strong><small>{euro(item.price_cents+item.deposit_cents)} je Einheit · noch {max} korrigierbar</small>{!eligible&&<small>Keine freiwillige Rücknahme</small>}</div><label>Menge<NumberInput aria-label={`Rückgabemenge ${item.name}`} min={0} max={max} value={lines[index]?.quantity||0} disabled={!eligible||!max} onChange={e=>setLines(lines.map(l=>l.index===index?{...l,quantity:Math.min(max,Math.max(0,Number(e.target.value)))}:l))}/></label>{item.quantity>0&&<small className="reversal-stock-status">{reversalRestocks(reason)?"Automatisch zurück ins Lager":"Keine Bestandsrückbuchung"}</small>}</div>})}
 <label>Grund<select aria-label="Stornogrund" value={reason} onChange={e=>setReason(e.target.value)}>{(kind==="return"?["Freiwillige Rückgabe"]:reversalReasons).map(r=><option key={r}>{r}</option>)}</select></label>
 <label>Erläuterung (optional)<textarea value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} placeholder="Was wurde korrigiert und warum?"/></label>
 <label>Zahlungskorrektur über<select value={payment} onChange={e=>setPayment(e.target.value)}><option value="cash">Bargeld / Kassenbestand</option><option value="card">Externes EC-Gerät</option></select></label>
 <p className="reversal-amount">{amount<=0?"Erstattung / Gegenbuchung":"Nachzuzahlen"}: <strong>{euro(Math.abs(amount))}</strong></p>
 <label className="checkline"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{payment==="card"?"EC-Erstattung/Zahlungskorrektur am separaten Gerät erfolgreich durchgeführt.":"Barauszahlung bzw. Korrektur der zuvor gebuchten Barzahlung geprüft und durchgeführt."}</label>
 </fieldset>
 <p className="fineprint">Buchung mit heutigem Datum. {sale.test_mode?"Einrichtungsbeleg – keine TSE-Signatur.":"Echtbeleg benötigt fiskalisierten Storno-Adapter."}</p>
 <button className="button" disabled={busy||(!pending&&(!confirmed||!lines.some(l=>l.quantity>0)))} onClick={book}>{busy?"Wird gespeichert …":pending?"Denselben Vorgang erneut prüfen":"Gegenbeleg verbindlich buchen"}</button>
 </>:<><form className="receipt-search" onSubmit={e=>{e.preventDefault();void load(q);}}><label>Bonnummer oder Beleg-ID<input value={q} onChange={e=>setQ(e.target.value)} placeholder="z. B. E-000123"/></label><button className="button" disabled={busy}><Search size={18}/>Suchen</button></form><p>Ohne Suche werden die letzten 50 Belege angezeigt.</p>{sales.map(s=><article key={s.id} className="receipt-search-row"><div><strong>E-{s.number} · {receiptKind(s)}</strong><small>{new Date(s.created_at).toLocaleString("de-DE",{timeZone:"Europe/Berlin"})} · {s.payment==="cash"?"Bar":"Karte"}</small><strong>{euro(s.total_cents)}</strong>{s.original_number&&<small>Original: E-{s.original_number} · {s.reversal_reason}</small>}</div><div className="receipt-row-actions"><button className="button secondary small" onClick={()=>receiptDownload(s.id)}>PDF-Bon anzeigen</button>{allowed&&(!s.record_type||s.record_type==="sale")&&<><button className="button secondary small" disabled={!s.test_mode||!s.items.some((_,i)=>remaining(s,i)>0)} onClick={()=>choose(s,"cancellation")}>Stornieren / korrigieren</button><button className="button secondary small" disabled={!s.test_mode||!voluntaryReturnOpen(s)||!s.items.some((l,i)=>l.return_eligible&&remaining(s,i)>0)} onClick={()=>choose(s,"return")}>14-Tage-Rückgabe</button></>}</div></article>)}{!busy&&!sales.length&&<p>Kein Beleg gefunden.</p>}{!allowed&&<p className="notice">Stornierungen und Rückgaben benötigen die Mitarbeiterberechtigung „Belege stornieren und Rückgaben buchen“.</p>}</>}
 </div></section></div>;
}
