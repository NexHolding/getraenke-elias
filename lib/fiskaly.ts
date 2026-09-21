import "server-only";
const BASE="https://kassensichv-middleware.fiskaly.com/api/v2";
export async function checkFiskaly() {
 const required=["FISKALY_API_KEY","FISKALY_API_SECRET","FISKALY_TSS_ID","FISKALY_CLIENT_ID"];
 const missing=required.filter(k=>!process.env[k]);
 if(missing.length)return {connected:false,missing,live_ready:false,message:"Fiskaly-Verbindungsdaten fehlen. Die Anbieterauswahl allein stellt keine Verbindung her."};
 const tss=process.env.FISKALY_TSS_ID!,client=process.env.FISKALY_CLIENT_ID!;
 if(![tss,client].every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))return {connected:false,live_ready:false,message:"TSS- und Client-ID müssen gültige UUIDs sein."};
 const auth=await fetch(BASE+"/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_key:process.env.FISKALY_API_KEY,api_secret:process.env.FISKALY_API_SECRET}),signal:AbortSignal.timeout(15000),cache:"no-store"});
 if(!auth.ok)return {connected:false,live_ready:false,message:`Fiskaly-Anmeldung fehlgeschlagen (HTTP ${auth.status}). Schlüssel und Umgebung prüfen.`};
 const token=await auth.json();if(!token.access_token)throw Error("Provider authentication failed");
 const headers={Authorization:`Bearer ${token.access_token}`};
 const [tr,cr]=await Promise.all([fetch(`${BASE}/tss/${tss}`,{headers,cache:"no-store",signal:AbortSignal.timeout(15000)}),fetch(`${BASE}/tss/${tss}/client/${client}`,{headers,cache:"no-store",signal:AbortSignal.timeout(15000)})]);
 if(!tr.ok||!cr.ok)return {connected:false,live_ready:false,message:`Anmeldung erfolgreich; TSS/Client nicht lesbar (${tr.status}/${cr.status}). Zuordnung prüfen.`};
 const t=await tr.json(),c=await cr.json();
 return {connected:true,live_ready:false,tss_state:t.state||"unbekannt",environment:t._env||c._env||"Bitte im Fiskaly HUB prüfen",register_serial:c.serial_number||"",message:"Verbindung und vorhandene TSS/Client-Zuordnung lesend geprüft. Transaktionssignierung, DSFinV-K und Betriebsabnahme sind noch nicht implementiert. Kein Echtbetrieb freigegeben."};
}
