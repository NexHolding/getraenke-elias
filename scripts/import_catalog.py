import re,json
from pathlib import Path
text=Path('data/source-catalog.txt').read_text()
category=''; rows=[]
for line in text.splitlines():
 s=line.strip()
 for label in ['Mineralwasser','Limonade','Bier','Saft','Wein','Sekt','Für Ihre Feier']:
  if s.startswith(label) and ('Grundpreis' in s or s==label or s.startswith('Sekt –')): category=label
 m=re.match(r'^(.+?)\s{2,}(\d+,\d+)€\s+(\d+) x (\d+(?:,\d+)?)l\s+(\d+,\d+)€$',s)
 service=re.match(r'^(.+?)\s{2,}(\d+,\d+)€$',s) if category=='Für Ihre Feier' else None
 if m or service:
  name=m[1].strip() if m else service[1].strip()
  cents=lambda v: round(float(v.replace(',','.'))*100)
  rows.append(dict(id=f'elias-{len(rows)+1:03d}',sku=f'EL-{len(rows)+1:04d}',name=name,category=category,pack_count=int(m[3]) if m else 1,volume_ml=round(float(m[4].replace(',','.'))*1000) if m else 0,price_cents=cents(m[5] if m else service[2]),source_unit_price_cents=cents(m[2]) if m else None,deposit_cents=None,tax_rate=19,deposit_tax_rate=19,stock=None,min_stock=0,target_stock=0,supplier_id='demo-supplier',reorder_enabled=False,active=True,verified=False,barcode='',source='Lieferliste Februar 2026',kind='rental' if service else 'beverage'))
assert len(rows)==108,len(rows)
Path('data/catalog.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(f'{len(rows)} Artikel importiert; Pfand und Bestand unbekannt, Preise unbestätigt.')
