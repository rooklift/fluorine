import os, subprocess, sys

# Dragging a file onto this script launches the app and opens the file, at least in Windows...

directory = os.path.dirname(os.path.realpath(__file__))		# directory of the app

if len(sys.argv) > 1:
	print(sys.argv[1])
	subprocess.Popen("electron {} -o \"{}\"".format(directory, sys.argv[1]), shell = True)
else:
	subprocess.Popen("electron {}".format(directory), shell = True)
