'use strict';

var assert = require('assert');
var core = require('../core/auvia-core.js');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (e) {
    console.error('fail - ' + name);
    console.error(e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
}

test('parseOsmPriceTag cheap/expensive', function () {
  assert.strictEqual(core.parseOsmPriceTag('cheap'), 'cheap');
  assert.strictEqual(core.parseOsmPriceTag('€€€'), 'expensive');
  assert.strictEqual(core.parseOsmPriceTag('$$'), 'normal');
});

test('parseOpeningHours 24/7', function () {
  var p = core.parseOpeningHours('24/7');
  assert.strictEqual(p.alwaysOpen, true);
  assert.strictEqual(core.isOpenAtParsed(p, 1, 3 * 60), true);
});

test('parseOpeningHours Mo-Fr window', function () {
  var p = core.parseOpeningHours('Mo-Fr 09:00-18:00');
  assert.ok(p.rules && p.rules.length);
  // Monday 10:00 open
  assert.strictEqual(core.isOpenAtParsed(p, 1, 10 * 60), true);
  // Monday 20:00 closed
  assert.strictEqual(core.isOpenAtParsed(p, 1, 20 * 60), false);
  // Sunday unknown/closed for this rule set
  assert.strictEqual(core.isOpenAtParsed(p, 0, 10 * 60), null);
});

test('buildPlaceDeepLinks ko map reserve menu are the same place search', function () {
  var links = core.buildPlaceDeepLinks({ name: '테스트카페', addr: '서울' }, 'ko');
  assert.ok(links.map.indexOf('map.naver.com') !== -1);
  assert.strictEqual(links.reserve, links.map);
  assert.strictEqual(links.menu, links.map);
  assert.ok(decodeURIComponent(links.map).indexOf('테스트카페') !== -1);
  assert.ok(decodeURIComponent(links.map).indexOf('예약') === -1);
  assert.ok(decodeURIComponent(links.map).indexOf('메뉴') === -1);
});

test('buildPlaceDeepLinks en uses google', function () {
  var links = core.buildPlaceDeepLinks({ name: 'Cafe', lat: 37.5, lon: 127.0 }, 'en');
  assert.ok(links.map.indexOf('google.com/maps') !== -1);
});

if (!process.exitCode) {
  console.log('All tests passed.');
}
