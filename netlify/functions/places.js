const OVERPASS_URLS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const cache = new Map();
const CACHE_TTL_MS = 20 * 60 * 1000;

function cacheKey(lat, lng, radius) {
  return Number(lat).toFixed(3) + "," + Number(lng).toFixed(3) + "," + radius;
}

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.elements;
}

function writeCache(key, elements) {
  if (!elements || !elements.length) return;
  cache.set(key, { at: Date.now(), elements });
  if (cache.size > 40) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

function buildQuery(lat, lng, radius) {
  // Netlify 함수 제한(약 10초) 안에서 끝나도록 가벼운 쿼리
  return [
    "[out:json][timeout:6];",
    "(",
    `node["amenity"~"restaurant|cafe|fast_food|bar"](around:${radius},${lat},${lng});`,
    `node["tourism"~"museum|gallery|attraction"](around:${radius},${lat},${lng});`,
    `node["leisure"~"park|garden"](around:${radius},${lat},${lng});`,
    `way["amenity"~"restaurant|cafe|fast_food"](around:${radius},${lat},${lng});`,
    `way["leisure"="park"](around:${radius},${lat},${lng});`,
    ");",
    "out center tags 120;",
  ].join("");
}

async function fetchOne(url, body) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4500);
  try {
    const res = await fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const elements = json.elements || [];
    return elements.length ? elements : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function handler(event) {
  const qs = event.queryStringParameters || {};
  const lat = Number(qs.lat);
  const lng = Number(qs.lng);
  const radius = Math.min(8000, Math.max(100, Math.round(Number(qs.radius) || 1000)));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { statusCode: 400, body: JSON.stringify({ error: "lat_lng_required" }) };
  }

  const key = cacheKey(lat, lng, radius);
  const cached = readCache(key);
  if (cached) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      body: JSON.stringify({ elements: cached, cached: true }),
    };
  }

  const body = "data=" + encodeURIComponent(buildQuery(lat, lng, radius));
  // 순차로 시도해 먼저 성공한 미러를 사용 (병렬 전원 타임아웃보다 성공률↑)
  let elements = null;
  for (let i = 0; i < OVERPASS_URLS.length; i++) {
    elements = await fetchOne(OVERPASS_URLS[i], body);
    if (elements && elements.length) break;
  }
  if (!elements) {
    return { statusCode: 502, body: JSON.stringify({ error: "places_failed" }) };
  }
  writeCache(key, elements);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    body: JSON.stringify({ elements, cached: false }),
  };
}
