import urllib.request, json

messages = [
    'Tìm game 5 người, 500 - 900k',
    'Tìm game cho 4 người, khoảng 45 phút, dưới 700k, dễ chơi',
    '2 người 30 phút dưới 500k',
    'game 5-6 người, trên 900k, chiến thuật'
]

url = 'http://localhost:5000/api/chatbot/message'
for m in messages:
    payload = json.dumps({'message': m, 'sessionId': 'demo-01', 'userId': 1}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode('utf-8')
            obj = json.loads(body)
            print('INPUT:', m)
            text = obj.get('message', {}).get('text') or obj.get('reply') or obj.get('message')
            print('REPLY:', text)
            recs = obj.get('message', {}).get('recommendations') or obj.get('recommendations') or []
            print('TOP:')
            for r in recs[:5]:
                name = r.get('name')
                price = r.get('currentPrice') or r.get('price') or 0
                print('  -', name, '|', price)
    except Exception as e:
        print('INPUT:', m)
        print('ERROR:', e)
    print('----')
