import { OhlcCandle } from '../src/types';

// Публичный API биржи SafeTrade (Peatio v2). Ключи не нужны.
const BASE_URL = 'https://safe.trade/api/v2/peatio/public/markets/pearlusdt';
const REQUEST_TIMEOUT_MS = 8000;

export interface SafeTradeData {
  lastPrice: number | null;
  changePercent: number | null;
  high24h: number | null;
  low24h: number | null;
  volumeQuote24h: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spreadPercent: number | null;
  bidVolume: number | null;
  askVolume: number | null;
  candles15m: OhlcCandle[];
  candles1h: OhlcCandle[];
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace('%', '').replace('+', ''));
  return Number.isFinite(n) ? n : null;
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`SafeTrade HTTP ${response.status}`);
  }
  return response.json();
}

function parseCandles(raw: unknown): OhlcCandle[] {
  if (!Array.isArray(raw)) return [];
  const candles: OhlcCandle[] = [];
  for (const item of raw) {
    // Формат Peatio: [время_в_секундах, open, high, low, close, volume]
    if (Array.isArray(item) && item.length >= 5) {
      const ts = num(item[0]);
      const open = num(item[1]);
      const high = num(item[2]);
      const low = num(item[3]);
      const close = num(item[4]);
      const volume = item.length >= 6 ? num(item[5]) : null;
      if (ts === null || open === null || high === null || low === null || close === null) continue;
      candles.push({
        timestamp: ts < 1e12 ? ts * 1000 : ts,
        open,
        high,
        low,
        close,
        ...(volume !== null ? { volume } : {}),
      });
    }
  }
  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

function parseDepth(raw: unknown): {
  bestBid: number | null;
  bestAsk: number | null;
  bidVolume: number | null;
  askVolume: number | null;
} {
  const data = (raw ?? {}) as { bids?: unknown; asks?: unknown };
  const toLevels = (side: unknown): Array<{ price: number; amount: number }> =>
    Array.isArray(side)
      ? side
          .map((lvl) => ({
            price: Array.isArray(lvl) ? num(lvl[0]) : null,
            amount: Array.isArray(lvl) ? num(lvl[1]) : null,
          }))
          .filter((l): l is { price: number; amount: number } => l.price !== null && l.amount !== null)
      : [];

  const bids = toLevels(data.bids).sort((a, b) => b.price - a.price).slice(0, 20);
  const asks = toLevels(data.asks).sort((a, b) => a.price - b.price).slice(0, 20);
  return {
    bestBid: bids[0]?.price ?? null,
    bestAsk: asks[0]?.price ?? null,
    bidVolume: bids.length > 0 ? bids.reduce((s, l) => s + l.amount, 0) : null,
    askVolume: asks.length > 0 ? asks.reduce((s, l) => s + l.amount, 0) : null,
  };
}

// Объём в USDT: определяем, какое из полей amount/volume — это объём в котируемой валюте.
function pickQuoteVolume(amount: number | null, volume: number | null, last: number | null): number | null {
  if (last && amount && volume) {
    if (Math.abs(volume / amount - last) / last < 0.5) return volume;
    if (Math.abs(amount / volume - last) / last < 0.5) return amount;
  }
  if (last && amount) return amount * last;
  if (last && volume) return volume * last;
  return null;
}

export async function fetchSafeTradeData(): Promise<SafeTradeData | null> {
  const [tickerRes, c15Res, c60Res, depthRes] = await Promise.allSettled([
    getJson('/tickers'),
    getJson('/k-line?period=15&limit=96'),
    getJson('/k-line?period=60&limit=48'),
    getJson('/depth'),
  ]);

  const tickerRoot = tickerRes.status === 'fulfilled' ? (tickerRes.value as Record<string, any>) : null;
  const t = (tickerRoot?.ticker ?? tickerRoot ?? {}) as Record<string, unknown>;
  const candles15m = c15Res.status === 'fulfilled' ? parseCandles(c15Res.value) : [];
  const candles1h = c60Res.status === 'fulfilled' ? parseCandles(c60Res.value) : [];
  const depth = depthRes.status === 'fulfilled' ? parseDepth(depthRes.value) : null;

  const lastFromTicker = num(t.last);
  const lastPrice = lastFromTicker ?? candles15m[candles15m.length - 1]?.close ?? null;
  if (!lastPrice && candles15m.length === 0) {
    return null;
  }

  const open = num(t.open);
  const changePercent =
    num(t.price_change_percent) ??
    (open && lastPrice ? ((lastPrice - open) / open) * 100 : null);

  const bestBid = depth?.bestBid ?? num(t.buy);
  const bestAsk = depth?.bestAsk ?? num(t.sell);
  const spreadPercent =
    bestBid && bestAsk && bestAsk >= bestBid
      ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100
      : null;

  // Если тикер не вернул максимум/минимум, считаем по свечам последних 24 часов.
  const dayCandles = candles15m.slice(-96);
  const high24h =
    num(t.high) ?? (dayCandles.length > 0 ? Math.max(...dayCandles.map((c) => c.high)) : null);
  const low24h =
    num(t.low) ?? (dayCandles.length > 0 ? Math.min(...dayCandles.map((c) => c.low)) : null);

  return {
    lastPrice,
    changePercent,
    high24h,
    low24h,
    volumeQuote24h: pickQuoteVolume(num(t.amount), num(t.volume ?? t.vol), lastPrice),
    bestBid,
    bestAsk,
    spreadPercent,
    bidVolume: depth?.bidVolume ?? null,
    askVolume: depth?.askVolume ?? null,
    candles15m,
    candles1h,
  };
}

// Цена на бирже около заданного момента (для проверки прошлых прогнозов).
export async function fetchSafeTradePriceNearTime(targetUtcMs: number): Promise<number | null> {
  try {
    const fromSec = Math.floor((targetUtcMs - 40 * 60 * 1000) / 1000);
    const toSec = Math.floor((targetUtcMs + 40 * 60 * 1000) / 1000);
    const raw = await getJson(`/k-line?period=1&time_from=${fromSec}&time_to=${toSec}`);
    const candles = parseCandles(raw);
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
  } catch {
    return null;
  }
}
