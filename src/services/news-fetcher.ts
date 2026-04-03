import { logger } from "../utils/logger";

export interface CryptoNewsItem {
  title: string;
  source: string;
}

// ─── Fetch trending crypto news headlines ───

export async function fetchCryptoNews(): Promise<CryptoNewsItem[]> {
  const sources = [
    fetchCryptoPanicHeadlines,
    fetchCoinGeckoTrending,
  ];

  for (const fetcher of sources) {
    try {
      const news = await fetcher();
      if (news.length > 0) {
        logger.info(`Fetched ${news.length} crypto news items`);
        return news.slice(0, 8); // Cap at 8 headlines
      }
    } catch (err) {
      logger.warn("News source failed, trying next", { error: String(err) });
    }
  }

  logger.warn("All news sources failed — story will proceed without news context");
  return [];
}

// ─── CryptoPanic free API (no key needed for public feed) ───

async function fetchCryptoPanicHeadlines(): Promise<CryptoNewsItem[]> {
  const response = await fetch(
    "https://cryptopanic.com/api/free/v1/posts/?auth_token=free&public=true&kind=news&filter=hot&currencies=BTC,ETH,SOL",
    { signal: AbortSignal.timeout(10000) }
  );

  if (!response.ok) {
    throw new Error(`CryptoPanic API returned ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title?: string; source?: { title?: string } }>;
  };

  return (data.results || [])
    .filter((item) => item.title)
    .map((item) => ({
      title: item.title!.slice(0, 150),
      source: item.source?.title || "CryptoPanic",
    }));
}

// ─── CoinGecko trending (free, no key) ───

async function fetchCoinGeckoTrending(): Promise<CryptoNewsItem[]> {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/search/trending",
    { signal: AbortSignal.timeout(10000) }
  );

  if (!response.ok) {
    throw new Error(`CoinGecko API returned ${response.status}`);
  }

  const data = (await response.json()) as {
    coins?: Array<{ item?: { name?: string; symbol?: string; data?: { price_change_percentage_24h?: Record<string, number> } } }>;
  };

  return (data.coins || [])
    .slice(0, 8)
    .map((coin) => {
      const name = coin.item?.name || "Unknown";
      const symbol = coin.item?.symbol || "???";
      const change = coin.item?.data?.price_change_percentage_24h?.usd;
      const direction = change != null ? (change >= 0 ? `up ${change.toFixed(1)}%` : `down ${Math.abs(change).toFixed(1)}%`) : "trending";
      return {
        title: `${name} (${symbol}) is ${direction} — trending on CoinGecko`,
        source: "CoinGecko",
      };
    });
}

// ─── Format news for the AI prompt ───

export function formatNewsForPrompt(news: CryptoNewsItem[]): string {
  if (news.length === 0) return "";

  const lines = news.map((item, i) => `${i + 1}. ${item.title}`).join("\n");

  return `\n═══ TODAY'S REAL CRYPTO NEWS (weave into the story) ═══\n${lines}\n\nINSTRUCTIONS: Pick 1-2 of these real events and creatively mirror them in Chainrealm. Examples of how to translate:\n- "Bitcoin drops 8%" → The Bear King's frost advances, markets in Chainrealm freeze\n- "ETF approved" → The Bull Tribe receives a powerful ancient weapon/blessing\n- "Major hack/exploit" → Rug Pull strikes, stealing from a faction\n- "New memecoin trending" → A new character or creature appears in the world\n- "Regulation news" → The Diamond Hands Monks issue a new decree\nDon't force it — only weave in what fits naturally with the current story arc.\n`;
}
