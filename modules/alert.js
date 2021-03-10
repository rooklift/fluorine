"use strict";

const electron = require("electron");
const ipcRenderer = require("electron").ipcRenderer;

function object_to_string(o) {
	let msg = JSON.stringify(o);
	return msg;
}

function alert_main(msg) {
	electron.dialog.showMessageBox({
		message: msg.toString(),
		title: "Alert",
		buttons: ["OK"]
	}, () => {});			// Providing a callback makes the window not block the process
}

function alert_renderer(msg) {
	ipcRenderer.send("alert", msg.toString());
}

module.exports = (msg) => {
	if (typeof(msg) === "object") {
		msg = object_to_string(msg);
	}
	if (typeof(msg) === "undefined") {
		msg = "undefined";
	}
	if (typeof(msg) === "number") {
		msg = msg.toString();
	}
	msg = msg.trim()
	if (process.type === "renderer") {
		alert_renderer(msg);
	} else {
		alert_main(msg);
	}
}
