path = "src/app/api/chat/route.ts"

with open(path, 'r') as f:
    content = f.read()

old = "return `${pathLabel}\n${r.text.slice(0, 600)}`;"
new = "return `${pathLabel}\n${r.text.slice(0, 1200)}`;"

if old in content:
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print("✅ chunk size updated to 1200")
else:
    print("❌ Not found — chunk size may not have been set yet")
