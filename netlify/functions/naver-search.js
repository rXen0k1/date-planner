const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const qs = event.queryStringParameters || {};
  const query = qs.query || "";
  const sortParam = qs.sort === "comment" ? "comment" : "random";

  if (!query.trim()) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
      body: "query required",
    };
  }

  const url =
    "https://openapi.naver.com/v1/search/local.json" +
    `?query=${encodeURIComponent(query)}&display=10&start=1&sort=${sortParam}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_SEARCH_CLIENT_ID,
        "X-Naver-Client-Secret": process.env.NAVER_SEARCH_CLIENT_SECRET,
      },
    });

    const data = await res.json();
    return {
      statusCode: res.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "naver_search_failed" }),
    };
  }
}
