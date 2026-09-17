import urllib.request,json,re,html
from pathlib import Path
from urllib.parse import urljoin,urlsplit
p=json.loads(Path('data/catalog.json').read_text());manifest=json.loads(Path('data/image-sources.json').read_text())
def fetch(url):return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=20).read()
def image(ids,url,source):
 try:
  b=fetch(url);ext=urlsplit(url).path.split('.')[-1].lower();name=ids[0]+'.'+ext;Path('public/products/'+name).write_bytes(b)
  for x in p:
   if x['id'] in ids:x['image_url']='/products/'+name;x['image_source']=source
  manifest[:]=[m for m in manifest if m['articles'] != ids]
  manifest.append({'articles':ids,'image':url,'source':source});print('OK',ids[0],len(b))
 except Exception as e:print('FAILED',ids[0],type(e).__name__)
for i,name in enumerate(['O','Z','C'],1):
 page=['orangenlimonade','zitronenlimonade','cola-mix'][i-1]
 image(['elias-036-v'+str(i)],'https://www.alwa-mineralwasser.de/images/produkte/detail/limonaden/neu/260630_alwa-HP-Produktabbildungen-Detailseite-LIMO-'+name+'.jpg','https://www.alwa-mineralwasser.de/limonaden/'+page+'.html')
for ids,name,page in [(['elias-005-v1','elias-001'],'Ensinger-Sport-Classic-Sortiment.gif','ensinger-sport-mineralwasser'),(['elias-005-v2','elias-002'],'Ensinger-Sport-Medium-Sortiment.gif','ensinger-sport-mineralwasser'),(['elias-005-v3','elias-003'],'Ensinger-Sport-Still-Sortiment.gif','ensinger-sport-mineralwasser'),(['elias-025'],'Ensinger-Zitronenlimonade-Produkt.gif','erfrischungsgetraenke'),(['elias-026'],'Ensinger-Orangenlimonade-Produkt.gif','erfrischungsgetraenke'),(['elias-027'],'Ensinger-Cola-Mix-Sortiment.gif','erfrischungsgetraenke'),(['elias-029'],'Ensinger-Apfel-Schorle-Sortiment.gif','ensinger-fruchtschorlen')]:
 image(ids,'https://www.ensinger.de/fileadmin/pics/Produktabbildungen/'+name,'https://www.ensinger.de/produkte/'+page)
image(['elias-044-v2'],'https://www.coca-cola.com/content/dam/onexp/de/de/fanta/produkte/fanta-orange-330ml.jpg','https://www.coca-cola.com/de/de/brands/fanta')
image(['elias-056'],'https://www.distelhaeuser.de/fileadmin/user_upload/distelhaeuser/images/produktdatenbank/flaschen/DH_Pils_Flasche_0_3L_Vichy.png','https://www.distelhaeuser.de/unser-bier/pils-familie/')
image(['elias-057'],'https://www.distelhaeuser.de/fileadmin/user_upload/distelhaeuser/images/produktdatenbank/flaschen/DH_Distelhaeuser_Alkoholfre_Flasche_0_33L_Vichy_01.png','https://www.distelhaeuser.de/unser-bier/pils-familie/')
for url in ['https://www.beil-fruchtsaft.de/de/markt/','https://www.rothaus.de/biere/tannenzaepfle','https://www.coca-cola.com/de/de/brands/brand-coca-cola']:
 try:
  s=fetch(url).decode();Path('/private/tmp/'+urlsplit(url).hostname+'.html').write_text(s)
  print('PAGE',url)
  for t in re.findall(r'<img\b[^>]+>',s):
   if any(x in t.lower() for x in ['flasche','saft','traub','apfel','tannen','pils','coca']):print(t[:350])
 except Exception as e:print(type(e).__name__)
Path('data/catalog.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n');Path('data/image-sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
