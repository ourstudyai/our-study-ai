path = "src/app/api/chat/route.ts"

with open(path, 'r') as f:
    content = f.read()

# Fix 1: lower lowConfidence threshold
old1 = "lowConfidence = qdrantResults[0]?.score < 0.015;"
new1 = "lowConfidence = qdrantResults[0]?.score < 0.005;"

# Fix 2: expose the real error in the catch block
old2 = "    } catch { }\n    finally { setIsStreaming(false); setIsAiLoading(false); }"
new2 = "    } catch (err) { console.error('[sendMessage error]', err); }\n    finally { setIsStreaming(false); setIsAiLoading(false); }"

if old1 in content:
    content = content.replace(old1, new1)
    print("✅ lowConfidence threshold fixed")
else:
    print("❌ threshold line not found")

if old2 in content:
    content = content.replace(old2, new2)
    print("✅ silent catch fixed")
else:
    print("❌ catch block not found — check manually")

with open(path, 'w') as f:
    f.write(content)
