import requests
from dotenv import dotenv_values

env = dotenv_values(".env.local")
QDRANT_URL = env["QDRANT_URL"]
QDRANT_API_KEY = env["QDRANT_API_KEY"]

headers = {"api-key": QDRANT_API_KEY, "Content-Type": "application/json"}

r1 = requests.put(f"{QDRANT_URL}/collections/lux_chunks/index", headers=headers, json={"field_name": "materialId", "field_schema": "keyword"})
print("materialId index:", r1.status_code, r1.json())

r2 = requests.put(f"{QDRANT_URL}/collections/lux_chunks/index", headers=headers, json={"field_name": "courseId", "field_schema": "keyword"})
print("courseId index:", r2.status_code, r2.json())
