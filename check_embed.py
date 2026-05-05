import urllib.request
import json
import re

with open('.env.local') as f:
    env = f.read()

key = re.search(r'MISTRAL_API_KEY=(.+)', env).group(1).strip()

data = json.dumps({
    "model": "mistral-embed",
    "input": ["test query about sacred scripture"]
}).encode()

req = urllib.request.Request(
    "https://api.mistral.ai/v1/embeddings",
    data=data,
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}"
    },
    method="POST"
)
try:
    with urllib.request.urlopen(req) as res:
        result = json.loads(res.read())
        vec = result["data"][0]["embedding"]
        print(f"✅ Mistral embed working")
        print(f"📐 Vector dimensions: {len(vec)}")
except Exception as e:
    print(f"❌ Mistral embed failed: {e}")
