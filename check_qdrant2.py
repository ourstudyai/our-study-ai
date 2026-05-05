import urllib.request
import json
import re

with open('.env.local') as f:
    env = f.read()

url = re.search(r'QDRANT_URL=(.+)', env).group(1).strip()
key = re.search(r'QDRANT_API_KEY=(.+)', env).group(1).strip()

req = urllib.request.Request(
    f"{url}/collections/lux_chunks",
    headers={"api-key": key, "Content-Type": "application/json"}
)
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read())
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"❌ Error: {e}")
