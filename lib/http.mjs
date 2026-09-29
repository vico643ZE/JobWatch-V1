export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function fetchJson(
  url,
  { fetcher = fetch, retries = 2, timeout = 15000, ...options } = {},
) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetcher(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
        headers: {
          Accept: "application/json",
          "User-Agent": "JobWatch/2.0 (personal job monitoring)",
          ...options.headers,
        },
      });
    } catch (error) {
      if (attempt >= retries)
        throw new Error("Source injoignable ou délai dépassé");
      await delay(500 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      const text = await response.text();
      if (text.length > 8_000_000)
        throw new Error("Réponse source trop volumineuse");
      return JSON.parse(text);
    }
    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < retries
    ) {
      const wait = Number(response.headers.get("retry-after"));
      await delay(
        Number.isFinite(wait) && wait > 0
          ? Math.min(30000, wait * 1000)
          : 500 * 2 ** attempt,
      );
      continue;
    }
    const error = new Error(`Source HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
}
