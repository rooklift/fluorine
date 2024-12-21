"use strict";

const alert = require("./modules/alert");
const ipcRenderer = require("electron").ipcRenderer;

let webUtils = require("electron").webUtils;			// Needed from Electron v32 since can't access .path:
const get_path_for_file = (webUtils && webUtils.getPathForFile) ? webUtils.getPathForFile : file => file.path;

ipcRenderer.on("update", (event, msg) => {
	let content = document.getElementById("content");
	content.innerHTML = msg;
});

// Setup drag-and-drop...

window.ondragover = () => false;
window.ondragleave = () => false;
window.ondragend = () => false;

window.ondrop = (event) => {
	event.preventDefault();
	ipcRenderer.send("relay", {
		receiver: "renderer",
		channel: "open",
		content: get_path_for_file(event.dataTransfer.files[0]),
	});
	ipcRenderer.send("stop_monitoring", null);
	return false;
};
