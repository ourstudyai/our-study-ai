import re

# ── FILE 1: chat/route.ts ──────────────────────────────────────────────────
path1 = "src/app/api/chat/route.ts"
with open(path1, 'r') as f:
    c1 = f.read()

fixes1 = [
    (
        "const qdrantResults = await hybridSearch(message, courseId, 12);",
        "const qdrantResults = await hybridSearch(message, courseId, 5);",
        "chunk count 12→5"
    ),
    (
        "        ...(Array.isArray(conversationHistory) ? conversationHistory : []),",
        "        ...(Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : []),",
        "history cap →6"
    ),
    (
        "lowConfidence = qdrantResults[0]?.score < 0.015;",
        "lowConfidence = qdrantResults[0]?.score < 0.005;",
        "lowConfidence threshold"
    ),
]

for old, new, label in fixes1:
    if old in c1:
        c1 = c1.replace(old, new)
        print(f"✅ {label}")
    else:
        print(f"❌ Not found: {label}")

# fix chunk text truncation
old_chunk = 'return `${pathLabel}\n${r.text}`;\n            }).join("\\n\\n");'
new_chunk = 'return `${pathLabel}\n${r.text.slice(0, 600)}`;\n            }).join("\\n\\n");'
if old_chunk in c1:
    c1 = c1.replace(old_chunk, new_chunk)
    print("✅ chunk size →600")
else:
    print("❌ Not found: chunk size")

with open(path1, 'w') as f:
    f.write(c1)

# ── FILE 2: course page - guard message + expose catch ────────────────────
path2 = "src/app/dashboard/course/[courseId]/page.tsx"
with open(path2, 'r') as f:
    c2 = f.read()

fixes2 = [
    (
        'if (!fullResponse.trim()) { fullResponse = "No response was returned. This typically means the query did not match any indexed material for this course, or the model returned an empty completion. Try rephrasing your question, narrowing the scope, or switching modes. If the problem persists, use the flag button to report it."; }',
        'if (!fullResponse.trim()) { fullResponse = "I didn\'t catch that — something interrupted the response. Try asking again."; }',
        "guard message"
    ),
    (
        "    } catch { }\n    finally { setIsStreaming(false); setIsAiLoading(false); }",
        "    } catch (err) { console.error('[sendMessage error]', err); }\n    finally { setIsStreaming(false); setIsAiLoading(false); }",
        "expose catch error"
    ),
]

for old, new, label in fixes2:
    if old in c2:
        c2 = c2.replace(old, new)
        print(f"✅ {label}")
    else:
        print(f"❌ Not found: {label}")

with open(path2, 'w') as f:
    f.write(c2)

print("\n✅ Done. Now commit and push.")
