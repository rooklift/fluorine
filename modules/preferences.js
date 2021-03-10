"use strict";

const electron = require("electron");
const fs = require("fs");
const make = require("./utils").make;
const path = require("path");
const querystring = require("querystring");

const default_prefs = {

    // Note: Don't make this a nested structure unless you're
    // willing to make the code below more complex.

    integer_box_sizes: false,
    turns_start_at_one: false,
    triangles_show_next: true,
    grid_aesthetic: 1,
    last_monitored_replay_dirs: [],
    last_flog_directory: null,
    last_replay_directory: null

};

function get_prefs_file() {
    return electron.app ?
        path.join(electron.app.getPath("userData"), "prefs.json") :                                 // in Main process
        path.join(querystring.parse(global.location.search)["?user_data_path"], "prefs.json");      // in Renderer process
}

exports.save_prefs = (prefs) => {
    let filename = get_prefs_file();
    try {
        fs.writeFileSync(filename, JSON.stringify(prefs));
    } catch (err) {
        console.log("Couldn't save preferences: ", err.message);
    }
}

exports.read_prefs = () => {
    const prefs = make({}, default_prefs);
    let filename = get_prefs_file();
    try {
        let f = fs.readFileSync(filename, "utf8");
        return Object.assign(prefs, JSON.parse(f));
    } catch (err) {
        console.log("Couldn't read preferences: ", err.message);
        console.log("Continuing with default preferences...");
        return prefs;
    }
}
