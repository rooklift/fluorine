"use strict";

const alert = require("./modules/alert");
const ipcRenderer = require("electron").ipcRenderer;

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
        content: event.dataTransfer.files[0].path,
    });
    return false;
};
