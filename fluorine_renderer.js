"use strict";

const alert = require("./modules/alert");
const fs = require("fs");
const ipcRenderer = require("electron").ipcRenderer;
const path = require("path");
const read_prefs = require("./modules/preferences").read_prefs;
const stream = require("stream");

let webUtils = require("electron").webUtils;			// Needed from Electron v32 since can't access .path:
const get_path_for_file = (webUtils && webUtils.getPathForFile) ? webUtils.getPathForFile : file => file.path;

let zstd;

try {
	zstd = require("node-zstandard");
} catch (err) {
	alert("Couldn't load zstd module. This can usually be fixed by running \"npm install\" but until then, Fluorine can still open JSON replays.");
}

const ranks = ["???", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th", "13th", "14th", "15th", "16th"];
const colours = ["#c5ec98", "#ff9999", "#ffbe00", "#66cccc", "#bf00ff", "#007fff", "#f6ff60", "#f3b5ff", "#31c110", "#ff8465", "#007256", "#ff0000", "#344983", "#92152e", "#00ffbf", "#b07504"];
const explosion_colour = "#ff0000";

const flog_concat_string = " ";

const canvas = document.getElementById("canvas");
const infobox = document.getElementById("infobox");
const context = canvas.getContext("2d");

function make_renderer() {

	let renderer = Object.create(null);

	// Many of these declarations could be harmlessly omitted
	// but they're for documentation as much as anything...

	renderer.game = null;
	renderer.filename = "";
	renderer.loadtime = 0;
	renderer.turn = 0;
	renderer.selection = null;
	renderer.width = 0;
	renderer.height = 0;

	renderer.flog = null;
	renderer.flog_colours = null;

	renderer.autoplay_iid = null;

	renderer.production_list = null;
	renderer.dropoff_list = null;
	renderer.sid_pid_map = null;
	renderer.collision_data = null;
	renderer.self_loss_counts = null;
	renderer.build_counts = null;
	renderer.mined_counts = null;
	renderer.inspired_counts = null;
	renderer.burn_counts = null;
	renderer.scrap_counts = null;
	renderer.absorbed_counts = null;

	renderer.initial_halite = 0;

	renderer.offset_x = 0;
	renderer.offset_y = 0;

	renderer.prefs = read_prefs();

	// --------------------------------------------------------------

	renderer.new_ship_info_object = (sid, pid, x, y, energy, is_inspired) => {
		let o = Object.create(null);
		o.sid = +sid;                   // Cast to number just in case
		o.pid = +pid;                   // these are passed as strings
		o.x = x;
		o.y = y;
		o.energy = energy;
		o.is_inspired = is_inspired;
		return o;
	};

	renderer.new_ship_selection = (turn, sid) => {
		let o = Object.create(null);
		o.type = "ship";
		o.turn = +turn;
		o.sid = +sid;
		o.pid = renderer.sid_pid_map[+sid];
		return o;
	};

	renderer.new_box_selection = (x, y) => {
		let o = Object.create(null);
		o.type = "box";
		o.x = x;
		o.y = y;
		return o;
	};

	// --------------------------------------------------------------

	renderer.open = (filename, fail_silently) => {

		renderer.stop_autoplay();

		// FIXME: loading zstd is done async so this test isn't sound...

		if (renderer.filename === filename && (new Date()).getTime() - renderer.loadtime < 5000) {
			console.log(`Ignoring request to open recently opened file: ${filename}`);
			return;
		}

		console.log(`Trying to load ${filename}`);

		let ok = renderer.open_simple(filename);

		if (!ok) {
			if (filename.endsWith(".json") === false) {
				renderer.open_zstd(filename, fail_silently);
			} else {
				console.log("Loading failed (simple JSON).");
				if (!fail_silently) {
					alert("Couldn't open this file.");
				}
			}
		}
	};

	renderer.open_simple = (filename) => {

		// Returns false if it wasn't plain JSON.
		// Blocks while reading.

		let game_object;

		try {
			let contents = fs.readFileSync(filename);
			game_object = JSON.parse(contents);
		} catch (err) {
			return false;
		}

		renderer.finish_load(filename, game_object);
		return true;
	};

	renderer.open_zstd = (filename, fail_silently) => {

		if (zstd === undefined) {
			if (!fail_silently) {
				alert("The zstd module is not loaded, so Fluorine can only load JSON replays.");
			}
			return;
		}

		let warned = fail_silently ? true : false;

		let all_chunks = [];
		let loading_stream = new stream.Writable();

		loading_stream._write = (chunk, encoding, done) => {
			all_chunks.push(chunk.toString());
			done();
		};

		// I believe the following is async (event loopy)...

		zstd.decompressFileToStream(filename, loading_stream, (err, result) => {

			if (err) {
				console.log("Loading failed (a).");
				if (!warned) {
					alert("Couldn't open this file.");
					warned = true;
				}
			}
			result.on("error", (err) => {
				console.log("Loading failed (b).");
				if (!warned) {
					alert("Couldn't open this file.");
					warned = true;
				}
			});
			result.on("finish", () => {
				let game_object;
				try {
					game_object = JSON.parse(all_chunks.join(""));
				} catch (new_err) {
					console.log("Loading failed (c).");
					console.log(new_err);
					if (!warned) {
						alert("Couldn't open this file.");
						warned = true;
					}
					return;     // So finish_load() isn't called.
				}
				renderer.finish_load(filename, game_object);
			});
		});
	};

	renderer.open_flog = (filename) => {

		if (!renderer.game) {
			alert("Open a game first.");
			return;
		}

		let contents;		// The raw string in the file.
		let flog_raw;		// The initial decoded JSON object.

		try {
			contents = fs.readFileSync(filename);
			contents = contents.toString();
		} catch (err) {
			alert("Couldn't open this f-log.");
			return;
		}

		try {
			flog_raw = JSON.parse(contents);
		} catch (err) {

			// Handle incomplete f-logs.

			contents = contents.trim();

			if (contents[contents.length - 1] === ",") {
				contents = contents.slice(0, contents.length - 1) + "]";
			} else {
				contents += "]";
			}

			try {
				flog_raw = JSON.parse(contents);
			} catch (err2) {
				alert("Couldn't open this f-log.");
				return;
			}
		}

		renderer.flog = Object.create(null);
		renderer.flog_colours = Object.create(null);

		for (let n = 0; n < flog_raw.length; n++) {

			let key = `${flog_raw[n].t}-${flog_raw[n].x}-${flog_raw[n].y}`;
			let old_msg = renderer.flog[key];

			let new_msg = flog_raw[n].msg;
			let colour = flog_raw[n].colour || flog_raw[n].color;

			if (new_msg !== undefined) {
				if (old_msg === undefined) {
					renderer.flog[key] = new_msg;
				} else {
					renderer.flog[key] += flog_concat_string + new_msg;
				}
			}

			if (colour !== undefined) {
				renderer.flog_colours[key] = colour;
			}
		}

		renderer.draw();
	};

	renderer.finish_load = (filename, o) => {

		if (o.GAME_CONSTANTS === undefined || o.full_frames === undefined || o.game_statistics === undefined || o.players === undefined || o.production_map === undefined) {
			if (o.constants && o.engine_version && o.frames && o.num_frames && o.num_players && o.planets) {
				alert("This is a Halite 2 replay. Someone made a good viewer for those.");
			} else {
				alert("Successfully read some JSON but it doesn't seem to be a Halite 3 replay.");
			}
			return;
		}

		console.time("finish_load");

		renderer.game = o;

		// Crude deletion of redundant zeroth frame.
		// We gotta undo this if saving the file...

		renderer.deleted_frame = renderer.game.full_frames[0];
		renderer.game.full_frames = renderer.game.full_frames.slice(1);

		// We rather rely on certain arrays in the replay being in order.
		// They probably are, but make sure...

		renderer.game.players.sort((a, b) => {
			return a.player_id - b.player_id;
		});

		renderer.game.game_statistics.player_statistics.sort((a, b) => {
			return a.player_id - b.player_id;
		});

		renderer.filename = filename;
		renderer.loadtime = (new Date()).getTime();	// ms since epoch. Since this load seems successful, we won't load the same file within 5 seconds.
		renderer.turn = 0;
		renderer.selection = null;
		renderer.width = renderer.game.production_map.width;
		renderer.height = renderer.game.production_map.height;

		renderer.flog = null;
		renderer.flog_colours = null;

		renderer.offset_x = 0;
		renderer.offset_y = 0;

		// Various things in this process use stuff that was created previously, so keep this order:

		renderer.make_production_list();
		renderer.make_dropoff_list();
		renderer.make_sid_pid_map();
		renderer.make_collision_data();
		renderer.make_self_loss_counts();
		renderer.make_build_counts();
		renderer.make_mined_counts();
		renderer.make_burn_counts();
		renderer.make_scrap_counts();
		renderer.make_absorbed_counts();

		renderer.set_title();
		renderer.send_extra_stats();

		renderer.initial_halite = 0;

		for (let x = 0; x < renderer.width; x++) {
			for (let y = 0; y < renderer.height; y++) {
				renderer.initial_halite += renderer.production_list[0][x][y];
			}
		}

		renderer.draw();
		console.timeEnd("finish_load");
	};

	renderer.set_title = () => {

		if (!renderer.game) {
			document.title = "Fluorine";
			return;
		}

		document.title = `${renderer.width} x ${renderer.height} : ${path.basename(renderer.filename)}`;
	};

	// --------------------------------------------------------------

	renderer.make_sid_pid_map = () => {

		// renderer.sid_pid_map: [sid] --> pid

		renderer.sid_pid_map = Object.create(null);

		for (let turn = 0; turn < renderer.game_length(); turn++) {

			let frame = renderer.frame(turn);
			let events = frame.events;

			for (let n = 0; n < events.length; n++) {
				let event = events[n];
				if (event.type === "spawn") {
					renderer.sid_pid_map[event.id] = event.owner_id;
				}
			}
		}
	};

	renderer.make_production_list = () => {

		// renderer.production_list: [turn][x][y] --> "production" (halite on ground)

		renderer.production_list = [];

		// Make frame 0 map...

		renderer.production_list.push([]);
		for (let x = 0; x < renderer.width; x++) {
			renderer.production_list[0].push([]);
			for (let y = 0; y < renderer.height; y++) {
				renderer.production_list[0][x].push(renderer.game.production_map.grid[y][x].energy);    // Note reversed coords in JSON
			}
		}

		// Make the rest...

		for (let turn = 1; turn < renderer.game_length(); turn++) {

			// Make this frame identical to the one before...

			renderer.production_list.push([]);
			for (let x = 0; x < renderer.width; x++) {
				renderer.production_list[turn].push([]);
				for (let y = 0; y < renderer.height; y++) {
					renderer.production_list[turn][x].push(renderer.production_list[turn - 1][x][y]);
				}
			}

			// And now adjust for mining...

			let prior_frame = renderer.frame(turn - 1);

			for (let n = 0; n < prior_frame.cells.length; n++) {

				let cell = prior_frame.cells[n];

				let x = cell.x;
				let y = cell.y;
				let val = cell.production;

				renderer.production_list[turn][x][y] = val;
			}
		}
	};

	renderer.make_dropoff_list = () => {

		// renderer.dropoff_list: array of dropoff points seen in game

		renderer.dropoff_list = [];

		for (let n = 0; n < renderer.game_length(); n++) {

			for (let i = 0; i < renderer.frame(n).events.length; i++) {

				let event = renderer.frame(n).events[i];

				if (event.type === "construct") {

					// Note "turn" saved here (n + 1) is the turn in which the dropoff point is first shown.
					// In retrospect this was a dubious choice. FIXME?

					let d = {x: event.location.x, y: event.location.y, pid: event.owner_id, sid: event.id, turn: n + 1};

					// Save a stat for how much halite on the ground was absorbed by the player...

					d.absorbed = renderer.production_list[n][event.location.x][event.location.y];
					renderer.dropoff_list.push(d);
				}
			}
		}
	};

	renderer.make_collision_data = () => {

		// renderer.collision_data: array of collision events in sane order

		renderer.collision_data = [];

		for (let n = 0; n < renderer.game_length(); n++) {

			for (let i = 0; i < renderer.frame(n).events.length; i++) {

				let event = renderer.frame(n).events[i];

				if (event.type === "shipwreck") {

					let data = {turn: n + 1, x: event.location.x, y: event.location.y, sids: event.ships, losses: [], halite_losses: []};

					// Setup...

					for (let pid = 0; pid < renderer.players(); pid++) {
						data.losses.push(0);
						data.halite_losses.push(0);
					}

					// Calculate ships lost and halite dropped by each player...

					let total_dropped = 0;

					for (let z = 0; z < event.ships.length; z++) {

						let sid = event.ships[z];
						let pid = renderer.sid_pid_map[sid];
						data.losses[pid] += 1;

						let final_state = renderer.frame(n).entities[pid][sid];

						// Adjustment for fuel burned en route to the collision...

						let burned_en_route = 0;

						if (final_state !== undefined) {		// If undefined, it's a ship that crashed as it was created. Applies to Halite 1.1.6 onwards.

							if (final_state.x !== data.x || final_state.y !== data.y) {     				// The ship moved before colliding.
								let ground = renderer.production_list[n][final_state.x][final_state.y];     // Ship's source before moving.
								if (final_state.is_inspired) {
									burned_en_route = Math.floor(ground / renderer.game.GAME_CONSTANTS.INSPIRED_MOVE_COST_RATIO);
								} else {
									burned_en_route = Math.floor(ground / renderer.game.GAME_CONSTANTS.MOVE_COST_RATIO);
								}
							}

							data.halite_losses[pid] += final_state.energy - burned_en_route;

							total_dropped += final_state.energy - burned_en_route;
						}
					}

					// Adjustment for collisions over a factory...

					for (let pid = 0; pid < renderer.players(); pid++) {
						if (renderer.game.players[pid].factory_location.x === data.x && renderer.game.players[pid].factory_location.y === data.y) {
							data.halite_losses[pid] -= total_dropped;
						}
					}

					// Adjustment for collisions over a dropoff...

					for (let z = 0; z < renderer.dropoff_list.length; z++) {

						let dropoff = renderer.dropoff_list[z];

						if (dropoff.turn - 1 <= n && dropoff.x === data.x && dropoff.y === data.y) {
							data.halite_losses[dropoff.pid] -= total_dropped;
						}
					}

					// Save...

					renderer.collision_data.push(data);
				}
			}
		}
	};

	renderer.make_self_loss_counts = () => {

		// renderer.self_loss_counts: array of arrays: [pid][turn] --> self-destruct count

		renderer.self_loss_counts = [];

		for (let pid = 0; pid < renderer.players(); pid++) {
			renderer.self_loss_counts.push([]);
		}

		// Zero the whole array...

		for (let n = 0; n < renderer.game_length(); n++) {
			for (let pid = 0; pid < renderer.players(); pid++) {
				renderer.self_loss_counts[pid].push(0);
			}
		}

		for (let n = 0; n < renderer.collision_data.length; n++) {

			let data = renderer.collision_data[n];

			for (let pid = 0; pid < renderer.players(); pid++) {

				let losses = data.losses[pid];

				if (losses > 1) {
					// FIXME? This is a relatively expensive way of updating everything.
					for (let turn = data.turn; turn < renderer.game_length(); turn++) {
						renderer.self_loss_counts[pid][turn] += losses;
					}
				}
			}
		}
	};

	renderer.make_build_counts = () => {

		// renderer.build_counts: array of arrays: [pid][turn] --> ships made

		renderer.build_counts = [];

		for (let pid = 0; pid < renderer.players(); pid++) {
			renderer.build_counts.push([]);
		}

		// Zero the whole array...

		for (let n = 0; n < renderer.game_length(); n++) {
			for (let pid = 0; pid < renderer.players(); pid++) {
				renderer.build_counts[pid].push(0);
			}
		}

		for (let n = 1; n < renderer.game_length(); n++) {

			// First, make this turn's cumulative count equal last turn's for all players...

			for (let pid = 0; pid < renderer.players(); pid++) {
				renderer.build_counts[pid][n] = renderer.build_counts[pid][n - 1];
			}

			// Now add new ships...

			let events = renderer.frame(n - 1).events;          // Last frame's builds show up this frame.

			for (let i = 0; i < events.length; i++) {

				let event = events[i];

				if (event.type === "spawn") {
					let pid = event.owner_id;
					renderer.build_counts[pid][n] += 1;
				}
			}
		}
	};

	renderer.make_mined_counts = () => {

		// renderer.mined_counts: array of arrays: [pid][turn] --> mined count
		// renderer.inspired_counts: array of arrays: [pid][turn] --> inspired mining count

		renderer.mined_counts = [];
		renderer.inspired_counts = [];

		for (let pid = 0; pid < renderer.players(); pid++) {
			renderer.mined_counts.push([]);
			renderer.mined_counts[pid].push(0);                 // Data for turn 0.
			renderer.inspired_counts.push([]);
			renderer.inspired_counts[pid].push(0);              // Data for turn 0.

		}

		for (let turn = 1; turn < renderer.game_length(); turn++) {

			let counts_this_turn = [];
			let inspired_this_turn = [];

			for (let pid = 0; pid < renderer.players(); pid++) {
				counts_this_turn.push(0);
				inspired_this_turn.push(0);
			}

			let previous_frame = renderer.frame(turn - 1);

			for (let [sid, pid] of Object.entries(renderer.sid_pid_map)) {

				let ship_now = renderer.frame(turn).entities[pid][sid];
				let ship_prev = renderer.frame(turn - 1).entities[pid][sid];

				if (ship_now !== undefined && ship_prev !== undefined) {

					// Ship exists both this frame and last frame.

					let ship_gain = ship_now.energy - ship_prev.energy;

					if (ship_gain > 0) {

						counts_this_turn[pid] += ship_gain;

						let ship = previous_frame.entities[pid][sid];
						if (ship.is_inspired) {

							let x = ship.x;
							let y = ship.y;
							let expected_gain = Math.ceil(renderer.production_list[turn - 1][x][y] / renderer.game.GAME_CONSTANTS.EXTRACT_RATIO);

							if (ship_gain > expected_gain) {
								inspired_this_turn[pid] += ship_gain - expected_gain;
							}
						}
					}
				}
			}

			for (let pid = 0; pid < renderer.players(); pid++) {
				renderer.mined_counts[pid].push(renderer.mined_counts[pid][turn - 1] + counts_this_turn[pid]);
				renderer.inspired_counts[pid].push(renderer.inspired_counts[pid][turn - 1] + inspired_this_turn[pid]);
			}
		}
	};

	renderer.make_burn_counts = () => {

		// renderer.burn_counts: array of arrays: [pid][turn] --> burned count

		renderer.burn_counts = [];

		for (let pid = 0; pid < renderer.players(); pid++) {
			renderer.burn_counts.push([]);
			renderer.burn_counts[pid].push(0);                  // Data for turn 0 and 1.
		}

		for (let turn = 1; turn < renderer.game_length(); turn++) {

			for (let pid = 0; pid < renderer.players(); pid++) {

				// The burn happens between last frame and this frame...

				let some_moves = renderer.frame(turn - 1).moves[pid];
				let some_ships = renderer.frame(turn - 1).entities[pid];

				if (some_moves === undefined || some_ships === undefined) {
					renderer.burn_counts[pid].push(renderer.burn_counts[pid][turn - 1]);
					continue;
				}

				let spent = 0;

				for (let n = 0; n < some_moves.length; n++) {

					let move = some_moves[n];

					if (move.type === "m" && "nsew".includes(move.direction)) {

						let sid = move.id;

						let ship = some_ships[sid];

						if (ship === undefined) {
							console.log(`sid ${sid} not in entities list on turn ${turn - 1}`);
						}

						let ground = renderer.production_list[turn - 1][ship.x][ship.y];

						let cost;

						if (ship.is_inspired) {
							cost = Math.floor(ground / renderer.game.GAME_CONSTANTS.INSPIRED_MOVE_COST_RATIO);
						} else {
							cost = Math.floor(ground / renderer.game.GAME_CONSTANTS.MOVE_COST_RATIO);
						}

						if (cost <= ship.energy) {      // No burn if can't afford.
							spent += cost;
						}
					}
				}

				renderer.burn_counts[pid].push(renderer.burn_counts[pid][turn - 1] + spent);
			}
		}
	};

	renderer.make_scrap_counts = () => {

		// renderer.scrap_counts: array of arrays: [pid][turn] --> scrap count

		renderer.scrap_counts = [];

		for (let pid = 0; pid < renderer.players(); pid++) {
			renderer.scrap_counts.push([]);
			for (let turn = 0; turn < renderer.game_length(); turn++) {
				renderer.scrap_counts[pid].push(0);
			}
		}

		for (let n = 0; n < renderer.collision_data.length; n++) {

			let data = renderer.collision_data[n];

			for (let pid = 0; pid < renderer.players(); pid++) {
				if (data.halite_losses[pid] !== 0) {
					for (let turn = data.turn; turn < renderer.game_length(); turn++) {
						// FIXME? This is a relatively expensive way of updating everything.
						renderer.scrap_counts[pid][turn] += data.halite_losses[pid];
					}
				}
			}
		}
	};

	renderer.make_absorbed_counts = () => {

		renderer.absorbed_counts = [];

		// renderer.absorbed_counts: array of arrays: [pid][turn] --> absorbed count

		for (let pid = 0; pid < renderer.players(); pid++) {
			renderer.absorbed_counts.push([]);
			for (let turn = 0; turn < renderer.game_length(); turn++) {
				renderer.absorbed_counts[pid].push(0);
			}
		}

		for (let n = 0; n < renderer.dropoff_list.length; n++) {

			let dropoff = renderer.dropoff_list[n];
			let pid = dropoff.pid;
			let absorbed = dropoff.absorbed;

			for (let turn = dropoff.turn; turn < renderer.game_length(); turn++) {
				renderer.absorbed_counts[pid][turn] += absorbed;
			}
		}
	};

	// --------------------------------------------------------------

	renderer.save = (filename) => {

		if (!filename || !renderer.game) return;

		// Undo our frame 0 deletion...
		renderer.game.full_frames.unshift(renderer.deleted_frame);

		fs.writeFileSync(filename, JSON.stringify(renderer.game, null, "\t"));

		// Redo our frame 0 deletion...
		renderer.game.full_frames = renderer.game.full_frames.slice(1);
	};

	renderer.save_frame = (filename) => {
		if (!filename || !renderer.game) return;
		fs.writeFileSync(filename, JSON.stringify(renderer.current_frame(), null, "\t"));
	};

	renderer.save_entities = (filename) => {
		if (!filename || !renderer.game) return;
		fs.writeFileSync(filename, JSON.stringify(renderer.current_frame().entities, null, "\t"));
	};

	renderer.save_moves = (filename) => {
		if (!filename || !renderer.game) return;
		fs.writeFileSync(filename, JSON.stringify(renderer.current_frame().moves, null, "\t"));
	};

	renderer.save_events = (filename) => {
		if (!filename || !renderer.game) return;
		fs.writeFileSync(filename, JSON.stringify(renderer.current_frame().events, null, "\t"));
	};


	// --------------------------------------------------------------

	renderer.go_to_turn = (n, ipc_flag) => {

		if (!renderer.game) return;

		renderer.turn = n;

		if (renderer.prefs.turns_start_at_one && ipc_flag) {
			renderer.turn -= 1;
		}

		if (renderer.turn < 0) renderer.turn = 0;
		if (renderer.turn >= renderer.game_length()) renderer.turn = renderer.game_length() - 1;

		renderer.draw();
	};

	renderer.forward = (n) => {
		if (!renderer.game) return;
		renderer.go_to_turn(renderer.turn + n);
	};

	renderer.stop_autoplay = () => {
		if (renderer.autoplay_iid !== null) {
			clearInterval(renderer.autoplay_iid);
		}
		renderer.autoplay_iid = null;
	};

	renderer.toggle_autoplay = () => {

		// Toggle off...

		if (renderer.autoplay_iid !== null) {
			clearInterval(renderer.autoplay_iid);
			renderer.autoplay_iid = null;
			return;
		}

		// Toggle on...

		renderer.autoplay_iid = setInterval(() => {
			if (!renderer.game) {
				renderer.stop_autoplay();
				return;
			}
			renderer.turn += 1;
			if (renderer.turn >= renderer.game_length()) {
				renderer.turn = renderer.game_length() - 1;
				renderer.stop_autoplay();
			}
			renderer.draw();
		}, 50);
	};

	renderer.right = (n) => {
		renderer.offset_x += n;
		renderer.draw();
	};

	renderer.down = (n) => {
		renderer.offset_y += n;
		renderer.draw();
	};

	renderer.set = (attrname, value) => {
		renderer[attrname] = value;
		renderer.draw();
	};

	renderer.farside = () => {
		renderer.offset_x = Math.floor(renderer.width / 2);
		renderer.offset_y = Math.floor(renderer.height / 2);
		renderer.draw();
	};

	renderer.next_collision = (reverse_flag) => {

		if (!renderer.game) return;

		// If we happen to be selecting a collision already, behaviour is special...

		if (renderer.selection && renderer.selection.type === "box") {

			for (let n = 0; n < renderer.collision_data.length; n++) {

				let data = renderer.collision_data[n];

				if (data.x === renderer.selection.x && data.y === renderer.selection.y && data.turn === renderer.turn) {

					// We found our selection. So select the collision one spot before/after it in the array.

					let next_data;

					if (reverse_flag) {
						next_data = renderer.collision_data[n - 1];
					} else {
						next_data = renderer.collision_data[n + 1];
					}

					if (next_data === undefined) {
						return;
					}

					renderer.turn = next_data.turn;
					renderer.selection = renderer.new_box_selection(next_data.x, next_data.y);
					renderer.draw();
					return;
				}
			}
		}

		// Otherwise, find the right collision in the list to jump to...

		if (reverse_flag) {
			for (let n = renderer.collision_data.length - 1; n >= 0; n--) {
				let data = renderer.collision_data[n];
				if (data.turn < renderer.turn) {
					renderer.turn = data.turn;
					renderer.selection = renderer.new_box_selection(data.x, data.y);
					renderer.draw();
					return;
				}
			}
		} else {
			for (let n = 0; n < renderer.collision_data.length; n++) {
				let data = renderer.collision_data[n];
				if (data.turn > renderer.turn) {
					renderer.turn = data.turn;
					renderer.selection = renderer.new_box_selection(data.x, data.y);
					renderer.draw();
					return;
				}
			}
		}
	};

	renderer.ship_fate = () => {

		if (!renderer.game) return;
		if (!renderer.selection) return;
		if (renderer.selection.type !== "ship") return;

		for (let n = 0; n < renderer.collision_data.length; n++) {

			let data = renderer.collision_data[n];

			for (let i = 0; i < data.sids.length; i++) {
				if (data.sids[i] === renderer.selection.sid) {
					renderer.turn = data.turn;
					renderer.draw();
					return;
				}
			}
		}

		// Ship never died; did it become a dropoff point?

		for (let n = 0; n < renderer.dropoff_list.length; n++) {

			let d = renderer.dropoff_list[n];

			if (d.sid === renderer.selection.sid) {
				renderer.turn = d.turn;
				renderer.draw();
				return;
			}
		}

		// It survived to the end.

		renderer.turn = renderer.game_length() - 1;
		renderer.draw();
	};

	renderer.select_sid = (sid) => {

		if (!renderer.game) return;

		// In case the ship isn't alive, we have to find a valid turn for its selection object...

		for (let turn = 0; turn < renderer.game_length(); turn++) {

			let events = renderer.frame(turn).events;

			for (let n = 0; n < events.length; n++) {

				let event = events[n];

				if (event.type === "spawn" && event.id === sid) {

					renderer.selection = renderer.new_ship_selection(turn + 1, sid);

					if (renderer.turn < turn + 1) {
						renderer.turn = turn + 1;
						renderer.draw();
						return;
					} else if (renderer.ship_info(sid) === null) {
						renderer.ship_fate();       // Uses renderer.selection, which we set above. Calls draw().
						return;
					} else {
						renderer.draw();
						return;
					}
				}
			}
		}

		renderer.selection = null;
		renderer.draw();
	};

	// --------------------------------------------------------------

	renderer.collision_at = (x, y) => {

		// Returns the event from the previous frame, or null if not found...

		let events = renderer.previous_frame().events;

		for (let n = 0; n < events.length; n++) {
			if (events[n].type === "shipwreck") {
				if (x === events[n].location.x && y === events[n].location.y) {
					return events[n];
				}
			}
		}

		return null;
	};

	renderer.collision_involving_ship = (sid) => {

		// Returns the event from the previous frame, or null if not found...

		let events = renderer.previous_frame().events;

		for (let n = 0; n < events.length; n++) {
			if (events[n].type === "shipwreck") {
				for (let i = 0; i < events[n].ships.length; i++) {
					if (events[n].ships[i] === sid) {
						return events[n];
					}
				}
			}
		}

		return null;
	};

	// --------------------------------------------------------------

	renderer.ship_string = (sid, highlight_box_flag) => {

		let ship_info = renderer.ship_info(sid);

		if (ship_info === null) {

			let cause;

			for (let n = 0; n < renderer.dropoff_list.length; n++) {

				let drop = renderer.dropoff_list[n];

				if (drop.sid === sid && drop.turn <= renderer.turn) {
					cause = "dropoff";
					break;
				}
			}

			if (cause === undefined) {
				cause = renderer.turn < renderer.selection.turn ? "not yet present" : "no longer present";
			}

			return `<span class="player-${renderer.selection.pid}-colour">Ship ${renderer.selection.sid}</span> (${cause})`;
		}

		let mark = ship_info.is_inspired ? "+" : "";

		let a = highlight_box_flag ? "[" : "";
		let b = highlight_box_flag ? "]" : "";

		return `<span class="player-${ship_info.pid}-colour">${a}Ship ${sid}${mark}${b}</span> &ndash; <span class="player-${ship_info.pid}-colour">${ship_info.energy}</span> &ndash; next is <span class="player-${ship_info.pid}-colour">${renderer.ship_move(sid)}</span>`;
	};

	renderer.collision_string = (event) => {

		let sids = [];

		for (let n = 0; n < event.ships.length; n++) {
			sids.push(event.ships[n]);
		}

		sids.sort((a, b) => {
			return a - b;
		});

		let string_list = [];

		for (let n = 0; n < sids.length; n++) {
			let sid = sids[n];
			let pid = renderer.sid_pid_map[sid];
			string_list.push(`<span class="player-${pid}-colour">${sid}</span>`);
		}

		return `<span class="collision">Collision</span>: ${string_list.join(", ")}`;
	};

	renderer.selection_string = () => {

		if (!renderer.selection) {
			return "no selection";
		}

		// First, make s a string with info about the relevant box...

		let s = "";

		let [x, y] = renderer.get_selection_xy();

		if (x !== null && y !== null) {
			let val = renderer.production_list[renderer.turn][x][y];
			if (renderer.selection.type === "box") {
				s = `[${x}, ${y}] &ndash; ${val}`;
			} else {
				s = `${x}, ${y} &ndash; ${val}`;
			}
		}

		// If our selection is a box, see if anything else is present...

		if (renderer.selection.type === "box") {

			let collision = renderer.collision_at(x, y);

			if (collision) {
				return s + ` &ndash; ` + renderer.collision_string(collision);
			} else {
				let ship_info = renderer.ship_at(x, y);
				if (ship_info) {
					return s + ` &ndash; ` + renderer.ship_string(ship_info.sid, false);
				}
				return s;
			}
		}

		// Otherwise, add info about the ship...

		if (renderer.selection.type === "ship") {

			let sid = renderer.selection.sid;

			let collision = renderer.collision_involving_ship(sid);

			if (collision) {
				return s + ` &ndash; ` + renderer.collision_string(collision);
			}

			return s + (s !== "" ? " &ndash; " : "") + renderer.ship_string(sid, true);
		}

		return "unknown selection";
	};

	// --------------------------------------------------------------

	renderer.offset_adjust = (x, y, undo_flag) => {

		// Given coords x, y, return x, y adjusted by current offset.

		if (!renderer.game) return [x, y];

		if (!undo_flag) {
			x += renderer.offset_x;
			y += renderer.offset_y;
		} else {
			x -= renderer.offset_x;
			y -= renderer.offset_y;
		}

		// Sneaky modulo method which works for negative numbers too...
		// https://dev.to/maurobringolf/a-neat-trick-to-compute-modulo-of-negative-numbers-111e

		x = (x % renderer.width + renderer.width) % renderer.width;
		y = (y % renderer.height + renderer.height) % renderer.height;

		return [x, y];
	};

	// --------------------------------------------------------------

	renderer.clear = () => {

		if (!renderer.game) {
			context.clearRect(0, 0, canvas.width, canvas.height);
			return;
		}

		let desired_size;

		if (!renderer.prefs.integer_box_sizes) {
			desired_size = Math.max(1 * renderer.height, window.innerHeight - 1);
		} else {
			desired_size = renderer.height * Math.max(1, Math.floor((window.innerHeight - 1) / renderer.height));
		}

		if (desired_size !== canvas.width || desired_size !== canvas.height) {
			canvas.width = desired_size;
			canvas.height = desired_size;
		}

		context.clearRect(0, 0, canvas.width, canvas.height);
	};

	renderer.draw = () => {

		renderer.clear();

		if (!renderer.game) {
			return;
		}

		renderer.draw_grid();
		renderer.draw_structures();
		renderer.draw_collisions();
		renderer.draw_ships();
		renderer.draw_selection_crosshairs();

		renderer.write_infobox();
	};

	renderer.draw_grid = () => {

		let box_width = renderer.box_width();
		let box_height = renderer.box_height();

		let turn_fudge = renderer.prefs.turns_start_at_one ? 1 : 0;

		for (let x = 0; x < renderer.width; x++) {

			for (let y = 0; y < renderer.height; y++) {

				let colour;

				if (renderer.flog_colours) {
					let key = `${renderer.turn + turn_fudge}-${x}-${y}`;
					colour = renderer.flog_colours[key];
				}

				if (colour === undefined) {
					let val;

					switch (renderer.prefs.grid_aesthetic) {
						case 0:
							val = 0;
							break;
						case 1:
							val = renderer.production_list[renderer.turn][x][y] / 4;
							break;
						case 2:
							val = 255 * Math.sqrt(renderer.production_list[renderer.turn][x][y] / 2048);
							break;
						case 3:
							val = 255 * Math.sqrt(renderer.production_list[renderer.turn][x][y] / 1024);
							break;
					}

					val = Math.floor(val);
					val = Math.min(255, val);
					colour = `rgb(${val},${val},${val})`;
				}

				context.fillStyle = colour;

				let [i, j] = renderer.offset_adjust(x, y);
				context.fillRect(i * box_width, j * box_height, box_width, box_height);
			}
		}
	};

	renderer.draw_structures = () => {

		let box_width = renderer.box_width();
		let box_height = renderer.box_height();

		for (let pid = 0; pid < renderer.players(); pid++) {

			let x = renderer.game.players[pid].factory_location.x;
			let y = renderer.game.players[pid].factory_location.y;

			context.fillStyle = colours[pid];
			let [i, j] = renderer.offset_adjust(x, y);
			context.fillRect(i * box_width, j * box_height, box_width, box_height);
		}

		for (let n = 0; n < renderer.dropoff_list.length; n++) {

			if (renderer.dropoff_list[n].turn > renderer.turn) {
				continue;
			}

			let x = renderer.dropoff_list[n].x;
			let y = renderer.dropoff_list[n].y;
			let pid = renderer.dropoff_list[n].pid;

			context.fillStyle = colours[pid];
			let [i, j] = renderer.offset_adjust(x, y);
			context.fillRect(i * box_width, j * box_height, box_width, box_height);
		}
	};

	renderer.get_moves_map = (next_flag) => {

		// All moves stored in previous/current frame, as a map of sid --> direction

		let ret = Object.create(null);

		let frame;

		if (next_flag) {
			frame = renderer.current_frame();
		} else {
			frame = renderer.previous_frame();
		}

		for (let pid = 0; pid < renderer.players(); pid++) {
			let some_moves = frame.moves[pid];
			if (some_moves === undefined) {
				continue;
			}
			for (let n = 0; n < some_moves.length; n++) {
				let move = some_moves[n];
				if (move.type === "m") {
					ret[move.id] = move.direction;
				}
			}
		}
		return ret;
	};

	renderer.draw_ships = () => {

		let box_width = renderer.box_width();
		let box_height = renderer.box_height();
		let frame = renderer.current_frame();

		let moves_map = renderer.get_moves_map(renderer.prefs.triangles_show_next);

		for (let pid = 0; pid < renderer.players(); pid++) {

			let colour = colours[pid];

			let some_ships = frame.entities[pid];

			if (some_ships === undefined) {
				continue;
			}

			for (let [sid, ship] of Object.entries(some_ships)) {

				let x = ship.x;
				let y = ship.y;

				let opacity = ship.energy / renderer.game.GAME_CONSTANTS.MAX_ENERGY;

				context.strokeStyle = colour;

				let [i, j] = renderer.offset_adjust(x, y);

				let a = 0.1;
				let b = 0.5;
				let c = 1 - a;

				switch (moves_map[sid]) {
					case "n":
						context.beginPath();
						context.moveTo((i + a) * box_width, (j + c) * box_height);
						context.lineTo((i + c) * box_width, (j + c) * box_height);
						context.lineTo((i + b) * box_width, (j + a) * box_height);
						context.closePath();
						context.fillStyle = "#000000";
						context.fill();
						context.globalAlpha = opacity;
						context.fillStyle = colour;
						context.fill();
						context.globalAlpha = 1;
						context.stroke();
						break;
					case "s":
						context.beginPath();
						context.moveTo((i + a) * box_width, (j + a) * box_height);
						context.lineTo((i + c) * box_width, (j + a) * box_height);
						context.lineTo((i + b) * box_width, (j + c) * box_height);
						context.closePath();
						context.fillStyle = "#000000";
						context.fill();
						context.globalAlpha = opacity;
						context.fillStyle = colour;
						context.fill();
						context.globalAlpha = 1;
						context.stroke();
						break;
					case "e":
						context.beginPath();
						context.moveTo((i + a) * box_width, (j + a) * box_height);
						context.lineTo((i + a) * box_width, (j + c) * box_height);
						context.lineTo((i + c) * box_width, (j + b) * box_height);
						context.closePath();
						context.fillStyle = "#000000";
						context.fill();
						context.globalAlpha = opacity;
						context.fillStyle = colour;
						context.fill();
						context.globalAlpha = 1;
						context.stroke();
						break;
					case "w":
						context.beginPath();
						context.moveTo((i + c) * box_width, (j + a) * box_height);
						context.lineTo((i + c) * box_width, (j + c) * box_height);
						context.lineTo((i + a) * box_width, (j + b) * box_height);
						context.closePath();
						context.fillStyle = "#000000";
						context.fill();
						context.globalAlpha = opacity;
						context.fillStyle = colour;
						context.fill();
						context.globalAlpha = 1;
						context.stroke();
						break;
					default:
						context.beginPath();
						context.arc((i + b) * box_width, (j + b) * box_height, 0.35 * box_width, 0, 2 * Math.PI, false);
						context.fillStyle = "#000000";
						context.fill();
						context.globalAlpha = opacity;
						context.fillStyle = colour;
						context.fill();
						context.globalAlpha = 1;
						context.stroke();
				}
			}
		}
	};

	renderer.draw_collisions = () => {

		if (renderer.turn <= 0) return;

		let box_width = renderer.box_width();
		let box_height = renderer.box_height();

		let events = renderer.previous_frame().events;

		for (let n = 0; n < events.length; n++) {

			if (events[n].type === "shipwreck") {

				let x = events[n].location.x;
				let y = events[n].location.y;

				context.fillStyle = explosion_colour;
				let [i, j] = renderer.offset_adjust(x, y);
				context.fillRect(i * box_width, j * box_height, box_width, box_height);
			}
		}
	};

	renderer.get_selection_xy = () => {

		if (!renderer.selection) {
			return [null, null];
		}

		if (renderer.selection.type === "box") {
			return [renderer.selection.x, renderer.selection.y];
		}

		if (renderer.selection.type === "ship") {

			let info = renderer.ship_info(renderer.selection.sid);

			if (info) {
				return [info.x, info.y];
			}

			// Ship doesn't currently exist, was it just destroyed?

			let collision = renderer.collision_involving_ship(renderer.selection.sid);

			if (collision) {
				return [collision.location.x, collision.location.y];
			}

			// Or maybe it is a dropoff?

			for (let n = 0; n < renderer.dropoff_list.length; n++) {

				let drop = renderer.dropoff_list[n];

				if (drop.sid === renderer.selection.sid && drop.turn <= renderer.turn) {
					return [drop.x, drop.y];
				}
			}

			return [null, null];    // Ship is not to be found.
		}

		return [null, null];        // Unknown selection type.
	};

	renderer.draw_selection_crosshairs = () => {

		let [x, y] = renderer.get_selection_xy();

		if (x === null || y === null) {
			return;
		}

		let [i, j] = renderer.offset_adjust(x, y);

		i = i * renderer.box_width() + renderer.box_width() / 2;
		j = j * renderer.box_height() + renderer.box_height() / 2;

		context.setLineDash([5, 15]);

		context.lineWidth = 1;
		context.strokeStyle = "#cccccc";

		context.beginPath();
		context.moveTo(i, j - renderer.box_height());
		context.lineTo(i, 0);
		context.stroke();

		context.beginPath();
		context.moveTo(i, j + renderer.box_height());
		context.lineTo(i, canvas.height);
		context.stroke();

		context.beginPath();
		context.moveTo(i - renderer.box_width(), j);
		context.lineTo(0, j);
		context.stroke();

		context.beginPath();
		context.moveTo(i + renderer.box_width(), j);
		context.lineTo(canvas.width, j);
		context.stroke();

		context.setLineDash([]);
	};

	renderer.box_width = () => {
		if (renderer.width <= 0) return 1;
		return Math.max(1, canvas.width / renderer.width);
	};

	renderer.box_height = () => {
		if (renderer.height <= 0) return 1;
		return Math.max(1, canvas.height / renderer.height);
	};

	// --------------------------------------------------------------

	renderer.game_length = () => {
		if (!renderer.game) return 0;
		return renderer.game.full_frames.length;
	};

	renderer.players = () => {
		if (!renderer.game) return 0;
		return renderer.game.players.length;
	};

	// --------------------------------------------------------------

	renderer.frame = (n) => {

		// Returns frame n, or if out of bounds, the first or last frame.

		if (!renderer.game) return null;
		if (n >= renderer.game_length()) n = renderer.game_length() - 1;
		if (n < 0) n = 0;
		return renderer.game.full_frames[n];
	};

	renderer.current_frame = () => {
		if (!renderer.game) return null;
		return renderer.frame(renderer.turn);
	};

	renderer.previous_frame = () => {
		if (!renderer.game) return null;
		return renderer.frame(renderer.turn - 1);
	};

	// --------------------------------------------------------------

	renderer.ship_at = (x, y) => {

		// Returns our ship info object, not the original ship.
		// Returns null if no ship present at x,y.

		for (let pid = 0; pid < renderer.players(); pid++) {

			let some_ships = renderer.current_frame().entities[pid];

			if (some_ships === undefined) {
				continue;
			}

			for (let [sid, ship] of Object.entries(some_ships)) {       // sid here is a string, but the function below deals with that.
				if (ship.x === x && ship.y === y) {
					return renderer.new_ship_info_object(sid, pid, ship.x, ship.y, ship.energy, ship.is_inspired);
				}
			}
		}

		return null;
	};

	renderer.ship_info = (sid) => {

		// Returns our ship info object, not the original ship.
		// Returns null if ship not present this frame.

		let pid = renderer.sid_pid_map[sid];
		let some_ships = renderer.current_frame().entities[pid];

		if (some_ships === undefined) {
			return null;
		}

		let hit = some_ships[sid];

		if (!hit) {
			return null;
		}

		return renderer.new_ship_info_object(sid, pid, hit.x, hit.y, hit.energy, hit.is_inspired);
	};

	renderer.ship_move = (sid) => {

		let lookups = {"n": "up", "s": "down", "e": "right", "w": "left", "o": "&ndash;"};

		let pid = renderer.sid_pid_map[sid];
		let some_moves = renderer.current_frame().moves[pid];

		if (some_moves === undefined) {
			return "(none)";
		}

		for (let n = 0; n < some_moves.length; n++) {

			let move = some_moves[n];

			if (move.type === "m" && move.id === sid) {

				if (move.direction === "o") {
					return lookups.o;               // Return here because this never fails.
				}

				// Check for move failure...

				let ship = renderer.current_frame().entities[pid][sid];
				let cost;

				if (ship.is_inspired) {
					cost = Math.floor(renderer.production_list[renderer.turn][ship.x][ship.y] / renderer.game.GAME_CONSTANTS.INSPIRED_MOVE_COST_RATIO);
				} else {
					cost = Math.floor(renderer.production_list[renderer.turn][ship.x][ship.y] / renderer.game.GAME_CONSTANTS.MOVE_COST_RATIO);
				}

				if (cost > ship.energy) {
					return lookups[move.direction] + " (fails)";
				}

				return lookups[move.direction];

			} else if (move.type === "c" && move.id === sid) {
				return "construct";
			}
		}

		return "(none)";
	};

	renderer.ship_count = (pid) => {

		if (!renderer.game) return 0;

		let frame = renderer.current_frame();

		let some_ships = frame.entities[pid];

		if (some_ships === undefined) {
			return 0;
		}

		return Object.values(some_ships).length;
	};

	renderer.dropoff_count = (pid) => {

		if (!renderer.game) return 0;

		let count = 0;

		for (let n = 0; n < renderer.dropoff_list.length; n++) {
			let drop = renderer.dropoff_list[n];
			if (drop.pid === pid && drop.turn <= renderer.turn) {
				count++;
			}
		}

		return count;
	};

	renderer.transit_count = (pid) => {

		if (!renderer.game) return 0;

		let frame = renderer.current_frame();

		let some_ships = frame.entities[pid];

		if (some_ships === undefined) {
			return 0;
		}

		let count = 0;

		for (let ship of Object.values(some_ships)) {
			count += ship.energy;
		}

		return count;
	};

	// --------------------------------------------------------------

	renderer.click = (event) => {

		if (!renderer.game) {
			return;
		}

		let x = Math.floor(event.offsetX / renderer.box_width());
		let y = Math.floor(event.offsetY / renderer.box_height());

		if (x < 0) x = 0;
		if (y < 0) y = 0;
		if (x >= renderer.width) x = renderer.width - 1;
		if (y >= renderer.height) y = renderer.height - 1;

		[x, y] = renderer.offset_adjust(x, y, true);

		renderer.select_at(x, y);

		renderer.draw();
	};

	renderer.select_at = (x, y) => {

		if (!renderer.game) return;
		if (x < 0 || y < 0 || x >= renderer.width || y >= renderer.height) return;

		let ship_info = renderer.ship_at(x, y);

		if (!ship_info) {
			renderer.selection = renderer.new_box_selection(x, y);
			return;
		}

		// User clicked a ship, but in the event that we've already
		// selected the ship, select the box underneath it instead.

		if (renderer.selection && renderer.selection.type === "ship" && renderer.selection.sid === ship_info.sid) {
			renderer.selection = renderer.new_box_selection(x, y);
			return;
		}

		renderer.selection = renderer.new_ship_selection(renderer.turn, ship_info.sid);
		return;
	};

	// --------------------------------------------------------------

	renderer.write_infobox = () => {

		if (!renderer.game) return;

		let turn_fudge = renderer.prefs.turns_start_at_one ? 1 : 0;

		let lines = [];

		lines.push(`<p>${renderer.selection_string()}</p>`);

		// -----------------------------------------------------

		if (renderer.flog) {

			let msg = "&nbsp;";

			if (renderer.selection) {

				msg = undefined;

				let [x, y] = renderer.get_selection_xy();

				if (x !== null && y !== null) {
					let key = `${renderer.turn + turn_fudge}-${x}-${y}`;
					msg = renderer.flog[key];
				}
			}

			if (msg === undefined) {
				msg = `<span class="lowlight">&lt;no f-log message&gt;</span>`;
			}

			lines.push(`<p>${msg}</p>`);
		}

		// -----------------------------------------------------

		let halite_total = 0;

		for (let x = 0; x < renderer.width; x++) {
			for (let y = 0; y < renderer.height; y++) {
				halite_total += renderer.production_list[renderer.turn][x][y];
			}
		}

		let percentage = Math.floor(100 * halite_total / renderer.initial_halite);

		lines.push(`<p class="lowlight">Turn: <span class="white-text">${renderer.turn + turn_fudge}</span> / ${renderer.game_length() - 1} &ndash; free halite: ${halite_total} (${percentage}%)</p>`);

		// -----------------------------------------------------

		let all_pids = [];

		for (let pid = 0; pid < renderer.players(); pid++) {
			all_pids.push(pid);
		}

		all_pids.sort((a, b) => {
			return renderer.game.game_statistics.player_statistics[a].rank - renderer.game.game_statistics.player_statistics[b].rank;
		});

		for (let pid of all_pids) {

			// Data cached at load time...

			let scrapped = renderer.scrap_counts[pid][renderer.turn];
			let inspired = renderer.inspired_counts[pid][renderer.turn];
			let mined = renderer.mined_counts[pid][renderer.turn];
			let absorbed = renderer.absorbed_counts[pid][renderer.turn];
			let burned = renderer.burn_counts[pid][renderer.turn];
			let sd = renderer.self_loss_counts[pid][renderer.turn];
			let builds = renderer.build_counts[pid][renderer.turn];

			// Data we get from the replay...

			let name = renderer.game.players[pid].name;
			let rank = renderer.game.game_statistics.player_statistics[pid].rank;
			let initial = renderer.game.GAME_CONSTANTS.INITIAL_ENERGY;
			let deposited = renderer.previous_frame().deposited[pid];

			// Data we have functions for...

			let carrying = renderer.transit_count(pid);
			let ships = renderer.ship_count(pid);
			let dropoffs = renderer.dropoff_count(pid);

			// Data we calculate...

			let current = renderer.turn === 0 ? renderer.game.GAME_CONSTANTS.INITIAL_ENERGY : renderer.previous_frame().energy[pid];
			let spent = deposited + initial - current;
			let gathered = deposited + initial;
			let dead_ships = builds - (ships + dropoffs);

			let assets = (
					ships * renderer.game.GAME_CONSTANTS.NEW_ENTITY_ENERGY_COST +
					dropoffs * renderer.game.GAME_CONSTANTS.DROPOFF_COST +
					carrying +
					current
			);

			if (renderer.game.game_statistics.player_statistics[pid].last_turn_alive < renderer.turn) {
				current = "dead";       // Set this after spent is calculated, above.
			}

			let c = `<span class="player-${pid}-colour">`;
			let z = `</span>`;

			lines.push(
				`
				<h2 class="player-${pid}-colour">${name} &ndash; ${ranks[rank]}</h2>
				<ul>
					<li>Ships: ${c}${ships}${z} / ${c}${builds}${z}
						&ndash; lost: ${c}${dead_ships}${z}, dropoffs: ${c}${dropoffs}${z}</li>
					<li>Self-destructs: ${c}${sd}${z}. Inspired mine bonus: ${c}${inspired}${z}</li>
					<li>Initial: ${c}${initial}${z}, mined: ${c}${mined}${z}, absorbed: ${c}${absorbed}${z}</li>
					<li>Burned: ${c}${burned}${z}, carrying ${c}${carrying}${z}, dropped: ${c}${scrapped}${z}</li>
					<li>Gathered: ${c}${gathered}${z} &ndash; spent: ${c}${spent}${z}</li>
					<li>Profit = ${c}${current}${z} (assets: ${c}${assets}${z})</li>`
			);

			if (mined + absorbed - deposited - carrying - burned - scrapped !== 0) {
				if (current !== "dead") {
					lines.push(`<li class="warning-text">Discrepancy: ${mined + absorbed - carrying - burned - deposited - scrapped}</li>`);
				}
			}

			lines.push(`</ul>`);

			// Note to self - halite absorbed during dropoff construction IS included in the deposited stat.
			// But initial 5000 is not. (My "gathered" stat is deposited + initial.)
		}

		infobox.innerHTML = lines.join("");
	};

	// --------------------------------------------------------------

	renderer.send_extra_stats = () => {

		if (!renderer.game) return;

		let lines = [];

		lines.push(`<p class="lowlight no-margin-bottom">Engine: ${renderer.game.ENGINE_VERSION}</p>`);
		lines.push(`<p class="lowlight no-margin-top">./halite.exe --width ${renderer.width} --height ${renderer.height} -s ${renderer.game.map_generator_seed}</p>`);
		lines.push(`<p class="lowlight">Dropoff deliveries at end:</p>`);

		let all_pids = [];

		for (let pid = 0; pid < renderer.players(); pid++) {
			all_pids.push(pid);
		}

		all_pids.sort((a, b) => {
			return renderer.game.game_statistics.player_statistics[a].rank - renderer.game.game_statistics.player_statistics[b].rank;
		});

		for (let pid of all_pids) {

			let username = renderer.game.players[pid].name;

			let hpd = renderer.game.game_statistics.player_statistics[pid].halite_per_dropoff;

			let foo = [];

			for (let i = 0; i < hpd.length; i++) {
				foo.push({x: hpd[i][0].x, y: hpd[i][0].y, val: hpd[i][1]});
			}

			foo.sort((a, b) => {
				return b.val - a.val;
			});

			let factory_x = renderer.game.players[pid].factory_location.x;
			let factory_y = renderer.game.players[pid].factory_location.y;

			lines.push(`<h2 class="player-${pid}-colour no-margin-bot">${username}</h2>`);
			lines.push(`<ul class="no-margin-top">`);
			for (let i = 0; i < foo.length; i++) {
				lines.push(`<li>${foo[i].x}, ${foo[i].y} &ndash; ${foo[i].val}${foo[i].x === factory_x && foo[i].y === factory_y ? " (factory)" : ""}</li>`);
			}
			lines.push(`</ul>`);
		}

		ipcRenderer.send("relay", {
			receiver: "extra_stats",
			channel: "update",
			content: lines.join(""),
		});
	};

	return renderer;
}

let renderer = make_renderer();

ipcRenderer.on("open", (event, filename) => {
	renderer.open(filename);
});

ipcRenderer.on("open_silent_fail", (event, filename) => {
	renderer.open(filename, true);
});

ipcRenderer.on("open_flog", (event, filename) => {
	renderer.open_flog(filename);
});

ipcRenderer.on("save", (event, filename) => {
	renderer.save(filename);
});

ipcRenderer.on("save_frame", (event, filename) => {
	renderer.save_frame(filename);
});

ipcRenderer.on("save_entities", (event, filename) => {
	renderer.save_entities(filename);
});

ipcRenderer.on("save_moves", (event, filename) => {
	renderer.save_moves(filename);
});

ipcRenderer.on("save_events", (event, filename) => {
	renderer.save_events(filename);
});

ipcRenderer.on("forward", (event, n) => {
	renderer.forward(n);
});

ipcRenderer.on("go_to_turn", (event, n) => {
	renderer.go_to_turn(n, true);
});

ipcRenderer.on("toggle_autoplay", () => {
	renderer.toggle_autoplay();
});

ipcRenderer.on("stop_autoplay", () => {
	renderer.stop_autoplay();
});

ipcRenderer.on("right", (event, n) => {
	renderer.right(n);
});

ipcRenderer.on("down", (event, n) => {
	renderer.down(n);
});

ipcRenderer.on("farside", () => {
	renderer.farside();
});

ipcRenderer.on("next_collision", () => {
	renderer.next_collision();
});

ipcRenderer.on("previous_collision", () => {
	renderer.next_collision(true);              // Reverse flag
});

ipcRenderer.on("ship_fate", () => {
	renderer.ship_fate();
});

ipcRenderer.on("select_sid", (event, sid) => {
	renderer.select_sid(sid);
});

ipcRenderer.on("set", (event, foo) => {
	renderer.set(foo[0], foo[1]);               // Format is [attrname, value]
});

ipcRenderer.on("prefs_changed", (event, prefs) => {
	renderer.set("prefs", prefs);
});

ipcRenderer.on("log", (event, msg) => {
	console.log(msg);
});

window.addEventListener("resize", () => renderer.draw());

canvas.addEventListener("mousedown", (event) => renderer.click(event));

// Setup drag-and-drop...

window.ondragover = () => false;
window.ondragleave = () => false;
window.ondragend = () => false;
window.ondrop = (event) => {
	event.preventDefault();
	renderer.open(get_path_for_file(event.dataTransfer.files[0]));
	ipcRenderer.send("show_window", "renderer");
	ipcRenderer.send("stop_monitoring", null);
	return false;
};

renderer.clear();

// Give the window and canvas a little time to settle... (may prevent sudden jerk during load).

setTimeout(() => {
	ipcRenderer.send("renderer_ready", null);
}, 200);
