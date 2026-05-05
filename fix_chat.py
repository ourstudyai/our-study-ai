import re

# Fix 1: system prompt - remove wait for confirmation
path1 = "src/lib/gemini/system-prompts.ts"
c = open(path1).read()
old1 = '- When NO course material is available, say warmly: \\"I don\'t have your course materials for this topic yet. I can answer from my knowledge base — shall I go ahead? Or you could try Research mode for deeper sourced answers.\\" Wait for confirmation before proceeding.\n- NEVER silently switch sources without telling the student.'
new1 = '- When NO course material matches the query, briefly note it naturally then immediately answer from your own knowledge — do NOT wait for permission.\n- For greetings, general conversation, or questions clearly unrelated to course content, respond naturally without any disclaimer.\n- For course-specific questions where material exists but does not cover the exact point, say so briefly then answer from your knowledge.\n- NEVER refuse to answer or stall. Always be helpful, warm, and direct.'
assert old1 in c, "system prompt target NOT FOUND"
open(path1, 'w').write(c.replace(old1, new1, 1))
print("Fix 1 done: system prompt")

# Fix 2: lower lowConfidence threshold from 0.015 to 0.005
path2 = "src/app/api/chat/route.ts"
c2 = open(path2).read()
old2 = "lowConfidence = qdrantResults[0]?.score < 0.015;"
new2 = "lowConfidence = qdrantResults[0]?.score < 0.005;"
assert old2 in c2, "threshold NOT FOUND"
open(path2, 'w').write(c2.replace(old2, new2, 1))
print("Fix 2 done: lowConfidence threshold")

print("All done.")
