import {
  ExchangeTicker,
  MacroAssetSnapshot,
  MacroContext,
  OhlcCandle,
  TradeFlowSummary,
} from '../src/types';
import { DepthLevel, computeLatestEma } from './technicalAnalysis';

const GATE_BASE = 'https://api.gateio.ws/api/v4/spot';
const TIMEOUT_MS = 7000;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'PearlAiAnalyst/1.0.29',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

// Gate.io candlestick format:
// [timestamp_sec, quote_volume, close, high, low, open, base_volume, is_closed]
function parseGateCandles(raw: unknown): OhlcCandle[] {
  if (!Array.isArray(raw)) return [];
  const out: OhlcCandle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const ts = toNum(row[0]);
    const quoteVol = toNum(row[1]);
    const close = toNum(row[2]);
    const high = toNum(row[3]);
    const low = toNum(row[4]);
    const open = toNum(row[5]);
    const baseVol = row.length >= 7 ? toNum(row[6]) : null;
    if (ts === null || open === null || high === null || low === null || close === null) continue;
    out.push({
      timestamp: ts < 1e12 ? ts * 1000 : ts,
      open,
      high,
      low,
      close,
      volume: baseVol ?? (quoteVol && close > 0 ? quoteVol / close : undefined),
    });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export interface GateExchangeData {
  lastPrice: number | null;
  changePercent: number | null;
  high24h: number | null;
  low24h: number | null;
  volumeQuote24h: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spreadPercent: number | null;
  bids: DepthLevel[];
  asks: DepthLevel[];
  candles15m: OhlcCandle[];
  candles1h: OhlcCandle[];
  candles4h: OhlcCandle[];
  candles1d: OhlcCandle[];
  tradeFlow?: TradeFlowSummary;
}

function parseGateTrades(raw: unknown): TradeFlowSummary | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  let buyVolume = 0;
  let sellVolume = 0;
  let minTs = Infinity;
  let maxTs = -Infinity;
  let count = 0;

  for (const item of raw as Array<Record<string, unknown>>) {
    const amount = toNum(item.amount);
    const price = toNum(item.price);
    const side = String(item.side ?? '').toLowerCase();
    const tsMs = toNum(item.create_time_ms) ?? ((toNum(item.create_time) ?? 0) * 1000);
    if (!amount || !price) continue;
    const usdVal = amount * price;
    if (side === 'buy') buyVolume += usdVal;
    else if (side === 'sell') sellVolume += usdVal;
    if (tsMs > 0) {
      if (tsMs < minTs) minTs = tsMs;
      if (tsMs > maxTs) maxTs = tsMs;
    }
    count++;
  }

  const total = buyVolume + sellVolume;
  if (count === 0 || total <= 0) return undefined;

  const windowMinutes =
    Number.isFinite(minTs) && Number.isFinite(maxTs) && maxTs > minTs
      ? Math.max(1, Math.round((maxTs - minTs) / 60_000))
      : 1;

  return {
    totalTrades: count,
    buyVolume: Math.round(buyVolume),
    sellVolume: Math.round(sellVolume),
    cvd: Math.round(buyVolume - sellVolume),
    buySharePercent: Number(((buyVolume / total) * 100).toFixed(1)),
    windowMinutes,
  };
}

export async function fetchGatePearlData(): Promise<GateExchangeData | null> {
  const [tickerRes, c15Res, c1hRes, c4hRes, c1dRes, depthRes, tradesRes] =
    await Promise.allSettled([
      fetchJson(`${GATE_BASE}/tickers?currency_pair=PEARL_USDT`),
      fetchJson(`${GATE_BASE}/candlesticks?currency_pair=PEARL_USDT&interval=15m&limit=96`),
      fetchJson(`${GATE_BASE}/candlesticks?currency_pair=PEARL_USDT&interval=1h&limit=72`),
      fetchJson(`${GATE_BASE}/candlesticks?currency_pair=PEARL_USDT&interval=4h&limit=48`),
      fetchJson(`${GATE_BASE}/candlesticks?currency_pair=PEARL_USDT&interval=1d&limit=30`),
      fetchJson(`${GATE_BASE}/order_book?currency_pair=PEARL_USDT&limit=50`),
      fetchJson(`${GATE_BASE}/trades?currency_pair=PEARL_USDT&limit=100`),
    ]);

  const tickerArr =
    tickerRes.status === 'fulfilled' && Array.isArray(tickerRes.value)
      ? (tickerRes.value as Array<Record<string, unknown>>)
      : [];
  const t = tickerArr[0] ?? {};

  const candles15m = c15Res.status === 'fulfilled' ? parseGateCandles(c15Res.value) : [];
  const candles1h = c1hRes.status === 'fulfilled' ? parseGateCandles(c1hRes.value) : [];
  const candles4h = c4hRes.status === 'fulfilled' ? parseGateCandles(c4hRes.value) : [];
  const candles1d = c1dRes.status === 'fulfilled' ? parseGateCandles(c1dRes.value) : [];

  const lastPrice = toNum(t.last) ?? candles15m[candles15m.length - 1]?.close ?? null;
  if (!lastPrice && candles15m.length === 0) return null;

  const parseLevels = (rawLevels: unknown): DepthLevel[] =>
    Array.isArray(rawLevels)
      ? rawLevels
          .map((lvl) => ({
            price: Array.isArray(lvl) ? toNum(lvl[0]) : null,
            amount: Array.isArray(lvl) ? toNum(lvl[1]) : null,
          }))
          .filter(
            (l): l is DepthLevel =>
              l.price !== null && l.amount !== null && l.price > 0 && l.amount > 0
          )
      : [];

  const depthObj =
    depthRes.status === 'fulfilled' ? (depthRes.value as Record<string, unknown>) : {};
  const bids = parseLevels(depthObj.bids);
  const asks = parseLevels(depthObj.asks);

  const bestBid = bids[0]?.price ?? toNum(t.highest_bid);
  const bestAsk = asks[0]?.price ?? toNum(t.lowest_ask);
  const spreadPercent =
    bestBid && bestAsk && bestAsk >= bestBid
      ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100
      : null;

  const tradeFlow =
    tradesRes.status === 'fulfilled' ? parseGateTrades(tradesRes.value) : undefined;

  return {
    lastPrice,
    changePercent: toNum(t.change_percentage),
    high24h: toNum(t.high_24h),
    low24h: toNum(t.low_24h),
    volumeQuote24h: toNum(t.quote_volume),
    bestBid,
    bestAsk,
    spreadPercent,
    bids,
    asks,
    candles15m,
    candles1h,
    candles4h,
    candles1d,
    tradeFlow,
  };
}

export async function fetchCrossExchangeTickers(): Promise<{
  tickers: ExchangeTicker[];
  nearDexLiquidityUsd: number | null;
}> {
  const [coinbaseRes, krakenRes, geckoTermRes] = await Promise.allSettled([
    fetchJson('https://api.exchange.coinbase.com/products/PEARL-USD/ticker', 5500),
    fetchJson('https://api.kraken.com/0/public/Ticker?pair=PEARLUSD', 5500),
    fetchJson('https://api.geckoterminal.com/api/v2/networks/near/tokens/prl.omft.near', 5500),
  ]);

  const tickers: ExchangeTicker[] = [];

  if (coinbaseRes.status === 'fulfilled' && coinbaseRes.value) {
    const cb = coinbaseRes.value as Record<string, unknown>;
    const price = toNum(cb.price);
    const bid = toNum(cb.bid);
    const ask = toNum(cb.ask);
    const volBase = toNum(cb.volume);
    if (price && price > 0) {
      const spread =
        bid && ask && ask >= bid ? ((ask - bid) / ((ask + bid) / 2)) * 100 : 0;
      tickers.push({
        exchange: 'Coinbase',
        pair: 'PEARL/USD',
        lastPrice: price,
        volumeUsd24h: volBase ? volBase * price : 0,
        spreadPercent: Number(spread.toFixed(3)),
      });
    }
  }

  if (krakenRes.status === 'fulfilled' && krakenRes.value) {
    const kr = krakenRes.value as { result?: Record<string, Record<string, unknown>> };
    const pairObj = kr.result ? Object.values(kr.result)[0] : undefined;
    if (pairObj) {
      const cArr = Array.isArray(pairObj.c) ? pairObj.c : [];
      const aArr = Array.isArray(pairObj.a) ? pairObj.a : [];
      const bArr = Array.isArray(pairObj.b) ? pairObj.b : [];
      const vArr = Array.isArray(pairObj.v) ? pairObj.v : [];
      const price = toNum(cArr[0]);
      const ask = toNum(aArr[0]);
      const bid = toNum(bArr[0]);
      const vol24h = toNum(vArr[1]);
      if (price && price > 0) {
        const spread =
          bid && ask && ask >= bid ? ((ask - bid) / ((ask + bid) / 2)) * 100 : 0;
        tickers.push({
          exchange: 'Kraken',
          pair: 'PEARL/USD',
          lastPrice: price,
          volumeUsd24h: vol24h ? vol24h * price : 0,
          spreadPercent: Number(spread.toFixed(3)),
        });
      }
    }
  }

  let nearDexLiquidityUsd: number | null = null;
  if (geckoTermRes.status === 'fulfilled' && geckoTermRes.value) {
    const gt = geckoTermRes.value as {
      data?: { attributes?: { total_reserve_in_usd?: string } };
    };
    const reserve = toNum(gt.data?.attributes?.total_reserve_in_usd);
    if (reserve && reserve > 0) nearDexLiquidityUsd = reserve;
  }

  return { tickers, nearDexLiquidityUsd };
}

async function fetchMacroAsset(pair: string, symbol: string): Promise<MacroAssetSnapshot | null> {
  try {
    const [tickerRes, candlesRes] = await Promise.all([
      fetchJson(`${GATE_BASE}/tickers?currency_pair=${pair}`, 5500),
      fetchJson(`${GATE_BASE}/candlesticks?currency_pair=${pair}&interval=1h&limit=30`, 5500),
    ]);
    const t = Array.isArray(tickerRes) ? (tickerRes[0] as Record<string, unknown>) : null;
    const candles = parseGateCandles(candlesRes);
    const priceUsd = toNum(t?.last) ?? candles[candles.length - 1]?.close ?? null;
    if (!priceUsd || priceUsd <= 0) return null;

    const change24hPercent = toNum(t?.change_percentage);
    const c1hPrev = candles.length >= 2 ? candles[candles.length - 2].close : null;
    const c4hPrev = candles.length >= 5 ? candles[candles.length - 5].close : null;
    const change1hPercent =
      c1hPrev && c1hPrev > 0 ? Number((((priceUsd - c1hPrev) / c1hPrev) * 100).toFixed(2)) : null;
    const change4hPercent =
      c4hPrev && c4hPrev > 0 ? Number((((priceUsd - c4hPrev) / c4hPrev) * 100).toFixed(2)) : null;

    const closes = candles.map((c) => c.close);
    const ema9 = computeLatestEma(closes, 9);
    const ema21 = computeLatestEma(closes, 21);
    let trend1h: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (ema9 && ema21) {
      const diffPct = ((ema9 - ema21) / ema21) * 100;
      if (diffPct > 0.15) trend1h = 'bullish';
      else if (diffPct < -0.15) trend1h = 'bearish';
    }

    return {
      symbol,
      priceUsd,
      change1hPercent,
      change4hPercent,
      change24hPercent,
      trend1h,
    };
  } catch {
    return null;
  }
}

export async function fetchMacroContext(): Promise<MacroContext> {
  const [btc, eth] = await Promise.all([
    fetchMacroAsset('BTC_USDT', 'BTC'),
    fetchMacroAsset('ETH_USDT', 'ETH'),
  ]);
  return { btc, eth };
}

export async function fetchGateCandlesInRange(
  fromUtcMs: number,
  toUtcMs: number,
  interval: '5m' | '15m' = '5m'
): Promise<OhlcCandle[]> {
  try {
    const fromSec = Math.floor(fromUtcMs / 1000);
    const toSec = Math.floor(toUtcMs / 1000);
    const raw = await fetchJson(
      `${GATE_BASE}/candlesticks?currency_pair=PEARL_USDT&interval=${interval}&from=${fromSec}&to=${toSec}`,
      6000
    );
    return parseGateCandles(raw);
  } catch {
    return [];
  }
}

export async function fetchGatePriceNearTime(targetUtcMs: number): Promise<number | null> {
  const candles = await fetchGateCandlesInRange(
    targetUtcMs - 30 * 60 * 1000,
    targetUtcMs + 30 * 60 * 1000,
    '5m'
  );
  if (candles.length === 0) return null;
  let best: OhlcCandle | null = null;
  let bestDiff = Number.MAX_SAFE_INTEGER;
  for (const c of candles) {
    const diff = Math.abs(c.timestamp - targetUtcMs);
    if (diff < bestDiff && c.close > 0) {
      bestDiff = diff;
      best = c;
    }
  }
  return best ? best.close : null;
}
