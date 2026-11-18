/*
 * lib/remotes.js - the LG remotes Glasshouse knows: what each is called by the
 * TV, which of the Remote tab's keys it has, and its picture
 *
 * The data is remotes.json, kept as plain data so docs/remotes.md is made from
 * it (scripts/gen-remotes-doc.py) and the two cannot drift. Each entry's keys
 * are the ids in remotekeys.js's KEYS with where the fact came from: measured
 * on a TV, documented, or assumed. An entry is `complete` only once its list is
 * every button the remote has; a list that is not complete says what is known
 * and never says a key is absent.
 *
 * Strict ES5: runs on node 0.12.
 */
var fs = require('fs');
var path = require('path');

// Stands in for a remote with no picture of its own; served as /assets/remotes/<file>.
var GENERIC_IMAGE = 'generic.png';

var cache = null;

function load() {
  if (cache) return cache;
  var list = [];
  try {
    var parsed = JSON.parse(fs.readFileSync(path.join(__dirname, 'remotes.json'), 'utf8'));
    if (parsed && Array.isArray(parsed.remotes)) list = parsed.remotes;
  } catch (e) {
    console.error('remotes: could not read remotes.json: ' + e.message);
  }
  cache = list;
  return cache;
}

// Every remote, in the file's order.
function all() {
  return load().slice();
}

// "LGE MR26GA", "lge mr26ga" and "MR26GA" are one name.
function normalizeName(name) {
  return String(name == null ? '' : name).replace(/^\s*LGE\s+/i, '').replace(/\s+/g, '').toUpperCase();
}

// The remote a name the TV reports belongs to, or null.
function find(name) {
  var wanted = normalizeName(name);
  if (!wanted) return null;
  var list = load();
  for (var i = 0; i < list.length; i++) {
    if (normalizeName(list[i].id) === wanted) return list[i];
    for (var n = 0; n < list[i].names.length; n++) {
      if (normalizeName(list[i].names[n]) === wanted) return list[i];
    }
  }
  return null;
}

// The Remote tab key names the remote is known to have.
function keysOf(remote) {
  return remote && remote.keys ? Object.keys(remote.keys) : [];
}

function hasKey(remote, key) {
  return !!(remote && remote.keys && Object.prototype.hasOwnProperty.call(remote.keys, key));
}

// The file name of the remote's picture, under /assets/remotes/.
function imageFile(remote) {
  return remote && remote.image ? remote.image : GENERIC_IMAGE;
}

module.exports = {
  all: all,
  find: find,
  normalizeName: normalizeName,
  keysOf: keysOf,
  hasKey: hasKey,
  imageFile: imageFile,
  GENERIC_IMAGE: GENERIC_IMAGE
};
