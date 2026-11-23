/**
 * test/test-levelbar.js - what the level bar of a Brightness key shows: the
 * panel's level from a subscription to the settings service's backlight, a
 * read of the settings service while that has not answered, the style kept
 * for two seconds, and the part of the key filter that opens the bar
 *
 * Strict ES5: runs on node 0.12.
 */
require('./fake-clock').install();
var assert = require('assert');
var vm = require('vm');
var levelBar = require('../server/lib/levelbar');

console.log('Running test-levelbar.js ...');

var reads = 0;
var panel = 40;
var style = 'lg';
var styleReads = 0;
var subs = [];

function FakeSub(uri, payload, appId, handlers) {
  this.uri = uri; this.payload = payload; this.handlers = handlers; this.running = false;
  subs.push(this);
}
FakeSub.prototype.start = function () { this.running = true; };
FakeSub.prototype.stop = function () { this.running = false; };

function luna(uri, payload, cb) {
  assert.strictEqual(uri, 'com.webos.service.settings/getSystemSettings');
  assert.deepEqual(payload, { category: 'picture', keys: ['backlight'] });
  reads++;
  process.nextTick(function () { cb({ returnValue: true, settings: { backlight: String(panel) } }); });
}

function start() {
  reads = 0; styleReads = 0; subs = [];
  levelBar.init({ luna: luna, subscription: FakeSub, idleMs: 40, readStyle: function () { styleReads++; return style; } });
}

var steps = [];
function step(name, fn) { steps.push({ name: name, fn: fn }); }
function next() {
  var s = steps.shift();
  if (!s) { console.log('test-levelbar.js passed'); return process.exit(0); }
  s.fn(function () { console.log('  ✓ ' + s.name); next(); });
}

step('with no luna to ask, the answer is that there is none', function (done) {
  levelBar.init({});
  levelBar.getBrightness(function (r) {
    assert.deepEqual(r, { ok: false });
    done();
  });
});

step('the first ask reads the settings service and starts a subscription to the backlight', function (done) {
  start();
  levelBar.getBrightness(function (r) {
    assert.deepEqual(r, { ok: true, level: 40, style: 'lg' });
    assert.strictEqual(reads, 1);
    assert.strictEqual(subs.length, 1);
    assert.strictEqual(subs[0].uri, 'com.webos.settingsservice/getSystemSettings');
    assert.deepEqual(subs[0].payload, { category: 'picture', keys: ['backlight'], subscribe: true });
    assert.ok(subs[0].running);
    done();
  });
});

step('once the subscription has answered, the level is its and no further read is made', function (done) {
  subs[0].handlers.message({ returnValue: true, subscribed: true, settings: { backlight: '55' } });
  levelBar.getBrightness(function (r) {
    assert.deepEqual(r, { ok: true, level: 55, style: 'lg' });
    assert.strictEqual(reads, 1);
    subs[0].handlers.message({ returnValue: true, settings: { backlight: '30' } });
    levelBar.getBrightness(function (r2) {
      assert.strictEqual(r2.level, 30, 'and it follows each change it is sent');
      assert.strictEqual(reads, 1);
      done();
    });
  });
});

step('an answer with no level, or a refusal, is not kept', function (done) {
  subs[0].handlers.message({ returnValue: false, errorText: 'Access denied' });
  levelBar.getBrightness(function (r) {
    assert.strictEqual(r.level, 40, 'the ask goes to the settings service again');
    assert.strictEqual(reads, 2);
    done();
  });
});

step('the style is read at most every two seconds, and again once it has changed', function (done) {
  start();
  levelBar.getBrightness(function () {
    levelBar.getBrightness(function () {
      assert.strictEqual(styleReads, 1, 'two asks, one read of the style');
      style = 'horizontal';
      levelBar.getBrightness(function (r) {
        assert.strictEqual(r.style, 'lg', 'the style kept is used for two seconds');
        levelBar.forgetStyle();
        levelBar.getBrightness(function (r2) {
          assert.strictEqual(r2.style, 'horizontal', 'a change of style is seen at once');
          setTimeout(function () {
            levelBar.getBrightness(function (r3) {
              assert.strictEqual(r3.style, 'horizontal');
              assert.ok(styleReads >= 2);
              style = 'lg';
              done();
            });
          }, 2500);
        });
      });
    });
  });
});

step('a closed subscription is not trusted, and with no asks for a while it is stopped and started again by the next', function (done) {
  start();
  levelBar.getBrightness(function () {
    subs[0].handlers.message({ returnValue: true, settings: { backlight: '70' } });
    subs[0].handlers.close();
    levelBar.getBrightness(function (r) {
      assert.strictEqual(r.level, 40, 'after it closes the ask is made of the settings service');
      assert.strictEqual(reads, 2);
      setTimeout(function () {
        assert.strictEqual(subs[0].running, false, 'stopped when no one has asked for a while');
        levelBar.getBrightness(function () {
          assert.strictEqual(subs.length, 2, 'the next ask starts another');
          assert.ok(subs[1].running);
          levelBar.stop();
          assert.strictEqual(subs[1].running, false, 'stop() ends it');
          done();
        });
      }, 100);
    });
  });
});

step('only the four styles are valid', function (done) {
  assert.ok(levelBar.isStyle('lg'));
  assert.ok(levelBar.isStyle('horizontal'));
  assert.ok(levelBar.isStyle('vertical'));
  assert.ok(levelBar.isStyle('none'));
  assert.ok(!levelBar.isStyle('diagonal'));
  assert.ok(!levelBar.isStyle(undefined));
  assert.deepEqual(levelBar.STYLES, ['lg', 'horizontal', 'vertical', 'none']);
  done();
});

step('the filter opens the bar\'s app once for each press, with the level and the style, and only where it is wanted', function (done) {
  var launched = [];
  var sandbox = { applicationManager: { launch: function (id, params) { launched.push({ id: id, params: JSON.parse(params) }); } } };
  // The two values it reads from the configd value, as the filter's own read places them.
  var value = { osd: true, osdStyle: 'horizontal' };
  var code = 'var value = ' + JSON.stringify(value) + ';\n' + levelBar.filterShow('com.example.bar') + '\n' +
    levelBar.filterConfig() + '\n' +
    'glasshouseBrightnessShow(60, 1); glasshouseBrightnessShow(70, 1); glasshouseBrightnessShow(80, 2);';
  vm.runInNewContext(code, sandbox);
  assert.deepEqual(launched.map(function (l) { return l.params.level; }), [60, 80], 'once for each press');
  assert.strictEqual(launched[0].id, 'com.example.bar');
  assert.deepEqual(launched[0].params, { glasshouse: 'osd', kind: 'brightness', level: 60, style: 'horizontal' });
  launched.length = 0;
  vm.runInNewContext('var value = {};\n' + levelBar.filterShow('com.example.bar') + '\n' + levelBar.filterConfig() + '\nglasshouseBrightnessShow(60, 1);', sandbox);
  assert.deepEqual(launched, [], 'nothing opens with no Brightness key set');
  launched.length = 0;
  vm.runInNewContext('var value = { osd: true, osdStyle: "diagonal" };\n' + levelBar.filterShow('com.example.bar') + '\n' + levelBar.filterConfig() + '\nglasshouseBrightnessShow(60, 1);', sandbox);
  assert.strictEqual(launched[0].params.style, 'lg', 'an unknown style is the LG-style one');
  launched.length = 0;
  vm.runInNewContext('var value = { osd: true, osdStyle: "vertical" };\n' + levelBar.filterShow('com.example.bar') + '\n' + levelBar.filterConfig() + '\nglasshouseBrightnessShow(60, 1);', sandbox);
  assert.strictEqual(launched[0].params.style, 'vertical', 'the upright pill is passed on');
  done();
});

step('the compositor\'s bar is only on the compositor while a Brightness key is set, in every style, and is taken off when none is', function (done) {
  var made = 0, destroyed = 0, launched = [];
  function bar() { made++; return { show: function () { return true; }, hide: function () {}, destroy: function () { destroyed++; }, volumeBar: null }; }
  var volumeBar = { restartClosingTimer: function () {}, closeView: function () {} };
  var view = { children: [volumeBar] };
  view.parent = { children: [view] };
  var sandbox = vm.createContext({
    console: console,
    applicationManager: { launch: function (id, params) { launched.push(JSON.parse(params).level); } },
    views: { starfishVolume: view },
    Qt: { createQmlObject: bar }
  });
  var setup = levelBar.filterShow('com.example.bar');
  var config = function (value) { return 'var value = ' + JSON.stringify(value) + ';\n' + levelBar.filterConfig(); };
  vm.runInContext(setup, sandbox);
  vm.runInContext(config({}), sandbox);
  assert.strictEqual(made, 0, 'nothing is made with no Brightness key set');
  vm.runInContext(config({ osd: true }), sandbox);
  assert.strictEqual(made, 1, 'made with a key set');
  vm.runInContext(config({ osd: true, osdStyle: 'horizontal' }), sandbox);
  vm.runInContext(config({ osd: true, osdStyle: 'vertical' }), sandbox);
  assert.strictEqual(made, 1, 'and only once, whatever the style: it draws them all');
  assert.strictEqual(destroyed, 0);
  vm.runInContext(config({}), sandbox);
  assert.strictEqual(destroyed, 1, 'taken off the compositor when the keys are cleared');
  vm.runInContext(config({ osd: true }), sandbox);
  assert.strictEqual(made, 2, 'made again when a key is set again');
  // A volume view without LG's volume bar still holds the bar: LG's pictures are left to the item, which draws the layout itself.
  made = 0; destroyed = 0; launched.length = 0;
  var other = { children: [{ children: [] }] };
  other.parent = { children: [other] };
  var sandbox2 = vm.createContext({
    console: console,
    applicationManager: { launch: function (id, params) { launched.push(JSON.parse(params).level); } },
    views: { starfishVolume: other },
    Qt: { createQmlObject: bar }
  });
  vm.runInContext(setup + '\n' + config({ osd: true }) + '\nglasshouseBrightnessShow(40, 1);', sandbox2);
  assert.strictEqual(made, 1);
  assert.deepEqual(launched, [], 'no app opens');
  // Where the QML cannot be made the app opens, once for each press, and the failure is not tried again.
  made = 0; launched.length = 0;
  var tried = 0;
  var sandbox3 = vm.createContext({
    console: { warn: function () {}, log: console.log },
    applicationManager: { launch: function (id, params) { launched.push(JSON.parse(params).level); } },
    views: { starfishVolume: view },
    Qt: { createQmlObject: function () { tried++; throw new Error('Cannot load library'); } }
  });
  vm.runInContext(setup + '\n' + config({ osd: true }) + '\nglasshouseBrightnessShow(40, 1); glasshouseBrightnessShow(50, 2);', sandbox3);
  assert.strictEqual(tried, 1, 'tried once');
  assert.deepEqual(launched, [40, 50], 'the app opens');
  done();
});

step('the custom volume bar is only used where LG\'s volume files are the known ones', function (done) {
  var fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
  var dir = fs.mkdtempSync ? fs.mkdtempSync(path.join(os.tmpdir(), 'gh-vol-')) : path.join(os.tmpdir(), 'gh-vol-' + process.pid);
  try { fs.mkdirSync(dir); } catch (e) {}
  fs.mkdirSync(path.join(dir, 'volume'));
  var files = { 'StarfishVolumeView.qml': 'view', 'volume/StarfishVolume.qml': 'volume', 'volume/StarfishVolumeMute.qml': 'mute' };
  var hashes = {};
  Object.keys(files).forEach(function (n) {
    fs.writeFileSync(path.join(dir, n), files[n]);
    hashes[n] = crypto.createHash('sha256').update(files[n]).digest('hex');
  });
  levelBar.init({ volumeQmlDir: dir, volumeQmlHashes: hashes });
  assert.strictEqual(levelBar.volumeFilesKnown(), true, 'the three files with their hashes');
  fs.writeFileSync(path.join(dir, 'volume/StarfishVolume.qml'), 'changed by a firmware update');
  assert.strictEqual(levelBar.volumeFilesKnown(), true, 'read once, not on every ask');
  levelBar.init({ volumeQmlDir: dir, volumeQmlHashes: hashes });
  assert.strictEqual(levelBar.volumeFilesKnown(), false, 'one file different: not known');
  fs.writeFileSync(path.join(dir, 'volume/StarfishVolume.qml'), files['volume/StarfishVolume.qml']);
  fs.unlinkSync(path.join(dir, 'volume/StarfishVolumeMute.qml'));
  levelBar.init({ volumeQmlDir: dir, volumeQmlHashes: hashes });
  assert.strictEqual(levelBar.volumeFilesKnown(), false, 'one file missing: not known');
  levelBar.init({ volumeQmlDir: path.join(dir, 'nowhere') });
  assert.strictEqual(levelBar.volumeFilesKnown(), false, 'no LG files at all (this computer): not known');
  assert.deepEqual(Object.keys(levelBar.VOLUME_QML_HASHES), ['StarfishVolumeView.qml', 'volume/StarfishVolume.qml', 'volume/StarfishVolumeMute.qml']);
  Object.keys(levelBar.VOLUME_QML_HASHES).forEach(function (n) { assert.ok(/^[0-9a-f]{64}$/.test(levelBar.VOLUME_QML_HASHES[n]), n + ' has a sha256'); });
  done();
});

step('the QML draws the volume for each output and state it knows, and leaves the rest to LG\'s bar', function (done) {
  var qml = levelBar.COMPOSITOR_BAR_QML;
  assert.ok(/import WebOSCompositorBase 1\.0/.test(qml), 'LS comes from the compositor\'s base module');
  assert.ok(/if \(a\.mode === "internal"\) return null;/.test(qml), 'internal mode, where LG draws nothing, is left to LG');
  assert.ok(/if \(volumeBar && volumeBar\.partialViewState\) return null;/.test(qml), 'so is partial view');
  assert.ok(/lgView\.available === false/.test(qml), 'nothing is drawn where LG\'s view is not available (volume OSD off)');
  // Mute: the mute icon replaces the output's icon at the top of the bar, the level stays.
  assert.ok(/if \(a\.muted\) return \{ layout: hasLevel \? "level" : "icon", file: "ic_volume_mute\.png" \};/.test(qml), 'muted: the mute icon, with the level where there is one');
  assert.ok(/if \(a\.disabled\) return \{ layout: "icon", file: "volume_disabled\.png" \};/.test(qml), 'disabled: LG\'s disabled picture alone');
  // Outputs: LG's own icons, and arrows where the TV does not know the volume.
  var icons = {
    headphone: 'ic_headphone.png', bt_soundbar: 'ic_bluetooth.png', bt_atmos: 'ic_bluetooth.png',
    tv_speaker_bluetooth: 'ic_bluetoothsorround.png', tv_speaker_bt_surround: 'ic_bluetoothsorround.png',
    wisa_speaker: 'ic_wisa.png', wow_cast: 'volume_wowcast.png', tv_speaker_wow_cast: 'volume_wowcast.png',
    flex_connector: 'ic_wifi_dolbyatmos.png'
  };
  Object.keys(icons).forEach(function (o) {
    assert.ok(qml.indexOf('"' + o + '": "' + icons[o] + '"') !== -1, o + ' has LG\'s icon ' + icons[o]);
  });
  ['external_optical', 'external_arc', 'external_arc_sound_mode_sync', 'lineout', 'urcu_oss', 'tv_speaker_external_arc_harmony', 'wow_cast', 'tv_speaker_wow_cast'].forEach(function (o) {
    assert.ok(qml.indexOf('"' + o + '"') !== -1, o + ' is one of LG\'s exterior outputs');
  });
  assert.ok(/var hasLevel = !exterior \|\| a\.volumeSyncable;/.test(qml), 'an exterior output the TV cannot set has no level');
  assert.ok(/layout: hasLevel \? "level" : "arrows"/.test(qml), 'and gets LG\'s arrows');
  // Pictures: the one the look needs must have loaded, or LG's bar is left to draw it.
  assert.ok(/if \(volIcon\.status !== Image\.Ready\) return false;/.test(qml), 'the icon must have loaded');
  assert.ok(/if \(look\.layout === "arrows" && !arrowsReady\) return false;/.test(qml), 'and the arrows, for that look');
  // Giving LG's bar back.
  assert.ok(/Component\.onDestruction: \{ if \(lgView && customVolume\) lgView\.opacity = 1; \}/.test(qml), 'LG\'s bar is given back when the item is destroyed');
  assert.ok(/if \(!rightEdge \|\| customVolume\) return;/.test(qml), 'nothing gives way to a bar that is hidden');
  assert.ok(/onTriggered: \{ fade\.start\(\); bar\.releaseIfMuted\(\); \}/.test(qml), 'after the pill\'s time ...');
  assert.ok(/if \(volumeOn && customVolume && kind === "volume" && volumeMuted\) \{\s+lgReleased = true;\s+if \(lgView\) lgView\.opacity = 1;/.test(qml), '... a muted TV is left to LG\'s own mute icon');
  assert.ok(/function showVolume\(\) \{\s+lgReleased = false;/.test(qml), 'and the next volume change takes the place again');
  done();
});

step('the QML draws the four looks and waits for every one of LG\'s pictures', function (done) {
  var qml = levelBar.COMPOSITOR_BAR_QML;
  ['trackImage', 'fillImage', 'capTop', 'capBottom', 'arrowUp', 'arrowDown'].forEach(function (id) {
    assert.ok(new RegExp(id + '\\.status === Image\\.Ready').test(qml), id + ' is checked');
  });
  assert.ok(/property bool nativeLook: ready && volumeBar !== null/.test(qml), 'LG\'s pictures need LG\'s volume bar too');
  assert.ok(/style === "horizontal" \? "h" : style === "vertical" \? "v" : \(nativeLook \? "lg" : "lgdrawn"\)/.test(qml), 'the look is chosen by the style and by what loaded');
  assert.ok(/function show\(value, style\)/.test(qml));
  assert.ok(!/\n\s*Image \{[^}]*visible: bar\.mode === "lgdrawn"/.test(qml), 'the drawn look uses no picture');
  done();
});

step('the filter makes the item for the custom volume bar with no Brightness key set, and switches it with the configd value', function (done) {
  var made = 0, destroyed = 0, items = [];
  var volumeBar = { restartClosingTimer: function () {}, closeView: function () {} };
  var view = { children: [volumeBar] };
  view.parent = { children: [view] };
  var sandbox = vm.createContext({
    console: console,
    applicationManager: { launch: function () { assert.fail('no app'); } },
    views: { starfishVolume: view },
    Qt: { createQmlObject: function () { made++; var item = { destroy: function () { destroyed++; }, show: function () { return true; } }; items.push(item); return item; } }
  });
  var config = function (value) { return 'var value = ' + JSON.stringify(value) + ';\n' + levelBar.filterConfig(); };
  vm.runInContext(levelBar.filterShow('com.example.bar'), sandbox);
  vm.runInContext(config({}), sandbox);
  assert.strictEqual(made, 0, 'nothing with neither');
  vm.runInContext(config({ volume: 'pill' }), sandbox);
  assert.strictEqual(made, 1, 'made for the volume bar alone');
  assert.strictEqual(items[0].volumeOn, true, 'and switched on');
  assert.strictEqual(items[0].lgView, view, 'given LG\'s volume view to hide');
  vm.runInContext(config({ volume: 'pill', osd: true }), sandbox);
  assert.strictEqual(made, 1, 'one item serves both');
  vm.runInContext(config({ osd: true }), sandbox);
  assert.strictEqual(items[0].volumeOn, false, 'the volume bar switched off, LG\'s given back by the item');
  assert.strictEqual(destroyed, 0, 'and the item kept for the brightness bar');
  vm.runInContext(config({}), sandbox);
  assert.strictEqual(destroyed, 1, 'taken off when neither needs it');
  done();
});

step('the bar is drawn once for each level and no app is opened', function (done) {
  var launched = [], made = [], shown = [], destroyed = 0, ready = true;
  var old = { objectName: levelBar.COMPOSITOR_BAR, destroy: function () { destroyed++; } };
  var volumeBar = { restartClosingTimer: function () {}, closeView: function () {} };
  var volumeMute = { moveDirection: 'down', closeView: function () {} };
  var volumeView = { children: [{ children: [volumeMute] }, volumeBar] };
  var host = { children: [volumeView, old] };
  volumeView.parent = host;
  var sandbox = {
    console: console,
    applicationManager: { launch: function (id, params) { launched.push(JSON.parse(params).level); } },
    views: { starfishVolume: volumeView },
    Qt: { createQmlObject: function (qml, parent, name) {
      made.push({ qml: qml, parent: parent, name: name });
      return made[made.length - 1].bar = { show: function (level, style) { shown.push([level, style]); return ready; }, hide: function () {} };
    } }
  };
  var code = 'var value = { osd: true };\n' + levelBar.filterShow('com.example.bar') + '\n' + levelBar.filterConfig() + '\n' +
    'glasshouseBrightnessShow(60, 1); glasshouseBrightnessShow(70, 1); glasshouseBrightnessShow(80, 2);';
  vm.runInNewContext(code, sandbox);
  assert.strictEqual(made.length, 1, 'made once, ahead of the first press');
  assert.strictEqual(made[0].parent, host, 'beside the volume view');
  assert.strictEqual(destroyed, 1, 'one left by an earlier copy of the filter is taken off');
  assert.ok(/objectName: "glasshouseBrightnessBar"/.test(made[0].qml));
  assert.strictEqual(made[0].bar.volumeBar, volumeBar, 'told LG\'s volume bar, to close it early');
  assert.strictEqual(made[0].bar.volumeMute, volumeMute, 'and LG\'s mute icon, found under the positioner');
  assert.deepEqual(shown, [[60, 'lg'], [70, 'lg'], [80, 'lg']], 'every level, not once for each press, with the style');
  assert.deepEqual(launched, [], 'no app opened');
  // The pill styles go to the same item.
  shown.length = 0;
  vm.runInNewContext(code.replace('{ osd: true }', '{ osd: true, osdStyle: "vertical" }'), sandbox);
  assert.deepEqual(shown.map(function (x) { return x[1]; }), ['vertical', 'vertical', 'vertical']);
  assert.deepEqual(launched, []);
  // An item that cannot show the level leaves it to the app.
  ready = false; made.length = 0; shown.length = 0;
  vm.runInNewContext(code, sandbox);
  assert.deepEqual(launched, [60, 80], 'the app, once for each press');
  done();
});

next();
