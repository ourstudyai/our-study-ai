with open('.env.local') as f:
    for line in f:
        if line.strip() and not line.startswith('#'):
            key = line.split('=')[0].strip()
            print(key)
