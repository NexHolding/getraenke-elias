import { z } from "zod";
import type { Sale } from "./types";
import { berlinDate } from "./finance-report";
export const reversalReasons = ["Kunde hat nicht bezahlt", "Falscher Artikel / Eingabefehler", "Doppelt gebucht", "Beschädigung / Bruch", "Abgelaufene oder mangelhafte Ware", "Gesetzlicher Widerruf (geprüft)", "Sonstige Buchungskorrektur"] as const;
export const reversalSchema = z.object({
 id:z.uuid(),original_sale_id:z.uuid(),kind:z.enum(["cancellation","return"]),reason:z.string().min(3).max(200),note:z.string().trim().max(1000).optional().default(""),payment:z.enum(["cash","card"]),confirmed:z.literal(true),
 lines:z.array(z.object({index:z.number().int().min(0).max(210),quantity:z.number().int().min(1).max(1000),restock:z.boolean().optional()})).min(1).max(211),
}).refine(v=>new Set(v.lines.map(l=>l.index)).size===v.lines.length)
.refine(v=>v.kind==="return"?v.reason==="Freiwillige Rückgabe":(reversalReasons as readonly string[]).includes(v.reason));
export function reversalRestocks(reason: string) {
 return reason !== "Beschädigung / Bruch" && reason !== "Abgelaufene oder mangelhafte Ware";
}
export function returnDeadline(sale: Sale) {
 const day = new Date(berlinDate(sale.created_at)+"T12:00:00Z");day.setUTCDate(day.getUTCDate()+14);return day.toISOString().slice(0,10);
}
export function voluntaryReturnOpen(sale: Sale, now=new Date()) {
 const today=berlinDate(now.toISOString());return today>=berlinDate(sale.created_at)&&today<=returnDeadline(sale);
}
export function receiptKind(sale: Sale) {
 return sale.record_type==="return"?"Rückgabebeleg":sale.record_type==="cancellation"?"Stornobeleg":"Kassenbon";
}
