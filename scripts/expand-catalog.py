# One-off source import. Run image mapping afterwards; do not use for operational product edits.
import json
from pathlib import Path
products=json.loads(Path('data/catalog-original.json').read_text())
variants={
5:('Ensinger', ['Classic','Medium','Still']),9:('Aqua Vitale',['Classic','Medium','Still']),10:('Aqua Vitale',['Classic','Medium','Still']),12:('Aqua Römer PET',['Classic','Medium','Sanft']),13:('Aqua Römer PET',['Classic','Medium','Sanft']),17:('Teinacher',['Classic','Medium']),18:('Alwa Gourmet',['Classic','Medium','Still']),20:('Naturpark',['Spritzig','Medium','Naturell']),21:('Prinzenperle',['Classic','Medium','Still']),22:('St. Leonhard',['Still','Medium']),
36:('Alwa Limonade',['Orange','Zitrone','Cola-Mix']),37:('Alwa Schorle',['Johannisbeer','Apfel']),42:('Coca-Cola Familie',['Fanta','Sprite']),44:('Coca-Cola Familie · Dose',['Coca-Cola','Fanta']),45:('Coca-Cola ohne Zucker · Dose',['Light','Zero']),47:('Coca-Cola Familie · Glas',['Coca-Cola','Fanta']),48:('Coca-Cola Familie',['Coca-Cola','Fanta']),
52:('Distelhäuser',['Pils','Export']),55:('Distelhäuser',['Hefe','Kristall']),58:('Erdinger',['Hefe','Alkoholfrei']),68:('Importbier',['Corona','Desperados']),69:('Dinkelacker',['Pils','Privat']),72:('Jever',['Pilsner','Light','Fun']),73:('Markgrafen',['CD-Pils','Export']),74:('Paulaner',['Hefe','Kristall','Alkoholfrei']),79:('Internationale Biere',['Tyskie','Lech','Efes']),81:('Bier Sixpack',['Beck’s','Rothaus','Warsteiner']),95:('Beil Saft',['Traube','Johannisbeer'])}
result=[];retire=[]
for p in products:
 n=int(p['id'].split('-')[1]);p.update(group_name='',variant='',image_url='',image_source='',data_note='')
 profile='none' if p['category'] in ['Wein','Sekt','Für Ihre Feier'] else 'beer' if p['category']=='Bier' else 'reusable'
 if n in [49,50]:profile='beer'
 if n in [61,80]:profile='swing'
 if n in [24,44,45,46]:profile='single'
 if n==81:profile='sixpack'
 p['deposit_profile']=profile
 bottle={'none':0,'beer':8,'swing':15,'single':25,'sixpack':8,'reusable':15}[profile]
 p['deposit_cents']=p['pack_count']*bottle+(150 if profile in ['beer','swing','reusable'] and p['pack_count']>1 else 0)
 p['data_note']='Pfandprofil aus Gebinde zugeordnet; Verpackung beim Wareneingang abgleichen.' if profile!='none' else ''
 if n in [44,45,46]: p['data_note']='Flyer trennt diese 0,33-l-Position von Glas. Als Einwegdose angelegt; Verpackung vor Verkauf abgleichen.'
 if n in [30,38,49,64]:p['data_note']+=' Flyer nennt keine vollständige Sortenliste; konkrete Varianten bei Artikelpflege ergänzen.'
 if n in variants:
  group,opts=variants[n];retire.append(p['id'])
  for k,opt in enumerate(opts,1):
   v=p.copy();v.update(id=p['id']+'-v'+str(k),sku=p['sku']+'-'+str(k),group_name=group,variant=opt)
   v['name']=opt if n in [42,44,47,48,68,79] else ('Coca-Cola '+opt if n==45 else group+' '+opt)
   result.append(v)
 else: result.append(p)
Path('data/catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
# Existing imported parents are retained inactive so historical references stay valid.
fields=list(result[0].keys());fields=[x for x in fields if x!='revision']
def sql(v):
 if v is None:return 'null'
 if isinstance(v,bool):return str(v).lower()
 if isinstance(v,(float,int)):return str(v)
 return "'"+str(v).replace("'","''")+"'"
out=['-- Explicit SKU variants; non-destructive parent retirement.', 'update products set active=false where id in ('+','.join(map(sql,retire))+');']
for p in result:
 out.append('insert into products ('+','.join(fields)+') values ('+','.join(sql(p.get(f)) for f in fields)+') on conflict(id) do update set '+','.join(f+'=excluded.'+f for f in ['name','group_name','variant','deposit_cents','deposit_profile','data_note'])+';')
Path('supabase/migrations/202609170006_variants.sql').write_text('\n'.join(out)+'\n')
print(len(result),'active SKUs;',len(retire),'parent positions retired')
