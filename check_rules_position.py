with open('firestore.rules') as f:
    content = f.read()

start = content.find('match /users/{uid}')
print(content[start:start+800])
