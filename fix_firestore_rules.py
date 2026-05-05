with open('firestore.rules') as f:
    content = f.read()

old = 'match /users/{uid} {\n    allow read: if isAuth() && (isOwner(uid) || isAdminOrSupreme());\n        allow create: if isAuth() && isOwner(uid);\n        allow update: if isAuth() && (\n            (isOwner(uid) && !(\'role\' in request.resource.data.diff(resource.data).affectedKeys())) ||\n            isChiefAdmin() || isSupreme()\n        );\n    allow delete: if isSupreme();\n    }'

new = 'match /users/{uid} {\n    allow read: if isAuth() && (isOwner(uid) || isAdminOrSupreme());\n        allow create: if isAuth() && isOwner(uid);\n        allow update: if isAuth() && (\n            (isOwner(uid) && !(\'role\' in request.resource.data.diff(resource.data).affectedKeys())) ||\n            isChiefAdmin() || isSupreme()\n        );\n    allow delete: if isSupreme();\n\n      match /chatSessions/{sessionId} {\n        allow read, write: if isAuth() && isOwner(uid);\n      }\n      match /chatArchive/{archiveId} {\n        allow read, write: if isAuth() && isOwner(uid);\n      }\n      match /notes/{noteId} {\n        allow read, write: if isAuth() && isOwner(uid);\n      }\n    }'

if old in content:
    content = content.replace(old, new)
    with open('firestore.rules', 'w') as f:
        f.write(content)
    print("✅ Done")
else:
    # Try a simpler approach - just append subcollections before closing brace
    import re
    pattern = r'(match /users/\{uid\} \{[^}]+\})\s*\n(\s*\n\s*// Courses)'
    subcols = '\n\n      match /chatSessions/{sessionId} {\n        allow read, write: if isAuth() && isOwner(uid);\n      }\n      match /chatArchive/{archiveId} {\n        allow read, write: if isAuth() && isOwner(uid);\n      }\n      match /notes/{noteId} {\n        allow read, write: if isAuth() && isOwner(uid);\n      }\n    }\n\n    // Courses'
    result = re.sub(pattern, subcols, content, flags=re.DOTALL)
    if result != content:
        with open('firestore.rules', 'w') as f:
            f.write(result)
        print("✅ Done via regex")
    else:
        print("❌ Still not found - printing users block for inspection")
        start = content.find('match /users/{uid}')
        end = content.find('// Courses')
        print(repr(content[start:end]))
