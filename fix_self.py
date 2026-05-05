path = "src/app/admin/page.tsx"
content = open(path).read()

old1 = "  async function handleDelete(uid: string) {\n    if (!isChiefAdmin) { alert('Only chief admin can delete users. Please contact chief admin.'); return; }"
new1 = "  async function handleDelete(uid: string) {\n    if (!isChiefAdmin) { alert('Only chief admin can delete users. Please contact chief admin.'); return; }\n    if (uid === firebaseUser?.uid) { alert('You cannot delete your own account.'); return; }"

old2 = "  async function handleDeactivate(uid: string) {\n    if (!isChiefAdmin) { alert('Only chief admin can deactivate users.'); return; }"
new2 = "  async function handleDeactivate(uid: string) {\n    if (!isChiefAdmin) { alert('Only chief admin can deactivate users.'); return; }\n    if (uid === firebaseUser?.uid) { alert('You cannot deactivate your own account.'); return; }"

assert old1 in content, "handleDelete NOT FOUND"
assert old2 in content, "handleDeactivate NOT FOUND"
content = content.replace(old1, new1, 1).replace(old2, new2, 1)
open(path, 'w').write(content)
print("Done")
