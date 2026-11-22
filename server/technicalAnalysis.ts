import {
  OhlcCandle,
  OrderBookBand,
  OrderBookSummary,
  OrderBookWall,
  TechnicalIndicators,
  TimeframeTrend,
} from '../src/types';

export interface DepthLevel {
  price: number;
  amount: number;
}

function roundPrice(val: number): number {
  if (!Number.isFinite(val)) return val;
  if (val >= 100) return Number(val.toFixed(4));
  if (val >= 1) return Number(val.toFixed(6));
  return Number(val.toFixed(8));
}

export function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length < period || period <= 0) return [];
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out: number[] = [ema];
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

export function computeLatestEma(values: number[], period: number): number | null {
  const series = computeEmaSeries(values, period);
  return series.length > 0 ? roundPrice(series[series.length - 1]) : null;
}

export function computeRsiSeries(closes: number[], period = 14): number[] {
  if (closes.length <= period) return [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  const out: number[] = [
    avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)),
  ];

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push(Number(rsi.toFixed(2)));
  }

  return out;
}

export function detectRsiDivergence(
  candles: OhlcCandle[],
  rsiSeries: number[]
): 'bullish' | 'bearish' | 'none' {
  if (candles.length < 30 || rsiSeries.length < 16) return 'none';
  const offset = candles.length - rsiSeries.length;
  const sliceLen = Math.min(rsiSeries.length, 24);
  const startIdx = rsiSeries.length - sliceLen;
  const mid = startIdx + Math.floor(sliceLen / 2);

  let firstLowPrice = Infinity;
  let firstLowRsi = Infinity;
  let secondLowPrice = Infinity;
  let secondLowRsi = Infinity;

  let firstHighPrice = -Infinity;
  let firstHighRsi = -Infinity;
  let secondHighPrice = -Infinity;
  let secondHighRsi = -Infinity;

  for (let i = startIdx; i < mid; i++) {
    const c = candles[i + offset];
    const r = rsiSeries[i];
    if (c.low < firstLowPrice) {
      firstLowPrice = c.low;
      firstLowRsi = r;
    }
    if (c.high > firstHighPrice) {
      firstHighPrice = c.high;
      firstHighRsi = r;
    }
  }

  for (let i = mid; i < rsiSeries.length; i++) {
    const c = candles[i + offset];
    const r = rsiSeries[i];
    if (c.low < secondLowPrice) {
      secondLowPrice = c.low;
      secondLowRsi = r;
    }
    if (c.high > secondHighPrice) {
      secondHighPrice = c.high;
      secondHighRsi = r;
    }
  }

  // Bullish divergence: price makes lower low (>0.3%), RSI makes higher low (+3 pts)
  if (
    secondLowPrice < firstLowPrice * 0.997 &&
    secondLowRsi > firstLowRsi + 3 &&
    secondLowRsi < 50
  ) {
    return 'bullish';
  }

  // Bearish divergence: price makes higher high (>0.3%), RSI makes lower high (-3 pts)
  if (
    secondHighPrice > firstHighPrice * 1.003 &&
    secondHighRsi < firstHighRsi - 3 &&
    secondHighRsi > 50
  ) {
    return 'bearish';
  }

  return 'none';
}

export function computeMacd(closes: number[]): {
  line: number | null;
  signal: number | null;
  histogram: number | null;
} {
  if (closes.length < 35) return { line: null, signal: null, histogram: null };
  const ema12 = computeEmaSeries(closes, 12);
  const ema26 = computeEmaSeries(closes, 26);
  const offset = ema12.length - ema26.length;
  const macdLineSeries: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdLineSeries.push(ema12[i + offset] - ema26[i]);
  }
  const signalSeries = computeEmaSeries(macdLineSeries, 9);
  if (signalSeries.length === 0) return { line: null, signal: null, histogram: null };

  const line = macdLineSeries[macdLineSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  const histogram = line - signal;

  return {
    line: Number(line.toFixed(6)),
    signal: Number(signal.toFixed(6)),
    histogram: Number(histogram.toFixed(6)),
  };
}

export function computeAtr(candles: OhlcCandle[], period = 14): {
  atr: number | null;
  atrPercent: number | null;
} {
  if (candles.length <= period) return { atr: null, atrPercent: null };
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const c = candles[i];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    trs.push(tr);
  }
  if (trs.length < period) return { atr: null, atrPercent: null };

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  const lastClose = candles[candles.length - 1].close;
  const atrPercent = lastClose > 0 ? Number(((atr / lastClose) * 100).toFixed(2)) : null;

  return {
    atr: roundPrice(atr),
    atrPercent,
  };
}

export function computeBollinger(
  closes: number[],
  period = 20,
  mult = 2
): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  bandwidthPercent: number | null;
  squeeze: boolean;
} {
  if (closes.length < period) {
    return { upper: null, middle: null, lower: null, bandwidthPercent: null, squeeze: false };
  }

  const calcAt = (endExclusive: number) => {
    const slice = closes.slice(endExclusive - period, endExclusive);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    const upper = mean + mult * std;
    const lower = mean - mult * std;
    const bw = mean > 0 ? ((upper - lower) / mean) * 100 : 0;
    return { upper, middle: mean, lower, bw };
  };

  const current = calcAt(closes.length);
  const historicalBws: number[] = [];
  const start = Math.max(period, closes.length - 20);
  for (let i = start; i <= closes.length; i++) {
    historicalBws.push(calcAt(i).bw);
  }
  const avgBw =
    historicalBws.length > 0
      ? historicalBws.reduce((a, b) => a + b, 0) / historicalBws.length
      : current.bw;

  return {
    upper: roundPrice(current.upper),
    middle: roundPrice(current.middle),
    lower: roundPrice(current.lower),
    bandwidthPercent: Number(current.bw.toFixed(2)),
    squeeze: current.bw < avgBw * 0.78 || current.bw < 1.5,
  };
}

export function computeVwap(candles: OhlcCandle[]): number | null {
  let pvSum = 0;
  let volSum = 0;
  for (const c of candles.slice(-96)) {
    const vol = c.volume ?? 0;
    if (vol <= 0) continue;
    const typical = (c.high + c.low + c.close) / 3;
    pvSum += typical * vol;
    volSum += vol;
  }
  return volSum > 0 ? roundPrice(pvSum / volSum) : null;
}

export function computeVolumeRatio(candles: OhlcCandle[], period = 20): number | null {
  const withVol = candles.filter((c) => typeof c.volume === 'number' && c.volume > 0);
  if (withVol.length < period + 1) return null;
  const recent = withVol.slice(-2);
  const baseline = withVol.slice(-(period + 2), -2);
  if (baseline.length === 0) return null;
  const recentAvg = recent.reduce((s, c) => s + (c.volume ?? 0), 0) / recent.length;
  const baseAvg = baseline.reduce((s, c) => s + (c.volume ?? 0), 0) / baseline.length;
  if (baseAvg <= 0) return null;
  return Number((recentAvg / baseAvg).toFixed(2));
}

export function computeSwingsAndStructure(
  candles: OhlcCandle[],
  lookback = 3
): {
  swingHighs: number[];
  swingLows: number[];
  structure: 'HH/HL' | 'LH/LL' | 'range';
} {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push(roundPrice(candles[i].high));
    if (isLow) lows.push(roundPrice(candles[i].low));
  }

  let structure: 'HH/HL' | 'LH/LL' | 'range' = 'range';
  if (highs.length >= 2 && lows.length >= 2) {
    const lastH = highs[highs.length - 1];
    const prevH = highs[highs.length - 2];
    const lastL = lows[lows.length - 1];
    const prevL = lows[lows.length - 2];
    if (lastH > prevH && lastL > prevL) structure = 'HH/HL';
    else if (lastH < prevH && lastL < prevL) structure = 'LH/LL';
  }

  return {
    swingHighs: highs.slice(-4),
    swingLows: lows.slice(-4),
    structure,
  };
}

export function computeVolumeProfilePoc(candles: OhlcCandle[], bins = 16): number | null {
  const valid = candles.filter((c) => (c.volume ?? 0) > 0);
  if (valid.length < 6) return null;
  const minP = Math.min(...valid.map((c) => c.low));
  const maxP = Math.max(...valid.map((c) => c.high));
  if (maxP <= minP) return roundPrice(minP);

  const step = (maxP - minP) / bins;
  const buckets = new Array<number>(bins).fill(0);

  for (const c of valid) {
    const typical = (c.high + c.low + c.close) / 3;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((typical - minP) / step)));
    buckets[idx] += c.volume ?? 0;
  }

  let bestIdx = 0;
  for (let i = 1; i < bins; i++) {
    if (buckets[i] > buckets[bestIdx]) bestIdx = i;
  }
  return roundPrice(minP + (bestIdx + 0.5) * step);
}

export function summarizeTimeframeTrend(
  timeframe: '15m' | '1h' | '4h' | '1d',
  candles: OhlcCandle[]
): TimeframeTrend | null {
  if (!candles || candles.length < 15) return null;
  const closes = candles.map((c) => c.close);
  const emaFast = computeLatestEma(closes, 9);
  const emaSlow = computeLatestEma(closes, 21);
  const rsiSeries = computeRsiSeries(closes, 14);
  const rsi14 = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : null;
  const lastClose = closes[closes.length - 1];

  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (emaFast !== null && emaSlow !== null) {
    const diffPct = ((emaFast - emaSlow) / emaSlow) * 100;
    if (diffPct > 0.12 && lastClose >= emaFast * 0.998) trend = 'bullish';
    else if (diffPct < -0.12 && lastClose <= emaFast * 1.002) trend = 'bearish';
  }

  return {
    timeframe,
    trend,
    emaFast,
    emaSlow,
    rsi14,
  };
}

export function computeTechnicalIndicators(params: {
  candles15m: OhlcCandle[];
  candles1h?: OhlcCandle[];
  candles4h?: OhlcCandle[];
  candles1d?: OhlcCandle[];
}): TechnicalIndicators | undefined {
  const primary =
    params.candles15m.length >= 20
      ? params.candles15m
      : params.candles1h && params.candles1h.length >= 20
      ? params.candles1h
      : params.candles15m;

  if (!primary || primary.length < 15) return undefined;

  const closes = primary.map((c) => c.close);
  const rsiSeries = computeRsiSeries(closes, 14);
  const rsi14 = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : null;
  const rsiDivergence = detectRsiDivergence(primary, rsiSeries);
  const macd = computeMacd(closes);
  const { atr: atr14, atrPercent } = computeAtr(primary, 14);
  const bollinger = computeBollinger(closes, 20, 2);
  const vwap = computeVwap(primary);
  const volumeRatio = computeVolumeRatio(primary, 20);
  const { swingHighs, swingLows, structure } = computeSwingsAndStructure(primary, 3);

  const pocSource =
    params.candles1h && params.candles1h.length >= 12 ? params.candles1h.slice(-48) : primary;
  const pocPrice = computeVolumeProfilePoc(pocSource, 16);

  const weekSource =
    params.candles1d && params.candles1d.length >= 3
      ? params.candles1d.slice(-7)
      : params.candles4h && params.candles4h.length >= 6
      ? params.candles4h.slice(-42)
      : [];
  const high7d =
    weekSource.length > 0 ? roundPrice(Math.max(...weekSource.map((c) => c.high))) : null;
  const low7d =
    weekSource.length > 0 ? roundPrice(Math.min(...weekSource.map((c) => c.low))) : null;

  const multiTimeframe: TimeframeTrend[] = [];
  const tf15 = summarizeTimeframeTrend('15m', params.candles15m);
  if (tf15) multiTimeframe.push(tf15);
  const tf1h = params.candles1h ? summarizeTimeframeTrend('1h', params.candles1h) : null;
  if (tf1h) multiTimeframe.push(tf1h);
  const tf4h = params.candles4h ? summarizeTimeframeTrend('4h', params.candles4h) : null;
  if (tf4h) multiTimeframe.push(tf4h);
  const tf1d = params.candles1d ? summarizeTimeframeTrend('1d', params.candles1d) : null;
  if (tf1d) multiTimeframe.push(tf1d);

  return {
    ema9: computeLatestEma(closes, 9),
    ema21: computeLatestEma(closes, 21),
    ema50: computeLatestEma(closes, 50),
    ema200: computeLatestEma(closes, 200),
    vwap,
    rsi14,
    rsiDivergence,
    macd,
    atr14,
    atrPercent,
    bollinger,
    volumeRatio,
    swingHighs,
    swingLows,
    pocPrice,
    high7d,
    low7d,
    structure,
    multiTimeframe,
  };
}

export function buildOrderBookSummary(
  bidsRaw: DepthLevel[],
  asksRaw: DepthLevel[],
  midPriceFallback: number | null
): OrderBookSummary | undefined {
  const bids = [...bidsRaw]
    .filter((l) => l.price > 0 && l.amount > 0)
    .sort((a, b) => b.price - a.price);
  const asks = [...asksRaw]
    .filter((l) => l.price > 0 && l.amount > 0)
    .sort((a, b) => a.price - b.price);

  if (bids.length === 0 && asks.length === 0) return undefined;

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const mid =
    bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk ?? midPriceFallback;

  const topBids = bids.slice(0, 20);
  const topAsks = asks.slice(0, 20);
  const bidVolume = topBids.reduce((s, l) => s + l.amount, 0);
  const askVolume = topAsks.reduce((s, l) => s + l.amount, 0);

  const bands: OrderBookBand[] = [];
  if (mid && mid > 0) {
    for (const pct of [0.5, 1, 2]) {
      const minBid = mid * (1 - pct / 100);
      const maxAsk = mid * (1 + pct / 100);
      const bVol = bids
        .filter((l) => l.price >= minBid)
        .reduce((s, l) => s + l.amount * l.price, 0);
      const aVol = asks
        .filter((l) => l.price <= maxAsk)
        .reduce((s, l) => s + l.amount * l.price, 0);
      const total = bVol + aVol;
      bands.push({
        rangePercent: pct,
        bidVolume: Math.round(bVol),
        askVolume: Math.round(aVol),
        bidSharePercent: total > 0 ? Number(((bVol / total) * 100).toFixed(1)) : 50,
      });
    }
  }

  const findLargestWall = (
    levels: DepthLevel[],
    side: 'bid' | 'ask'
  ): OrderBookWall | null => {
    if (!mid || mid <= 0 || levels.length === 0) return null;
    const withinRange = levels.filter(
      (l) => Math.abs((l.price - mid) / mid) * 100 <= 3.5
    );
    const pool = withinRange.length > 0 ? withinRange : levels.slice(0, 20);
    let best = pool[0];
    let bestVal = best.price * best.amount;
    for (const l of pool) {
      const val = l.price * l.amount;
      if (val > bestVal) {
        bestVal = val;
        best = l;
      }
    }
    return {
      side,
      price: roundPrice(best.price),
      amount: Number(best.amount.toFixed(2)),
      valueUsd: Math.round(bestVal),
      distancePercent: Number((Math.abs((best.price - mid) / mid) * 100).toFixed(2)),
    };
  };

  return {
    bestBid,
    bestAsk,
    bidVolume,
    askVolume,
    bands,
    largestBidWall: findLargestWall(bids, 'bid'),
    largestAskWall: findLargestWall(asks, 'ask'),
  };
}
