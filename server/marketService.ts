import { ExchangeTicker, MarketSnapshot, OhlcCandle } from '../src/types';
import { fetchSafeTradeData, fetchSafeTradePriceNearTime } from './safetradeService';

let cachedSnapshot: MarketSnapshot | null = null;
let cachedAtMs = 0;
const CACHE_TTL_MS = 45_000;

export async function fetchPearlMarketSnapshot(force = false): Promise<MarketSnapshot> {
  const now = Date.now();
  if (!force && cachedSnapshot && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  const [coinRes, ohlcRes, dexRes, safeTradeRes] = await Promise.allSettled([
    fetch(
      'https://api.coingecko.com/api/v3/coins/pearl-2?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false',
      { headers: { Accept: 'application/json' } }
    ).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`CoinGecko HTTP ${r.status}`)))),
    fetch('https://api.coingecko.com/api/v3/coins/pearl-2/ohlc?vs_currency=usd&days=1', {
      headers: { Accept: 'application/json' },
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`OHLC HTTP ${r.status}`)))),
    fetch(
      'https://api.dexscreener.com/latest/dex/pairs/ethereum/0x89a67c6DEE35DB9815dA2fb9191F0998A8B37C39',
      { headers: { Accept: 'application/json' } }
    ).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`DexScreener HTTP ${r.status}`)))),
    fetchSafeTradeData(),
  ]);

  // Данные напрямую с биржи SafeTrade — главный источник, остальные служат запасными.
  const st = safeTradeRes.status === 'fulfilled' ? safeTradeRes.value : null;

  const coinData =
    coinRes.status === 'fulfilled' ? (coinRes.value as Record<string, any>) : null;
  const ohlcRaw = ohlcRes.status === 'fulfilled' ? ohlcRes.value : null;
  const dexData =
    dexRes.status === 'fulfilled' ? (dexRes.value as Record<string, any>) : null;

  const rawTickers: Array<Record<string, any>> = Array.isArray(coinData?.tickers)
    ? coinData.tickers
    : [];

  let tickers: ExchangeTicker[] = rawTickers
    .filter((t) => {
      const target = String(t.target ?? '').toUpperCase();
      return (target === 'USDT' || target === 'USD' || target === 'USDC') && Number(t.last) > 0;
    })
    .map((t) => ({
      exchange: String(t.market?.name ?? 'Unknown'),
      pair: `${String(t.base ?? 'PEARL').slice(0, 10)}/${String(t.target ?? 'USDT')}`,
      lastPrice: Number(t.last) || 0,
      volumeUsd24h: Number(t.converted_volume?.usd ?? 0) || 0,
      spreadPercent: Number(t.bid_ask_spread_percentage ?? 0) || 0,
    }))
    .sort((a, b) => b.volumeUsd24h - a.volumeUsd24h)
    .slice(0, 8);

  if (tickers.length === 0 && cachedSnapshot?.tickers.length) {
    tickers = cachedSnapshot.tickers;
  }

  const safeTradeTicker =
    tickers.find(
      (t) =>
        t.exchange.toLowerCase().includes('safetrade') && t.pair.endsWith('/USDT')
    ) ?? tickers[0];

  const md = coinData?.market_data;
  const dexPair = dexData?.pair;

  const freshCoinPrice =
    coinData && safeTradeTicker?.lastPrice
      ? safeTradeTicker.lastPrice
      : md?.current_price?.usd !== undefined
      ? Number(md.current_price.usd)
      : null;

  const priceUsd =
    st?.lastPrice ??
    freshCoinPrice ??
    (dexPair?.priceUsd !== undefined ? Number(dexPair.priceUsd) : null) ??
    cachedSnapshot?.priceUsd ??
    0;

  if (!priceUsd || !Number.isFinite(priceUsd)) {
    if (cachedSnapshot) return cachedSnapshot;
    throw new Error('Не удалось получить реальные рыночные данные PEARL/USDT.');
  }

  const priceChange24hPercent =
    st && st.changePercent !== null
      ? st.changePercent
      : md?.price_change_percentage_24h !== undefined
      ? Number(md.price_change_percentage_24h)
      : dexPair?.priceChange?.h24 !== undefined
      ? Number(dexPair.priceChange.h24)
      : cachedSnapshot?.priceChange24hPercent ?? null;

  const high24h =
    st && st.high24h !== null
      ? st.high24h
      : md?.high_24h?.usd !== undefined
      ? Number(md.high_24h.usd)
      : cachedSnapshot?.high24h ?? null;
  const low24h =
    st && st.low24h !== null
      ? st.low24h
      : md?.low_24h?.usd !== undefined
      ? Number(md.low_24h.usd)
      : cachedSnapshot?.low24h ?? null;

  const volume24hUsd =
    st?.volumeQuote24h ??
    (coinData ? safeTradeTicker?.volumeUsd24h : undefined) ??
    (md?.total_volume?.usd !== undefined ? Number(md.total_volume.usd) : undefined) ??
    cachedSnapshot?.volume24hUsd ??
    (dexPair?.volume?.h24 !== undefined ? Number(dexPair.volume.h24) : null);

  const spreadPercent =
    st?.spreadPercent ??
    (coinData ? safeTradeTicker?.spreadPercent : undefined) ??
    cachedSnapshot?.spreadPercent ??
    null;

  const marketCapUsd =
    md?.market_cap?.usd !== undefined
      ? Number(md.market_cap.usd)
      : cachedSnapshot?.marketCapUsd ?? null;

  const dexLiquidityUsd =
    dexPair?.liquidity?.usd !== undefined
      ? Number(dexPair.liquidity.usd)
      : cachedSnapshot?.dexLiquidityUsd ?? null;

  const parsedOhlc: OhlcCandle[] = Array.isArray(ohlcRaw)
    ? ohlcRaw
        .filter((c) => Array.isArray(c) && c.length >= 5)
        .map((c) => ({
          timestamp: Number(c[0]),
          open: Number(c[1]),
          high: Number(c[2]),
          low: Number(c[3]),
          close: Number(c[4]),
        }))
    : [];

  const ohlc =
    st && st.candles15m.length > 0
      ? st.candles15m
      : parsedOhlc.length > 0
      ? parsedOhlc
      : cachedSnapshot?.ohlc ?? [];
  const usingSafeTradeCandles = Boolean(st && st.candles15m.length > 0);

  if (st?.lastPrice) {
    const safeTradeTickerEntry: ExchangeTicker = {
      exchange: 'SafeTrade',
      pair: 'PEARL/USDT',
      lastPrice: st.lastPrice,
      volumeUsd24h: st.volumeQuote24h ?? 0,
      spreadPercent: st.spreadPercent ?? 0,
    };
    tickers = [
      safeTradeTickerEntry,
      ...tickers.filter((t) => !t.exchange.toLowerCase().includes('safetrade')),
    ];
  }

  const anomalies: string[] = [];
  if (priceChange24hPercent !== null && Math.abs(priceChange24hPercent) >= 8) {
    anomalies.push(
      `Резкое движение 24ч: ${priceChange24hPercent > 0 ? '+' : ''}${priceChange24hPercent.toFixed(
        2
      )}%`
    );
  }
  if (spreadPercent !== null && spreadPercent >= 1.2) {
    anomalies.push(`Повышенный спред SafeTrade: ${spreadPercent.toFixed(2)}%`);
  }
  if (tickers.length >= 2) {
    const prices = tickers.map((t) => t.lastPrice).filter((p) => p > 0);
    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    if (minP > 0 && ((maxP - minP) / minP) * 100 >= 1.5) {
      anomalies.push(
        `Межбиржевое расхождение цены: ${(((maxP - minP) / minP) * 100).toFixed(2)}%`
      );
    }
  }

  const snapshot: MarketSnapshot = {
    symbol: 'PEARL / USDT',
    primaryExchange: st?.lastPrice
      ? 'SafeTrade'
      : (coinData ? safeTradeTicker?.exchange : cachedSnapshot?.primaryExchange) ??
        'DexScreener',
    priceUsd,
    priceChange24hPercent,
    high24h,
    low24h,
    volume24hUsd,
    spreadPercent,
    marketCapUsd,
    dexLiquidityUsd,
    tickers,
    ohlc,
    ohlcPeriodMinutes: usingSafeTradeCandles ? 15 : 30,
    hourlyOhlc: st && st.candles1h.length > 0 ? st.candles1h : undefined,
    orderBook:
      st && st.bidVolume !== null && st.askVolume !== null
        ? {
            bestBid: st.bestBid,
            bestAsk: st.bestAsk,
            bidVolume: st.bidVolume,
            askVolume: st.askVolume,
          }
        : undefined,
    anomalies,
    fetchedAtUtc: new Date().toISOString(),
  };

  cachedSnapshot = snapshot;
  cachedAtMs = now;
  return snapshot;
}

export async function fetchPearlPriceNearTime(targetUtcMs: number): Promise<number | null> {
  const fromExchange = await fetchSafeTradePriceNearTime(targetUtcMs);
  if (fromExchange !== null) return fromExchange;
  try {
    const fromSec = Math.floor((targetUtcMs - 40 * 60 * 1000) / 1000);
    const toSec = Math.floor((targetUtcMs + 40 * 60 * 1000) / 1000);
    const url = `https://api.coingecko.com/api/v3/coins/pearl-2/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;

    const data = (await res.json()) as { prices?: Array<[number, number]> };
    const prices = data.prices ?? [];
    if (prices.length === 0) return null;

    let bestPrice: number | null = null;
    let bestDiff = Number.MAX_SAFE_INTEGER;
    for (const [ts, price] of prices) {
      const diff = Math.abs(ts - targetUtcMs);
      if (diff < bestDiff && Number.isFinite(price) && price > 0) {
        bestDiff = diff;
        bestPrice = price;
      }
    }
    return bestPrice;
  } catch {
    return null;
  }
}
