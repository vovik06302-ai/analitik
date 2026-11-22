import { ExchangeTicker, MarketSnapshot, OhlcCandle, SafeTradeStatus } from '../src/types';
import {
  fetchSafeTradeCandlesInRange,
  fetchSafeTradeData,
  fetchSafeTradePriceNearTime,
} from './safetradeService';
import {
  fetchCrossExchangeTickers,
  fetchGateCandlesInRange,
  fetchGatePearlData,
  fetchGatePriceNearTime,
  fetchMacroContext,
} from './exchangeService';
import { buildOrderBookSummary, computeTechnicalIndicators } from './technicalAnalysis';

let cachedSnapshot: MarketSnapshot | null = null;
let cachedAtMs = 0;
const CACHE_TTL_MS = 45_000;

export async function fetchPearlMarketSnapshot(force = false): Promise<MarketSnapshot> {
  const now = Date.now();
  if (!force && cachedSnapshot && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  const [safeTradeRes, gateRes, crossRes, macroRes, coinRes, ohlcRes, dexRes] =
    await Promise.allSettled([
      fetchSafeTradeData(),
      fetchGatePearlData(),
      fetchCrossExchangeTickers(),
      fetchMacroContext(),
      fetch(
        'https://api.coingecko.com/api/v3/coins/pearl-2?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false',
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(7000),
        }
      ).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`CoinGecko HTTP ${r.status}`)))),
      fetch('https://api.coingecko.com/api/v3/coins/pearl-2/ohlc?vs_currency=usd&days=1', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`OHLC HTTP ${r.status}`)))),
      fetch(
        'https://api.dexscreener.com/latest/dex/pairs/ethereum/0x89a67c6DEE35DB9815dA2fb9191F0998A8B37C39',
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        }
      ).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`DexScreener HTTP ${r.status}`)))),
    ]);

  const st = safeTradeRes.status === 'fulfilled' ? safeTradeRes.value : null;
  const safeTradeDirect = Boolean(st && st.status === 'direct' && st.lastPrice);
  const safeTradeStatus: SafeTradeStatus = st?.status ?? 'unavailable';

  const gate = gateRes.status === 'fulfilled' ? gateRes.value : null;
  const cross =
    crossRes.status === 'fulfilled'
      ? crossRes.value
      : { tickers: [], nearDexLiquidityUsd: null };
  const macroContext = macroRes.status === 'fulfilled' ? macroRes.value : undefined;

  const coinData =
    coinRes.status === 'fulfilled' ? (coinRes.value as Record<string, any>) : null;
  const ohlcRaw = ohlcRes.status === 'fulfilled' ? ohlcRes.value : null;
  const dexData =
    dexRes.status === 'fulfilled' ? (dexRes.value as Record<string, any>) : null;

  const rawTickers: Array<Record<string, any>> = Array.isArray(coinData?.tickers)
    ? coinData.tickers
    : [];

  let cgTickers: ExchangeTicker[] = rawTickers
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
    }));

  // Merge live direct tickers (SafeTrade, Gate.io, Coinbase, Kraken) with CoinGecko tickers
  const tickerByKey = new Map<string, ExchangeTicker>();
  for (const tk of cgTickers) {
    tickerByKey.set(tk.exchange.toLowerCase(), tk);
  }
  for (const tk of cross.tickers) {
    tickerByKey.set(tk.exchange.toLowerCase(), tk);
  }
  if (gate?.lastPrice) {
    tickerByKey.set('gate', {
      exchange: 'Gate.io',
      pair: 'PEARL/USDT',
      lastPrice: gate.lastPrice,
      volumeUsd24h: gate.volumeQuote24h ?? 0,
      spreadPercent: gate.spreadPercent ?? 0,
    });
  }
  if (safeTradeDirect && st?.lastPrice) {
    tickerByKey.set('safetrade', {
      exchange: 'SafeTrade',
      pair: 'PEARL/USDT',
      lastPrice: st.lastPrice,
      volumeUsd24h: st.volumeQuote24h ?? 0,
      spreadPercent: st.spreadPercent ?? 0,
    });
  }

  let tickers = Array.from(tickerByKey.values())
    .sort((a, b) => b.volumeUsd24h - a.volumeUsd24h)
    .slice(0, 8);

  if (tickers.length === 0 && cachedSnapshot?.tickers.length) {
    tickers = cachedSnapshot.tickers;
  }

  const md = coinData?.market_data;
  const dexPair = dexData?.pair ?? (Array.isArray(dexData?.pairs) ? dexData.pairs[0] : null);

  // Priority: SafeTrade direct -> Gate.io direct -> CoinGecko -> DexScreener -> cached
  const priceUsd =
    (safeTradeDirect ? st?.lastPrice : null) ??
    gate?.lastPrice ??
    (md?.current_price?.usd !== undefined ? Number(md.current_price.usd) : null) ??
    (dexPair?.priceUsd !== undefined ? Number(dexPair.priceUsd) : null) ??
    cachedSnapshot?.priceUsd ??
    0;

  if (!priceUsd || !Number.isFinite(priceUsd)) {
    if (cachedSnapshot) return cachedSnapshot;
    throw new Error('Не удалось получить реальные рыночные данные PEARL/USDT.');
  }

  const priceChange24hPercent =
    (safeTradeDirect && st?.changePercent !== null ? st?.changePercent : null) ??
    gate?.changePercent ??
    (md?.price_change_percentage_24h !== undefined
      ? Number(md.price_change_percentage_24h)
      : null) ??
    (dexPair?.priceChange?.h24 !== undefined ? Number(dexPair.priceChange.h24) : null) ??
    cachedSnapshot?.priceChange24hPercent ??
    null;

  const high24h =
    (safeTradeDirect && st?.high24h !== null ? st?.high24h : null) ??
    gate?.high24h ??
    (md?.high_24h?.usd !== undefined ? Number(md.high_24h.usd) : null) ??
    cachedSnapshot?.high24h ??
    null;

  const low24h =
    (safeTradeDirect && st?.low24h !== null ? st?.low24h : null) ??
    gate?.low24h ??
    (md?.low_24h?.usd !== undefined ? Number(md.low_24h.usd) : null) ??
    cachedSnapshot?.low24h ??
    null;

  const volume24hUsd =
    (safeTradeDirect ? st?.volumeQuote24h : null) ??
    gate?.volumeQuote24h ??
    (md?.total_volume?.usd !== undefined ? Number(md.total_volume.usd) : null) ??
    (dexPair?.volume?.h24 !== undefined ? Number(dexPair.volume.h24) : null) ??
    cachedSnapshot?.volume24hUsd ??
    null;

  const spreadPercent =
    (safeTradeDirect ? st?.spreadPercent : null) ??
    gate?.spreadPercent ??
    cachedSnapshot?.spreadPercent ??
    null;

  const marketCapUsd =
    md?.market_cap?.usd !== undefined
      ? Number(md.market_cap.usd)
      : cachedSnapshot?.marketCapUsd ?? null;

  const ethDexLiq = dexPair?.liquidity?.usd !== undefined ? Number(dexPair.liquidity.usd) : null;
  const dexLiquidityUsd =
    cross.nearDexLiquidityUsd && ethDexLiq
      ? cross.nearDexLiquidityUsd + ethDexLiq
      : cross.nearDexLiquidityUsd ?? ethDexLiq ?? cachedSnapshot?.dexLiquidityUsd ?? null;

  const parsedCgOhlc: OhlcCandle[] = Array.isArray(ohlcRaw)
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

  // Honest candle source cascade: SafeTrade 15m -> Gate.io 15m -> CoinGecko 30m -> cache
  let ohlc: OhlcCandle[] = [];
  let ohlcPeriodMinutes = 15;
  let candlesSource = 'CoinGecko';

  if (safeTradeDirect && st && st.candles15m.length > 0) {
    ohlc = st.candles15m;
    ohlcPeriodMinutes = 15;
    candlesSource = 'SafeTrade';
  } else if (gate && gate.candles15m.length > 0) {
    ohlc = gate.candles15m;
    ohlcPeriodMinutes = 15;
    candlesSource = 'Gate.io';
  } else if (parsedCgOhlc.length > 0) {
    ohlc = parsedCgOhlc;
    ohlcPeriodMinutes = 30;
    candlesSource = 'CoinGecko';
  } else if (cachedSnapshot?.ohlc.length) {
    ohlc = cachedSnapshot.ohlc;
    ohlcPeriodMinutes = cachedSnapshot.ohlcPeriodMinutes ?? 30;
    candlesSource = cachedSnapshot.candlesSource ?? 'Cache';
  }

  const hourlyOhlc =
    safeTradeDirect && st && st.candles1h.length > 0
      ? st.candles1h
      : gate && gate.candles1h.length > 0
      ? gate.candles1h
      : cachedSnapshot?.hourlyOhlc;

  const candles4h = gate && gate.candles4h.length > 0 ? gate.candles4h : cachedSnapshot?.candles4h;
  const candles1d = gate && gate.candles1d.length > 0 ? gate.candles1d : cachedSnapshot?.candles1d;

  // Order book cascade: SafeTrade direct -> Gate.io direct
  const orderBook =
    safeTradeDirect && st && (st.bids.length > 0 || st.asks.length > 0)
      ? buildOrderBookSummary(st.bids, st.asks, priceUsd)
      : gate && (gate.bids.length > 0 || gate.asks.length > 0)
      ? buildOrderBookSummary(gate.bids, gate.asks, priceUsd)
      : undefined;

  const tradeFlow = gate?.tradeFlow;

  const technicalIndicators = computeTechnicalIndicators({
    candles15m: ohlc,
    candles1h: hourlyOhlc,
    candles4h,
    candles1d,
  });

  const primaryExchange = safeTradeDirect
    ? 'SafeTrade'
    : gate?.lastPrice
    ? 'Gate.io'
    : coinData
    ? 'CoinGecko'
    : 'DexScreener';

  const anomalies: string[] = [];
  if (priceChange24hPercent !== null && Math.abs(priceChange24hPercent) >= 8) {
    anomalies.push(
      `Резкое движение 24ч: ${priceChange24hPercent > 0 ? '+' : ''}${priceChange24hPercent.toFixed(
        2
      )}%`
    );
  }
  if (spreadPercent !== null && spreadPercent >= 1.2) {
    anomalies.push(`Повышенный спред (${primaryExchange}): ${spreadPercent.toFixed(2)}%`);
  }
  if (technicalIndicators?.volumeRatio !== null && (technicalIndicators?.volumeRatio ?? 0) >= 2.2) {
    anomalies.push(`Всплеск объёма: ×${technicalIndicators!.volumeRatio!.toFixed(1)} к среднему`);
  }
  if (technicalIndicators?.bollinger.squeeze) {
    anomalies.push('Сжатие Боллинджера (возможен импульсный выход)');
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
    primaryExchange,
    candlesSource,
    safeTradeStatus,
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
    ohlcPeriodMinutes,
    hourlyOhlc,
    candles4h,
    candles1d,
    orderBook,
    tradeFlow,
    technicalIndicators,
    macroContext,
    anomalies,
    fetchedAtUtc: new Date().toISOString(),
  };

  cachedSnapshot = snapshot;
  cachedAtMs = now;
  return snapshot;
}

export async function fetchPearlCandlesInRange(
  fromUtcMs: number,
  toUtcMs: number
): Promise<OhlcCandle[]> {
  const fromSafeTrade = await fetchSafeTradeCandlesInRange(fromUtcMs, toUtcMs, 5);
  if (fromSafeTrade.length > 0) return fromSafeTrade;

  const fromGate = await fetchGateCandlesInRange(fromUtcMs, toUtcMs, '5m');
  if (fromGate.length > 0) return fromGate;

  return [];
}

export async function fetchPearlPriceNearTime(targetUtcMs: number): Promise<number | null> {
  const fromSafeTrade = await fetchSafeTradePriceNearTime(targetUtcMs);
  if (fromSafeTrade !== null) return fromSafeTrade;

  const fromGate = await fetchGatePriceNearTime(targetUtcMs);
  if (fromGate !== null) return fromGate;

  try {
    const fromSec = Math.floor((targetUtcMs - 40 * 60 * 1000) / 1000);
    const toSec = Math.floor((targetUtcMs + 40 * 60 * 1000) / 1000);
    const url = `https://api.coingecko.com/api/v3/coins/pearl-2/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
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
