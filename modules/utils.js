"use strict";

exports.make = (base, params) => {
	return Object.assign(Object.create(base), params);
}

exports.assign_without_overwrite = (target, source) => {
	if (target === undefined) {
		throw new Error("assign_without_overwrite() called without arguments");
	}
	if (source === undefined) {
		return;
	}
	let keys = Object.keys(source)
	for (let key in keys) {
		if (target.hasOwnProperty(key) === false) {
			target[key] = source[key];
		}
	}
}

// Sorts the given array by results of a function applied to all elements.
exports.sort_by = (list, key) => {
	return list.sort((a,b) => {
		const key_a = key(a);
		const key_b = key(b);
		if (key_a < key_b) {
			return -1;
		}
		else if (key_a > key_b) {
			return 1;
		}
		else {
			return 0;
		}
	});
}
