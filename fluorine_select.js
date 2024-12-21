"use strict";

const ipcRenderer = require("electron").ipcRenderer;

let webUtils = require("electron").webUtils;			// Needed from Electron v32 since can't access .path:
const get_path_for_file = (webUtils && webUtils.getPathForFile) ? webUtils.getPathForFile : file => file.path;

// Event to focus input in the actual box...

ipcRenderer.on("focus_input", () => {
	document.getElementById("sid").focus();
});

// Setup return key on input box...

document.getElementById("sid").onkeydown = function(event) {
	if (event.keyCode == 13) {
		let input_sid = document.getElementById("sid");
		let sid = parseInt(input_sid.value, 10);

		input_sid.value = "";

		if (!Number.isNaN(sid)) {

			ipcRenderer.send("relay", {
				receiver: "renderer",
				channel: "stop_autoplay",
				content: null,
			});

			ipcRenderer.send("relay", {
				receiver: "renderer",
				channel: "select_sid",
				content: sid,
			});
		}

		ipcRenderer.send("show_window", "renderer");    // Renderer to front.
		ipcRenderer.send("hide_window", "selector");
	}
};

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
