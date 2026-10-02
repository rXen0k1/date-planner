const OVERPASS_URLS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
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
  return [
    "[out:json][timeout:8];",
    "(",
    `nwr["amenity"~"restaurant|cafe|fast_food|bar|ice_cream"](around:${radius},${lat},${lng});`,
    `nwr["tourism"~"museum|gallery|theme_park|attraction"](around:${radius},${lat},${lng});`,
    `nwr["shop"~"mall|department_store"](around:${radius},${lat},${lng});`,
    `nwr["leisure"~"park|garden"](around:${radius},${lat},${lng});`,
    ");",
    "out center tags 180;",
  ].join("");
}

async function fetchOne(url, body, controllers) {
  const ac = new AbortController();
  controllers.push(ac);
  const timer = setTimeout(() => ac.abort(), 8000);
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
    if (!elements.length) return null;
    controllers.forEach((c) => {
      try { c.abort(); } catch (e) { /* already done */ }
    });
    return elements;
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
  const controllers = [];
  const results = await Promise.all(OVERPASS_URLS.map((url) => fetchOne(url, body, controllers)));
  const elements = results.find((list) => list && list.length) || null;
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
