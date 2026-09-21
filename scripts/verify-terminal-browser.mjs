import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Terminal from './app/kassenzugang/page';createRoot(document.getElementById('root')).render(<Terminal/>);`,
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
const css=(await readFile('app/globals.css','utf8')).replace(/^@import.*$/gm,'');
let accept=false,registered=true;
const posts=[];
const server=createServer(async(req,res)=>{
 if(req.url==='/api/terminal'){
  res.setHeader('content-type','application/json');
  if(req.method==='POST'){let text='';for await(const c of req)text+=c;posts.push(JSON.parse(text));res.statusCode=accept?200:400;res.end(JSON.stringify(accept?{ok:true}:{error:'PIN nicht korrekt.'}));return;}
  res.end(JSON.stringify({registered,employees:[{user_id:'admin',name:'Administration',number:1,has_pin:true},{user_id:'owner',name:'Frank Elias',number:2,has_pin:false}]}));return;
 }
 if(req.url==='/app.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].text);return;}
 if(req.url.startsWith('/images/')){try{res.setHeader('content-type',req.url.endsWith('.svg')?'image/svg+xml':'image/png');res.end(await readFile('public'+req.url));}catch{res.statusCode=404;res.end();}return;}
 res.setHeader('content-type','text/html');res.end(`<html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-geist:Arial}body{margin:0}</style><body><div id="root"></div><script src="/app.js"></script></body></html>`);
});
await new Promise(r=>server.listen(3021,'127.0.0.1',r));
if(process.env.QA_SERVE_ONLY){console.log('Terminal fixture http://127.0.0.1:3021/kassenzugang');await new Promise(()=>{});}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
await mkdir('output/terminal',{recursive:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height] of [[1194,834],[1024,768],[834,1194],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:3021/kassenzugang');await page.getByRole('button',{name:/Administration/}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:/E-Mail|Benutzername/}).count(),0);
  await page.screenshot({path:`output/terminal/roster-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/Administration/}).click();
  assert.equal(await page.locator('#terminal-pin').inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'Kasse entsperren'}).isDisabled(),true);
  for(const digit of ['1','2','3','4'])await page.getByRole('button',{name:digit,exact:true}).click();
  assert.equal(await page.locator('#terminal-pin').inputValue(),'1234');
  const box=await page.getByRole('button',{name:'Kasse entsperren'}).boundingBox();assert.ok(box.y+box.height<=height,`unlock visible at ${width}`);
  await page.screenshot({path:`output/terminal/pin-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Letzte Ziffer löschen',exact:true}).click();assert.equal(await page.locator('#terminal-pin').inputValue(),'123');
  await page.getByRole('button',{name:'PIN löschen',exact:true}).click();assert.equal(await page.locator('#terminal-pin').inputValue(),'');
  await page.getByRole('button',{name:'Anderen Mitarbeiter wählen'}).click();
  await page.getByRole('button',{name:/Frank Elias/}).click();await page.getByText(/noch keine Kassen-PIN hinterlegt/).waitFor();assert.equal(await page.locator('#terminal-pin').count(),0);
  await page.getByRole('button',{name:'Anderen Mitarbeiter wählen'}).click();await page.getByRole('button',{name:/Administration/}).click();
  await page.locator('#terminal-pin').fill('abcd');assert.equal(await page.locator('#terminal-pin').inputValue(),'');
  await page.locator('#terminal-pin').fill('1234');await page.getByRole('button',{name:'Kasse entsperren'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('#terminal-pin').inputValue(),'');
 }
 accept=true;await page.locator('#terminal-pin').fill('1234');await page.getByRole('button',{name:'Kasse entsperren'}).click();await page.waitForURL('**/crm/kasse');assert.deepEqual(posts.at(-1),{action:'unlock',user_id:'admin',pin:'1234'});
 registered=false;await page.goto('http://127.0.0.1:3021/kassenzugang');await page.getByText(/Bitte einmal mit deinem Mitarbeiter-Passwort/).waitFor();assert.equal(await page.getByRole('button',{name:/Administration/}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: names, masked keypad, clear/backspace, account switch, missing/incorrect PIN, unlock navigation, unpaired state and four viewports.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
