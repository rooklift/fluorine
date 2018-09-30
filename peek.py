import code, json

with open("example.json") as f:
	j = json.load(f)

print("Loaded JSON object as j. All keys in j:")
print()

for key in j:
	print("  " + key)

print()

code.interact(local=locals())
