"use strict";

const electron = require("electron");
const path = require("path");
const url = require("url");
const assign_without_overwrite = require("./utils").assign_without_overwrite;

const all_windows = Object.create(null);	// Map of token --> window.

exports.new = (token, params = {}) => {		// token is an internal name for us to refer to the window by.

	if (all_windows[token]) {
		alert("windows.js: Asked to create window with token '" + token + "' which already exists!");
		return;
	}

	let defaults = {title: "Title", show: true, width: 600, height: 400, resizable: true, page: path.join(__dirname, "index.html")};
	assign_without_overwrite(params, defaults);

	// The screen may be zoomed, we can compensate...

	let zoom_factor = 1 / electron.screen.getPrimaryDisplay().scaleFactor;

	let win = new electron.BrowserWindow({
		title: params.title,
		show: params.show,
		width: params.width * zoom_factor,
		height: params.height * zoom_factor,
		backgroundColor: "#000000",
		useContentSize: true,
		resizable: params.resizable,
		webPreferences: { zoomFactor: zoom_factor }
	});

	win.loadURL(url.format({
		protocol: "file:",
		pathname: params.page,
		slashes: true
	}));

	win.setMenu(null);

	all_windows[token] = win;

	win.on("close", (evt) => {
		evt.preventDefault();
		win.hide();
		quit_if_all_windows_are_hidden();
	});

	win.on("hide", () => {
		quit_if_all_windows_are_hidden();
	});
};

exports.change_zoom = (token, diff) => {
	if (all_windows[token] === undefined) {
		return
	}
	let contents = all_windows[token].webContents;
	contents.getZoomFactor((val) => {
		if (val + diff >= 0.2) {
			contents.setZoomFactor(val + diff);
		}
	});
};

exports.set_zoom = (token, val) => {
	if (all_windows[token] === undefined) {
		return
	}
	let contents = all_windows[token].webContents;
	contents.setZoomFactor(val);
};

exports.send = (token, channel, msg) => {
	if (all_windows[token] === undefined) {
		return
	}
	let contents = all_windows[token].webContents;
	contents.send(channel, msg);
};

exports.set_menu = (token, menu) => {

	// Set an individual window's menu. Has some issues with OS X.

	if (all_windows[token] === undefined) {
		return
	}
	all_windows[token].setMenu(menu);
}

exports.show = (token) => {
	if (all_windows[token] === undefined) {
		return
	}
	all_windows[token].show();
}

exports.get_window = (token) => {
	return all_windows[token];
}

function quit_if_all_windows_are_hidden() {
	let keys = Object.keys(all_windows);
	for (let n = 0; n < keys.length; n++) {
		let key = keys[n];
		let win = all_windows[key];
		try {
			if (win.isVisible()) {
				return;
			}
		} catch (e) {
			// Can fail at end of app life when the window has been destroyed.
		}
	}

	electron.app.exit();						// Why doesn't quit work?
}
