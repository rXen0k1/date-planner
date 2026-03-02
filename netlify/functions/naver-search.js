export async function handler(event) {
  const query = event.queryStringParameters.query || "";
  const sortParam = event.queryStringParameters.sort === "comment" ? "comment" : "random";

  if (!query.trim()) {
    return { statusCode: 400, body: "query required" };
  }

  const url =
    "https://openapi.naver.com/v1/search/local.json" +
    `?query=${encodeURIComponent(query)}&display=5&start=1&sort=${sortParam}`;

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
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "naver_search_failed" }),
    };
  }
}
