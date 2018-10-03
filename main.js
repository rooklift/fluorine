"use strict";

const alert = require("./modules/alert");
const electron = require("electron");
const ipcMain = require("electron").ipcMain;
const path = require("path");
const windows = require("./modules/windows");

let about_message = `Fluorine: Replay viewer for Halite 3\n` +
					`--\n` +
					`Electron ${process.versions.electron}\n` +
					`Node ${process.versions.node}\n` +
					`V8 ${process.versions.v8}`

// -------------------------------------------------------

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true;		// FIXME: this is lame. What's the correct way to prevent the console warning?

electron.app.on("ready", () => {

	windows.new("renderer", {
		title: "Fluorine", show: true, width: 800, height: 800, resizable: true, page: path.join(__dirname, "fluorine_renderer.html")
	});

	windows.new("info", {
		title: "Info", show: false, width: 400, height: 800, resizable: true, page: path.join(__dirname, "fluorine_info.html")
	});

	electron.Menu.setApplicationMenu(make_main_menu());
});

electron.app.on("window-all-closed", () => {
	electron.app.quit();
});

// -------------------------------------------------------

ipcMain.on("renderer_ready", () => {

	// Load a file via command line with -o filename.

	let filename = "";
	for (let i = 0; i < process.argv.length - 1; i++) {
		if (process.argv[i] === "-o") {
			filename = process.argv[i + 1];
		}
	}
	if (filename !== "") {
		windows.send("renderer", "open", filename);
	}

	// Or, if exactly 1 arg, assume it's a filename.
	// Only good for standalone release.

	else if (process.argv.length === 2 && path.basename(process.argv[0]) !== "electron" && path.basename(process.argv[0]) !== "electron.exe") {
		windows.send("renderer", "open", process.argv[1]);
	}

});

ipcMain.on("relay", (event, msg) => {
	windows.send(msg.receiver, msg.channel, msg.content);		// Messages from one browser window to another...
});

// -------------------------------------------------------

function make_main_menu() {
	const template = [
		{
			label: "File",
			submenu: [
				{
					label: "About...",
					click: () => {
						alert(about_message);
					}
				},
				{
					type: "separator"
				},
				{
					role: "toggledevtools"
				},
				{
					type: "separator"
				},
				{
					label: "Open...",
					accelerator: "CommandOrControl+O",
					click: () => {
						let files = electron.dialog.showOpenDialog();
						if (files && files.length > 0) {
							windows.send("renderer", "open", files[0]);
						}
					}
				},
				{
					type: "separator"
				},
				{
					label: "Save decompressed JSON...",
					accelerator: "CommandOrControl+S",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save", outfilename);
						}
					}
				},
				{
					label: "Save current frame...",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save_frame", outfilename);
						}
					}
				},
				{
					label: "Save current entities...",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save_entities", outfilename);
						}
					}
				},
				{
					label: "Save current moves...",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save_moves", outfilename);
						}
					}
				},
				{
					type: "separator"
				},
				{
					accelerator: "CommandOrControl+Q",
					role: "quit"
				},
			]
		},
		{
			label: "Navigation",
			submenu: [
				{
					label: "Forward",
					accelerator: "Right",
					click: () => {
						windows.send("renderer", "forward", 1);
					}
				},
				{
					label: "Back",
					accelerator: "Left",
					click: () => {
						windows.send("renderer", "forward", -1);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Move to start",
					accelerator: "Home",
					click: () => {
						windows.send("renderer", "forward", -99999);
					}
				},
				{
					label: "Move to end",
					accelerator: "End",
					click: () => {
						windows.send("renderer", "forward", 99999);
					}
				},
			]
		},
		{
			label: "View",
			submenu: [
				{
					label: "Integer box sizes",
					type: "checkbox",
					click: (menuItem) => {
						if (menuItem.checked) {
							windows.send("renderer", "set", ["integer_box_sizes", true]);
						} else {
							windows.send("renderer", "set", ["integer_box_sizes", false]);
						}
					}
				},
				{
					type: "separator"
				},
				{
					label: "Up",
					accelerator: "W",
					click: () => {
						windows.send("renderer", "down", 1);
					}
				},
				{
					label: "Left",
					accelerator: "A",
					click: () => {
						windows.send("renderer", "right", 1);
					}
				},
				{
					label: "Down",
					accelerator: "S",
					click: () => {
						windows.send("renderer", "down", -1);
					}
				},
				{
					label: "Right",
					accelerator: "D",
					click: () => {
						windows.send("renderer", "right", -1);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Reset camera",
					click: () => {
						windows.send("renderer", "set", ["offset_x", 0]);
						windows.send("renderer", "set", ["offset_y", 0]);
					}
				},
				{
					label: "Clear selection",
					accelerator: "Escape",
					click: () => {
						windows.send("renderer", "set", ["selection", null]);
					}
				},
			]
		},
		{
			label: "Windows",
			submenu: [
				{
					label: "Renderer",
					click: () => {
						windows.show("renderer");
					}
				},
				{
					label: "Info",
					click: () => {
						windows.show("info");
					}
				},
			]
		},
	];

	return electron.Menu.buildFromTemplate(template);
}
