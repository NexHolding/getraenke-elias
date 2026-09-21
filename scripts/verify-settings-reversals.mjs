import {build}from'esbuild';import{chromium}from'@playwright/test';import{createServer}from'node:http';import{readFile,mkdir,writeFile}from'node:fs/promises';import assert from'node:assert/strict';import{settingsSchema}from'../lib/validation.ts';import{reversalSchema}from'../lib/reversals.ts';
const fixtures=JSON.parse(await readFile('output/reversals/fixtures.json','utf8'));
const products=JSON.parse(await readFile('data/catalog.json','utf8'));
const data={operatorId:'qa',products,suppliers:[],orders:[],sales:[],purchases:[],closings:[],mail:[],role:'owner',permissions:[],name:'QA',pendingReceipt:null,settings:{...fixtures.settings,auto_reorder:false,printer_mode:'browser',printer_address:'',smtp_port:465,smtp_host:'',smtp_user:'',smtp_from:'',domain:'getraenke-elias.de',instagram:'',tse_provider:'fiskaly'}};
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AdminApp from './components/admin-app';import PdfPreview from './components/pdf-preview';createRoot(document.getElementById('root')).render(<><AdminApp section={location.pathname.split('/')[2]||'uebersicht'}/><PdfPreview/></>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  plugins: [
    {
      name: "framework-harness",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({
          path: a.path,
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          resolveDir: process.cwd(),
          loader: "tsx",
          contents:
            a.path === "next/navigation"
              ? `const router={push:(url)=>location.assign(url),refresh:()=>{}};export function useRouter(){return router}export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}`
              : a.path === "next/link"
                ? `import React from 'react';export default function Link(p){return <a {...p}/>}`
                : `import React from 'react';export default function Image({fill,priority,unoptimized,loader,...p}){return <img {...p} style={fill?{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}:undefined}/>} `,
        }));
      },
    },
  ],
});
const css=(await readFile('app/globals.css','utf8')).replace(/^@import.*$/gm,'');let commands=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3022');
 if(url.pathname==='/api/admin'){res.setHeader('content-type','application/json');if(req.method==='POST'){let s='';for await(const c of req)s+=c;const v=JSON.parse(s);assert.equal(v.action,'settings');const parsed=settingsSchema.safeParse(v.value);if(!parsed.success){res.statusCode=400;res.end(JSON.stringify({error:parsed.error.message}));return;}data.settings=parsed.data;res.end('{"ok":true}');}else res.end(JSON.stringify(data));return;}
 if(url.pathname==='/api/reversals'){res.setHeader('content-type','application/json');if(req.method==='POST'){let s='';for await(const c of req)s+=c;const v=reversalSchema.parse(JSON.parse(s));commands.push(v);res.end(JSON.stringify({...fixtures.first,id:v.id}));}else res.end(JSON.stringify({sales:[fixtures.sale],reversals:[]}));return;}
 if(url.pathname.startsWith('/api/receipts/')){res.setHeader('content-type','application/pdf');res.end(await readFile(url.pathname.endsWith('ffffffffffff')?'output/pdf/Elias-Storno-Monatsbericht-Muster.pdf':'output/pdf/Elias-Rueckgabebeleg-Muster.pdf'));return;}
 if(url.pathname.startsWith('/api/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({employees:[],customers:[],invoices:[],deliveries:[],subscriptions:[]}));return;}
 if(url.pathname==='/app.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 if(/^\/(images|products|vendor)\//.test(url.pathname)&&!url.pathname.includes('..')){try{res.setHeader('content-type',url.pathname.endsWith('.mjs')?'text/javascript':url.pathname.endsWith('.svg')?'image/svg+xml':url.pathname.endsWith('.png')?'image/png':'application/octet-stream');res.end(await readFile('public'+url.pathname));}catch{res.statusCode=404;res.end();}return;}
 res.setHeader('content-type','text/html');res.end(`<html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-geist:Arial}body{margin:0}</style><body><div id="root"></div><script src="/app.js"></script></body></html>`);
});
await new Promise(r=>server.listen(3022,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});await mkdir('output/reversals',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1194,height:834}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3022/crm/einstellungen');await page.getByLabel('Straße',{exact:true}).waitFor();assert.equal(await page.getByLabel('Straße',{exact:true}).inputValue(),'Wartbergstraße');assert.equal(await page.getByLabel('Hausnummer',{exact:true}).inputValue(),'3');assert.equal(await page.getByLabel('Postleitzahl',{exact:true}).inputValue(),'74076');assert.equal(await page.getByLabel('Ort',{exact:true}).inputValue(),'Heilbronn');assert.equal(await page.getByText('Rabattvorschlag für den Warenkorb (%)').count(),0);
 await page.getByRole('button',{name:'Bestellautomatik',exact:true}).click();await page.getByLabel('Automatische Sammelbestellung einschalten',{exact:true}).check();await page.getByLabel('Rhythmus (Wochen)',{exact:true}).fill('3');await page.getByLabel('Bestellzeit · Europe/Berlin',{exact:true}).fill('15:45');await page.getByRole('button',{name:'Einstellungen speichern',exact:true}).click();await page.getByText('Einstellungen gespeichert.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Automatische Sammelbestellung einschalten').isChecked(),true);assert.equal(data.settings.reorder_weeks,3);
 await page.reload();await page.getByRole('button',{name:'Bestellautomatik',exact:true}).click();assert.equal(await page.getByLabel('Automatische Sammelbestellung einschalten').isChecked(),true);assert.equal(await page.getByLabel('Rhythmus (Wochen)').inputValue(),'3');assert.equal(await page.getByLabel('Bestellzeit · Europe/Berlin').inputValue(),'15:45');await page.screenshot({path:'output/reversals/automation-persisted.png',fullPage:true});
 await page.getByRole('button',{name:'Steuern & Belege',exact:true}).click();await page.getByLabel('MwSt.-Vorgabe für neue Artikel',{exact:true}).fill('16');await page.getByRole('button',{name:'Einstellungen speichern',exact:true}).click();await page.waitForFunction(()=>document.body.innerText.includes('Einstellungen gespeichert.'));assert.equal(data.settings.default_tax_rate,16);
 await page.goto('http://127.0.0.1:3022/crm/kasse');await page.getByRole('button',{name:'Belege / Storno',exact:true}).click();await page.getByRole('button',{name:'14-Tage-Rückgabe',exact:true}).waitFor();
 await page.getByLabel('Bonnummer oder Beleg-ID').fill('E-'+fixtures.sale.number);await page.getByRole('button',{name:'Suchen',exact:true}).click();
 const pages=context.pages().length;await page.getByRole('button',{name:'PDF-Bon anzeigen',exact:true}).click();await page.getByRole('img',{name:'Bon · Seite 1'}).waitFor({timeout:20000});assert.equal(context.pages().length,pages);await page.screenshot({path:'output/reversals/pdf-in-app.png',fullPage:true});await writeFile('output/reversals/receipt-render.png',Buffer.from((await page.getByRole('img',{name:'Bon · Seite 1'}).evaluate(c=>c.toDataURL())).split(',')[1],'base64'));await page.getByRole('button',{name:'PDF-Bon schließen',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'Belege, Storno und Rückgabe'}).count(),1);
 await page.getByRole('button',{name:'14-Tage-Rückgabe',exact:true}).click();await page.getByLabel('Rückgabemenge Spielzeug').fill('1');assert.equal(await page.getByLabel('Erläuterung (optional)').inputValue(),'');assert.equal(await page.getByLabel('Verkaufsfähig zurück ins Lager').count(),0);assert.equal(await page.getByRole('button',{name:'Gegenbeleg verbindlich buchen'}).isDisabled(),true);await page.getByLabel('Barauszahlung bzw. Korrektur der zuvor gebuchten Barzahlung geprüft und durchgeführt.').check();await page.screenshot({path:'output/reversals/return-confirmation.png',fullPage:true});await page.getByRole('button',{name:'Gegenbeleg verbindlich buchen'}).click();await page.getByRole('heading',{name:/Rückgabebeleg.*gespeichert/}).waitFor();assert.equal(commands.length,1);assert.equal(commands[0].kind,'return');assert.equal(commands[0].note,'');assert.equal(commands[0].lines[0].restock,undefined);await page.getByRole('button',{name:'Fertig',exact:true}).click();
 for(const [index,reason] of ['Kunde hat nicht bezahlt','Beschädigung / Bruch','Abgelaufene oder mangelhafte Ware'].entries()) {
 await page.getByRole('button',{name:'Belege / Storno',exact:true}).click();
 await page.getByRole('button',{name:'Stornieren / korrigieren',exact:true}).click();
 await page.getByLabel('Stornogrund',{exact:true}).selectOption(reason);
 await page.getByText(index===0?'Automatisch zurück ins Lager':'Keine Bestandsrückbuchung',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Erläuterung (optional)').inputValue(),'');
 assert.equal(await page.getByLabel('Verkaufsfähig zurück ins Lager').count(),0);
 await page.getByLabel('Barauszahlung bzw. Korrektur der zuvor gebuchten Barzahlung geprüft und durchgeführt.').check();
 assert.equal(await page.getByRole('button',{name:'Gegenbeleg verbindlich buchen'}).isEnabled(),true);
 await page.screenshot({path:`output/reversals/automatic-stock-${index}.png`,fullPage:true});
 await page.getByRole('button',{name:'Gegenbeleg verbindlich buchen'}).click();
 await page.getByRole('heading',{name:/Rückgabebeleg.*gespeichert/}).waitFor();
 assert.equal(commands[index+1].note,'');assert.equal(commands[index+1].reason,reason);
 await page.getByRole('button',{name:'Fertig',exact:true}).click();
 }
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('elias:pdf-preview',{detail:'/api/receipts/00000000-0000-0000-0000-ffffffffffff?format=pdf'})));await page.getByRole('img',{name:'Bon · Seite 3'}).waitFor();for(let n=1;n<=3;n++)await writeFile('output/reversals/finance-page-'+n+'.png',Buffer.from((await page.getByRole('img',{name:'Bon · Seite '+n}).evaluate(c=>c.toDataURL())).split(',')[1],'base64'));await page.getByRole('button',{name:'PDF-Bon schließen',exact:true}).click();await page.setViewportSize({width:834,height:1194});await page.getByRole('button',{name:'Belege / Storno',exact:true}).click();await page.getByRole('button',{name:'14-Tage-Rückgabe',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'output/reversals/return-ipad-portrait.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: four business address fields; no discount preset; automation survives save/reload; future VAT setting; receipt search; PDF renders inside same app; nested close; optional explanation; automatic stock with breakage/expired/defective exceptions; return and cancellation submission without note. No production writes.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
