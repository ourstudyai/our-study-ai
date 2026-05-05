path1 = "src/app/admin/page.tsx"
content = open(path1).read()

old1 = "async function setRole(uid: string, role: string) {\n    if (!isChiefAdmin) { alert('Only chief admin can change roles.'); return; }\n    setActionLoading(uid);"
new1 = "async function setRole(uid: string, role: string) {\n    if (!isChiefAdmin) { alert('Only chief admin can change roles.'); return; }\n    if (role === 'chief_admin' && !window.confirm('Promote this user to Chief Admin? They will have full administrative access.')) return;\n    if (role === 'student' && !window.confirm('Remove this admin role? They will lose all admin access.')) return;\n    setActionLoading(uid);"

assert old1 in content, "setRole NOT FOUND"
content = content.replace(old1, new1, 1)
open(path1, 'w').write(content)
print("Fix 1 done: setRole confirms")

path2 = "src/components/course/StudyMemoryPanel.tsx"
content2 = open(path2).read()

old2 = "    const deleteNote = async (noteId: string) => {\n        try {\n            await deleteDoc(doc(db, 'notes', noteId));"
new2 = "    const deleteNote = async (noteId: string) => {\n        if (!window.confirm('Delete this note? This cannot be undone.')) return;\n        try {\n            await deleteDoc(doc(db, 'notes', noteId));"

assert old2 in content2, "deleteNote NOT FOUND"
content2 = content2.replace(old2, new2, 1)
open(path2, 'w').write(content2)
print("Fix 2 done: deleteNote confirm")

print("All done.")
