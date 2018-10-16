# Fluorine

![Fluorine Screenshot](https://user-images.githubusercontent.com/16438795/46572697-29432d80-c982-11e8-8890-43516df4f997.png)

This is a replay viewer for [Halite 3](https://halite.io/).

# Installation

If you have npm and [Electron](https://electron.atom.io/) installed globally, you can do:

```
npm install
electron .
```

If you only have npm, and don't want to install Electron globally, I'm told the following works instead:

```
npm install
npm install electron --save-dev --save-exact
./node_modules/.bin/electron .
```

# Building

Once the dependencies are installed, it should be possible to build a standalone application with `npm run pack` but for Windows there's also a pre-built application in the *Releases* section of this repo.

# Other dependencies

* [node-zstandard](https://www.npmjs.com/package/node-zstandard) (gets installed by `npm install`)

# Usage

Open a file from the menu, or via command line with `electron . -o filename.hlt`. Drag-and-dropping a file onto the window may also work. Once a file is opened, navigate with left and right arrow keys.

# Thanks

Thanks to Snaar, Shummie, Ewirkerman, and Lidavidm for helpful discussions. *Fluorine* was developed during the beta phase of Halite 3 despite me not actually being in the beta, so I relied on them for information.
