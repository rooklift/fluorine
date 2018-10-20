"use strict";

const fs = require("fs");
const path = require("path");
const {make, assign_without_overwrite} = require("./utils");

const default_prefs = {
    integer_box_sizes: false,
    turns_start_at_one: false,
    triangles_show_next: true,
    grid_aesthetic: 1,
    // Note: Don't make this a nested structure unless you're willing to make the code below more complex.
};

function get_prefs_file(app) {
    return path.join(app.getPath("userData"), "prefs.json");
}


exports.save_prefs = (app, prefs) => {
    let filename = get_prefs_file(app);
    fs.writeFileSync(filename, JSON.stringify(prefs));
}

exports.read_prefs = (app) => {
    const prefs = make({}, default_prefs);
    let filename = get_prefs_file(app);
    try {
        let f = fs.readFileSync(filename, "utf8");
        return Object.assign(prefs, JSON.parse(f));
    } catch (err) {
        console.warn("Couldn't read preferences: ", err.message);
    }
    return prefs;
}
