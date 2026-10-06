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
  assert.strictEqual(core.isOpenAtParsed(p, 1, 10 * 60), true);
  assert.strictEqual(core.isOpenAtParsed(p, 1, 20 * 60), false);
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

test('buildPlaceSearchQuery uses branch name when present', function () {
  var q = core.buildPlaceSearchQuery({
    name: '청년감자탕순대국 파주야당역점',
    addr: '경기도 파주시 야당동 123'
  });
  assert.strictEqual(q, '청년감자탕순대국 파주야당역점');
});

test('buildPlaceSearchQuery prefers specific naverName over brand-only name', function () {
  var q = core.buildPlaceSearchQuery({
    name: '도미노피자',
    naverName: '도미노피자 역삼점',
    addr: '서울 강남구'
  });
  assert.strictEqual(q, '도미노피자 역삼점');
});

test('buildPlaceDeepLinks ko searches specific branch not brand only', function () {
  var links = core.buildPlaceDeepLinks({
    name: '도미노피자',
    naverName: '도미노피자 역삼점',
    addr: '서울 강남구 역삼동',
    lat: 37.5,
    lon: 127.03
  }, 'ko');
  assert.ok(links.map.indexOf('/v5/search/') !== -1);
  assert.strictEqual(decodeURIComponent(links.map.split('/v5/search/')[1]), '도미노피자 역삼점');
  assert.ok(decodeURIComponent(links.map).indexOf('경기도') === -1);
});

test('buildPlaceDeepLinks en uses google', function () {
  var links = core.buildPlaceDeepLinks({ name: 'Cafe', lat: 37.5, lon: 127.0 }, 'en');
  assert.ok(links.map.indexOf('google.com/maps') !== -1);
});

if (!process.exitCode) {
  console.log('All tests passed.');
}
