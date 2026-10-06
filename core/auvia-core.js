/**
 * Pure helpers for unit tests (mirrors app.js cost/hours + deep-link logic).
 * Keep in sync when changing estimate/opening-hours/map-link behavior.
 */

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
  su: 0, sun: 0, sunday: 0,
  mo: 1, mon: 1, monday: 1,
  tu: 2, tue: 2, tues: 2, tuesday: 2,
  we: 3, wed: 3, wednesday: 3,
  th: 4, thu: 4, thur: 4, thursday: 4,
  fr: 5, fri: 5, friday: 5,
  sa: 6, sat: 6, saturday: 6
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

function shortenAddrForSearch(addr) {
  var s = String(addr || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.replace(/^(대한민국|South Korea|Korea)\s*,?\s*/i, '');
  var parts = s.split(/[,\s]+/).filter(Boolean);
  var useful = [];
  parts.forEach(function (p) {
    if (!p || p.length < 2) return;
    if (/^(경기도|서울특별시|부산광역시|인천광역시|대구광역시|대전광역시|광주광역시|울산광역시|세종특별자치시|강원특별자치도|제주특별자치도)$/.test(p)) return;
    if (/[시군구읍면동리가]$/.test(p) || /역$/.test(p) || /로$|길$/.test(p)) {
      useful.push(p);
    }
  });
  if (useful.length) return useful.slice(0, 2).join(' ');
  var fallback = parts.filter(function (p) {
    return p.length >= 2 && !/^(경기도|서울특별시|부산광역시|인천광역시)$/.test(p);
  }).slice(0, 2);
  return fallback.join(' ');
}

function looksLikeSpecificBranchName(name) {
  var n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!n || n.length < 3) return false;
  if (/[점관]$/.test(n)) return true;
  if (/(본점|지점|센터|타워|몰|공원|시장|백화점)/.test(n)) return true;
  if (/\s+\S+/.test(n) && n.length >= 6) return true;
  return false;
}

function exactNaverPlaceName(place) {
  var n = String((place && place.naverName) || '').replace(/\s+/g, ' ').trim();
  if (n && looksLikeSpecificBranchName(n)) return n;
  var fallback = String((place && place.name) || '').replace(/\s+/g, ' ').trim();
  return fallback || '장소';
}

function buildPlaceSearchQuery(place) {
  return exactNaverPlaceName(place);
}

function buildPlaceDeepLinks(place, lang) {
  var name = exactNaverPlaceName(place);
  var enc = encodeURIComponent(name);
  var lat = place && place.lat != null ? Number(place.lat) : null;
  var lon = place && place.lon != null ? Number(place.lon) : null;
  var hasCoords = lat != null && lon != null && !isNaN(lat) && !isNaN(lon);
  if (lang === 'en') {
    var gq = hasCoords
      ? ('https://www.google.com/maps?q=' + lat + ',' + lon)
      : ('https://www.google.com/maps/search/?api=1&query=' + enc);
    return { map: gq, reserve: gq, menu: gq, kakao: 'https://map.kakao.com/?q=' + enc };
  }
  var placeUrl = 'https://map.naver.com/v5/search/' + enc;
  return {
    map: placeUrl,
    reserve: placeUrl,
    menu: placeUrl,
    kakao: hasCoords
      ? ('https://map.kakao.com/link/map/' + enc + ',' + lat + ',' + lon)
      : ('https://map.kakao.com/?q=' + enc)
  };
}

module.exports = {
  parseOsmPriceTag: parseOsmPriceTag,
  parseOpeningHours: parseOpeningHours,
  isOpenAtParsed: isOpenAtParsed,
  buildPlaceDeepLinks: buildPlaceDeepLinks,
  buildPlaceSearchQuery: buildPlaceSearchQuery
};
