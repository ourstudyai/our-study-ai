path = "src/app/admin/page.tsx"
old = "onClick={() => handleQuarantine(selected)}"
new = "onClick={() => { if (!window.confirm('Quarantine this material? It will be hidden from students.')) return; handleQuarantine(selected); }}"
content = open(path).read()
assert old in content, "NOT FOUND"
open(path, 'w').write(content.replace(old, new, 1))
print("Done")
