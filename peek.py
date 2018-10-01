import code, json, pprint

with open("example.json") as f:
	j = json.load(f)

print("Loaded JSON object as j. All keys in j:")
print()

for key in j:
	print("  " + key)

print()
print("Pretty printer assigned as function p()")
print()

p = pprint.pprint

code.interact(local=locals())
