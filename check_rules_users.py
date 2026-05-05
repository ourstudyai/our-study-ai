with open('firestore.rules') as f:
    content = f.read()

# Find and print the users block
start = content.find('match /users/{uid}')
print(repr(content[start:start+500]))
