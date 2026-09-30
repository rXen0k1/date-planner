/**
 * Pure helpers for unit tests (mirrors app.js cost/hours logic).
 * Keep in sync when changing estimate/opening-hours behavior.
 */
'use strict';

function parseOsmPriceTag(value) {
  if (value == null || value === '') return null;
  var v = String(value).toLowerCase().trim();
  if (v === 'cheap' || v === 'low' || v === 'free' || v === '€' || v === '$' || v === '1') return 'cheap';
  if (v === 'expensive' || v === 'high' || v === '€€€' || v === '€€€€' || v === '$$$$' || v === '4' || v === '3') return 'expensive';
  if (v === 'moderate' || v === '€€' || v === '$$' || v === '2') return 'normal';
  var num = parseFloat(v.replace(/[^\d.]/g, ''), 10);
  if (!isNaN(num)) {
    if (num <= 1) return 'cheap';
    if (num >= 3) return 'expensive';
    return 'normal';
  }
  return null;
}

var DAY_ALIASES = {
  mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 0,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0
};

function parseDayToken(tok) {
  tok = String(tok || '').toLowerCase().replace(/\./g, '');
  return DAY_ALIASES[tok];
}

function expandDayRange(a, b) {
  var out = [];
  if (a == null || b == null) return out;
  var cur = a;
  for (var n = 0; n < 7; n++) {
    out.push(cur);
    if (cur === b) break;
    cur = (cur + 1) % 7;
  }
  return out;
}

function parseTimeToMin(hhmm) {
  var m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var h = parseInt(m[1], 10);
  var mi = parseInt(m[2], 10);
  if (h > 24 || mi > 59) return null;
  return Math.min(24 * 60, h * 60 + mi);
}

function parseOpeningHours(ohRaw) {
  var oh = String(ohRaw || '').trim();
  if (!oh) return { unknown: true };
  var lower = oh.toLowerCase();
  if (lower === '24/7') return { alwaysOpen: true };
  if (lower === 'closed' || lower === 'off' || lower === 'permanently closed') return { closed: true };
  var rules = [];
  var parts = oh.split(';');
  for (var pi = 0; pi < parts.length; pi++) {
    var part = parts[pi].trim();
    if (!part) continue;
    if (/^ph\b/i.test(part)) continue;
    if (/^(closed|off)$/i.test(part)) {
      rules.push({ days: null, closed: true });
      continue;
    }
    var rm = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?(?:,[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)\s+(.+)$/);
    if (!rm) continue;
    var dayPart = rm[1];
    var timePart = rm[2].trim();
    var days = [];
    dayPart.split(',').forEach(function (seg) {
      var ab = seg.split('-');
      var d0 = parseDayToken(ab[0]);
      var d1 = ab[1] ? parseDayToken(ab[1]) : d0;
      days = days.concat(expandDayRange(d0, d1));
    });
    if (/^(closed|off)$/i.test(timePart)) {
      rules.push({ days: days, closed: true });
      continue;
    }
    var tm = timePart.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!tm) continue;
    var openMin = parseTimeToMin(tm[1]);
    var closeMin = parseTimeToMin(tm[2]);
    if (openMin == null || closeMin == null) continue;
    rules.push({ days: days, openMin: openMin, closeMin: closeMin });
  }
  if (!rules.length) return { unknown: true };
  return { rules: rules };
}

function isOpenAtParsed(parsed, dayOfWeek, minuteOfDay) {
  if (!parsed || parsed.unknown) return null;
  if (parsed.alwaysOpen) return true;
  if (parsed.closed) return false;
  var matched = false;
  var open = false;
  for (var i = 0; i < parsed.rules.length; i++) {
    var r = parsed.rules[i];
    if (r.days && r.days.indexOf(dayOfWeek) === -1) continue;
    matched = true;
    if (r.closed) { open = false; continue; }
    if (r.closeMin <= r.openMin) {
      if (minuteOfDay >= r.openMin || minuteOfDay < r.closeMin) open = true;
    } else if (minuteOfDay >= r.openMin && minuteOfDay < r.closeMin) {
      open = true;
    }
  }
  if (!matched) return null;
  return open;
}

function buildPlaceDeepLinks(place, lang) {
  var name = (place && place.name) || '';
  var addr = (place && place.addr) || '';
  var q = (name + (addr ? ' ' + addr : '')).trim() || name;
  var enc = encodeURIComponent(q);
  var encName = encodeURIComponent(name);
  var lat = place && place.lat != null ? Number(place.lat) : null;
  var lon = place && place.lon != null ? Number(place.lon) : null;
  if (lang === 'en') {
    var gq = (lat != null && lon != null && !isNaN(lat) && !isNaN(lon))
      ? ('https://www.google.com/maps?q=' + lat + ',' + lon)
      : ('https://www.google.com/maps/search/?api=1&query=' + enc);
    return { map: gq, reserve: gq, menu: gq, kakao: 'https://map.kakao.com/?q=' + encName };
  }
  var placeSearch = 'https://map.naver.com/v5/search/' + enc;
  return {
    map: placeSearch,
    reserve: placeSearch,
    menu: placeSearch,
    kakao: 'https://map.kakao.com/?q=' + encName
  };
}

module.exports = {
  parseOsmPriceTag: parseOsmPriceTag,
  parseOpeningHours: parseOpeningHours,
  isOpenAtParsed: isOpenAtParsed,
  buildPlaceDeepLinks: buildPlaceDeepLinks
};
