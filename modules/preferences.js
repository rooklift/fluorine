"use strict";

const fs = require("fs");
const make = require("./utils").make;
const path = require("path");

const default_prefs = {
    integer_box_sizes: false,
    turns_start_at_one: false,
    triangles_show_next: true,
    grid_aesthetic: 1,
    last_monitored_replay_dirs: [],
    // Note: Don't make this a nested structure unless you're willing to make the code below more complex.
};

function get_prefs_file(app) {
    return path.join(app.getPath("userData"), "prefs.json");
}

exports.save_prefs = (app, prefs) => {
    let filename = get_prefs_file(app);
    try {
        fs.writeFileSync(filename, JSON.stringify(prefs));
    } catch (err) {
        console.log("Couldn't save preferences: ", err.message);
    }
}

exports.read_prefs = (app) => {
    const prefs = make({}, default_prefs);
    let filename = get_prefs_file(app);
    try {
        let f = fs.readFileSync(filename, "utf8");
        return Object.assign(prefs, JSON.parse(f));
    } catch (err) {
        console.log("Couldn't read preferences: ", err.message);
        console.log("Continuing with default preferences...");
        return prefs;
    }
}
