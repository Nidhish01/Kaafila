"""Train Kaafila's compact, task-specific text classifier from scratch.

Python standard library only. No API key, pretrained weights, or network call.
Two multinomial Naive Bayes heads use word unigrams/bigrams and character
trigrams. The TypeScript inference engine implements identical features.
Held-out event phrase families never appear in the training corpus.
"""
import collections
import hashlib
import itertools
import json
import math
from pathlib import Path
import random
import re

ROOT = Path(__file__).resolve().parent
RNG = random.Random(42)
EVENTS = {
    'weather': ['heavy rainfall flooded the road', 'flood water blocks the highway', 'a storm has closed the route', 'landslides blocked the delivery road', 'monsoon rain disrupted transport', 'a cyclone warning suspended deliveries', 'severe weather stopped the trucks', 'the bridge is underwater after flooding', 'rain washed out the access road', 'dense fog has closed the highway', 'a thunderstorm forced a road closure', 'weather alerts report flooding on the route', 'flash floods are blocking inbound deliveries', 'storm damage has cut road access', 'the road is impassable after heavy rains', 'a flood warning has suspended distribution'],
    'demand': ['demand has surged unexpectedly', 'festive sales have doubled', 'customer orders jumped above forecast', 'a festival caused a demand spike', 'sales are running at triple the normal rate', 'a promotion increased customer purchases', 'panic buying is clearing store shelves', 'the sales forecast underestimated demand', 'weekend demand is higher than expected', 'retail orders exceed the planned volume', 'a local event created a sudden sales surge', 'shoppers are buying twice the usual volume', 'festival demand is exhausting store stock', 'unexpected customer demand is outpacing supply', 'sales volumes spiked during a promotion', 'a surge in purchases caused replenishment pressure'],
    'supplier': ['the supplier short shipped the order', 'the vendor cancelled the shipment', 'the factory stopped production', 'the supplier cannot fulfil the purchase order', 'the wholesaler delivered only half the order', 'a supplier stockout cancelled the dispatch', 'the manufacturer has a production outage', 'the vendor has no stock available', 'the supplier missed its committed shipment', 'a factory shutdown cut incoming supply', 'the supplier reported a material shortage', 'the vendor delivered fewer units than ordered', 'the purchase order was rejected by the supplier', 'the wholesaler ran out of inventory', 'a production failure left the order incomplete', 'the supplier cancelled a scheduled dispatch'],
    'cold-chain': ['the refrigeration unit failed', 'the shipment exceeded the safe temperature', 'a cold chain breach spoiled the cargo', 'the temperature logger reported a breach', 'the chilled stock warmed during transport', 'the truck cooling system broke down', 'temperature abuse makes the shipment unsafe', 'the refrigerated delivery must be quarantined', 'cold storage lost power and goods warmed', 'a temperature excursion compromised the load', 'the cold chain was broken in transit', 'the chiller failed and the shipment is unsafe', 'the delivery failed its temperature check', 'the refrigerated cargo is spoiled', 'unsafe temperature requires stock quarantine', 'the freezer malfunctioned during the journey'],
    'delay': ['the delivery truck is running late', 'traffic congestion delayed the shipment', 'the truck broke down on the highway', 'a driver shortage delayed dispatch', 'the delivery vehicle has a flat tyre', 'the shipment is stuck at a toll checkpoint', 'the carrier revised its arrival time', 'a transport strike stopped the delivery truck', 'the vehicle is waiting for a replacement driver', 'a traffic jam slowed the inbound truck', 'the logistics provider reported a transit delay', 'the truck needs a mechanical repair', 'a route diversion increased transit time', 'the delivery is behind schedule', 'the vehicle missed the unloading slot', 'the carrier has a late arrival alert'],
}
HOLDOUT = {
    'weather': ['roads are flooded by heavy rain', 'storm flooding made the route inaccessible', 'severe monsoon weather shut the bridge', 'rainwater on the highway stopped transport'],
    'demand': ['customer demand rose sharply during festival sales', 'a promotion has caused sales to surge', 'unexpected purchases are exhausting shelf stock', 'orders are twice the usual demand forecast'],
    'supplier': ['our supplier has failed to ship the full order', 'the factory cannot produce the promised shipment', 'the vendor shortfall leaves replenishment incomplete', 'the wholesaler cancelled our incoming supply'],
    'cold-chain': ['the load must be quarantined after a temperature excursion', 'refrigeration stopped working and the cargo warmed up', 'unsafe chilled stock failed the cold chain inspection', 'a faulty chiller spoiled the delivery'],
    'delay': ['our delivery is late because of a traffic jam', 'the carrier says the truck needs repairs', 'driver availability pushed back the arrival', 'the vehicle is delayed at the unloading checkpoint'],
}
PRODUCTS = {
    'milk': ['fresh milk', 'milk packs', 'dairy milk', 'milk cartons', 'pasteurised milk', 'toned milk', 'doodh packets', 'milk pouches'],
    'bread': ['bread loaves', 'whole wheat bread', 'sliced bread', 'bread packets', 'bakery bread', 'sandwich loaves', 'fresh bread', 'white bread'],
    'rice': ['rice bags', 'basmati rice', 'rice sacks', '5 kg rice', 'staple rice', 'brown rice', 'chawal bags', 'rice packets'],
    'medicine': ['essential care kits', 'medicine kits', 'medical supplies', 'pharmacy kits', 'healthcare packs', 'first aid kits', 'medicines', 'care kits'],
}
CITIES = ['Patiala', 'Ambala', 'Chandigarh', 'Ludhiana', 'Karnal', 'Panipat']
FRAMES = ['{event}. {product} deliveries to {city} are affected. Replenishment is {hours} hours away.', '{city} alert: {event}; the affected item is {product}. Next supply in {hours}h.', 'For {product} at {city}, {event}. We have a {hours} hour replenishment gap.', 'Operations update: {event}. Please assess {product} stock in {city} until delivery in {hours} hrs.']

def features(text):
    words = re.findall(r'[a-z]+', text.lower())
    result = ['w:'+w for w in words]
    result += ['b:'+a+'_'+b for a,b in zip(words, words[1:])]
    for word in words:
        if len(word) >= 3:
            padded = '^'+word+'$'
            result.extend('c:'+padded[i:i+3] for i in range(len(padded)-2))
    return collections.Counter(result)

def corpus(event_groups, heldout=False):
    rows=[]
    for event, phrases in event_groups.items():
        for pi, phrase in enumerate(phrases):
            for product, names in PRODUCTS.items():
                for ni, name in enumerate(names):
                    city=CITIES[(pi+ni)%len(CITIES)]
                    hours=[3,8,12,18,24,30,48][(pi+ni)%7]
                    frame=FRAMES[(pi+ni)%len(FRAMES)] if not heldout else 'Urgent note for {city}: {product}. {event}; supply returns in {hours} hours.'
                    rows.append({'text':frame.format(event=phrase,product=name,city=city,hours=hours),'type':event,'product':product})
    return rows

def train(rows, key, vocabulary):
    labels=sorted(set(r[key] for r in rows))
    counts={label:collections.Counter() for label in labels}
    label_counts=collections.Counter()
    for row in rows:
        counts[row[key]].update(features(row['text']));label_counts[row[key]]+=1
    alpha=.5
    logs=[]
    for label in labels:
        total=sum(counts[label][f] for f in vocabulary)+alpha*len(vocabulary)
        logs.append([round(math.log((counts[label][f]+alpha)/total),7) for f in vocabulary])
    return {'labels':labels,'logPrior':[math.log(label_counts[l]/len(rows)) for l in labels],'logLikelihood':logs}

def predict(text, head, vocab):
    f=features(text)
    scores=[prior+sum(f.get(token,0)*head['logLikelihood'][i][j] for j,token in enumerate(vocab)) for i,prior in enumerate(head['logPrior'])]
    return head['labels'][max(range(len(scores)),key=scores.__getitem__)]

if __name__=='__main__':
    train_rows=corpus(EVENTS);test_rows=corpus(HOLDOUT,True)
    frequency=collections.Counter()
    for row in train_rows:frequency.update(features(row['text']).keys())
    vocabulary=sorted(f for f,count in frequency.items() if count>=3)
    model={'name':'Kaafila AlertNet','version':'1.0.0','architecture':'Two multinomial Naive Bayes text-classification heads','seed':42,'trainingExamples':len(train_rows),'vocabulary':vocabulary,'temperature':3.0,'heads':{key:train(train_rows,key,vocabulary) for key in ['type','product']}}
    report={'dataset':'Authored synthetic English retail alerts; not real retailer data','split':'Held-out event phrase families and a separate sentence frame','trainExamples':len(train_rows),'testExamples':len(test_rows),'vocabularySize':len(vocabulary),'heads':{},'limitations':['Template-based evaluation is easier than real retailer messages.','Scores are uncalibrated model scores, not probabilities of correctness.','English domain classifier, not a general-purpose language model.','Cities and quantities use explicit extraction rules and require human confirmation.','Negation, multiple products, conflicting events and unfamiliar wording may require manual review.']}
    for key,head in model['heads'].items():
        predictions=[predict(row['text'],head,vocabulary) for row in test_rows]
        correct=sum(p==r[key] for p,r in zip(predictions,test_rows))
        matrix={label:{other:0 for other in head['labels']} for label in head['labels']}
        for row,prediction in zip(test_rows,predictions):matrix[row[key]][prediction]+=1
        report['heads'][key]={'correct':correct,'accuracy':round(correct/len(test_rows),4),'confusionMatrix':matrix}
    raw=json.dumps(model,separators=(',',':'))
    (ROOT/'alertnet.json').write_text(raw,encoding='utf-8')
    report['modelSha256']=hashlib.sha256(raw.encode()).hexdigest()
    (ROOT/'evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    (ROOT/'training-data.jsonl').write_text('\n'.join(json.dumps(r) for r in train_rows)+'\n',encoding='utf-8')
    (ROOT/'holdout-data.jsonl').write_text('\n'.join(json.dumps(r) for r in test_rows)+'\n',encoding='utf-8')
    # Portable parity cases prove JS uses the same feature extraction and weights.
    (ROOT/'parity-cases.json').write_text(json.dumps([{'text':r['text'],'type':predict(r['text'],model['heads']['type'],vocabulary),'product':predict(r['text'],model['heads']['product'],vocabulary)} for r in test_rows[::16]],indent=2),encoding='utf-8')
    print(json.dumps({**report,'modelBytes':len(raw)},indent=2))
