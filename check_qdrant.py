import urllib.request
import json

QDRANT_URL = "https://8bfd69dd-6426-497a-abda-34605b39891d.eu-west-2-0.aws.cloud.qdrant.io"
QDRANT_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6Mzk2ZGQ1ZDAtZmNmNy00Y2M5LWJlMmItZGQ3ZDJlNzdmZjZjIn0.xEYYaV_3LdvJkGxGBzwuY_o0te-sETqYLwdI3WBUN6k"

url = QDRANT_URL.rstrip("/")
req = urllib.request.Request(
    f"{url}/collections/lux_chunks",
    headers={"api-key": QDRANT_API_KEY, "Content-Type": "application/json"}
)
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read())
        count = data["result"]["vectors_count"]
        print(f"✅ Collection exists")
        print(f"📦 Vectors in collection: {count}")
        if count == 0:
            print("⚠️  EMPTY — nothing indexed into Qdrant yet")
        else:
            print("✅ Vectors present — search should work")
except Exception as e:
    print(f"❌ Error: {e}")
