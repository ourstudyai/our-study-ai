path = "src/app/dashboard/course/[courseId]/page.tsx"

with open(path, 'r') as f:
    content = f.read()

old = "    } catch { }\n    finally { setIsStreaming(false); setIsAiLoading(false); }"
new = "    } catch (err) { console.error('[sendMessage error]', err); }\n    finally { setIsStreaming(false); setIsAiLoading(false); }"

if old in content:
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print("✅ catch block fixed")
else:
    print("❌ not found")
