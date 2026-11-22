import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderBookSummary,
  computeEmaSeries,
  computeRsiSeries,
  computeTechnicalIndicators,
} from './technicalAnalysis';
import { OhlcCandle } from '../src/types';

function makeTrendingCandles(
  count: number,
  startPrice: number,
  step: number,
  intervalMs = 15 * 60_000
): OhlcCandle[] {
  const baseTs = 1700000000000;
  const candles: OhlcCandle[] = [];
  for (let i = 0; i < count; i++) {
    const open = startPrice + i * step;
    const close = open + step * 0.8 + Math.sin(i * 0.6) * Math.abs(step) * 0.4;
    const high = Math.max(open, close) + Math.abs(step) * 0.5;
    const low = Math.min(open, close) - Math.abs(step) * 0.5;
    candles.push({
      timestamp: baseTs + i * intervalMs,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
      volume: 1000 + (i % 5) * 250 + (i === count - 1 ? 3500 : 0),
    });
  }
  return candles;
}

test('computeEmaSeries and computeRsiSeries produce valid rising values on uptrend', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 1 + i * 0.02);
  const ema9 = computeEmaSeries(closes, 9);
  assert.ok(ema9.length === 32);
  assert.ok(ema9[ema9.length - 1] > ema9[0]);

  const rsi = computeRsiSeries(closes, 14);
  assert.ok(rsi.length > 0);
  assert.equal(rsi[rsi.length - 1], 100);
});

test('computeTechnicalIndicators calculates EMA, RSI, MACD, ATR, Bollinger, POC and multi-TF trends', () => {
  const candles15m = makeTrendingCandles(65, 0.04, 0.0002, 15 * 60_000);
  const candles1h = makeTrendingCandles(50, 0.035, 0.0004, 60 * 60_000);
  const candles4h = makeTrendingCandles(30, 0.03, 0.0008, 4 * 60 * 60_000);
  const candles1d = makeTrendingCandles(25, 0.025, 0.0015, 24 * 60 * 60_000);

  const ti = computeTechnicalIndicators({
    candles15m,
    candles1h,
    candles4h,
    candles1d,
  });

  assert.ok(ti);
  assert.ok(ti.ema9 !== null && ti.ema21 !== null && ti.ema50 !== null);
  assert.ok(ti.ema9 > ti.ema21 && ti.ema21 > ti.ema50);
  assert.ok(ti.rsi14 !== null && ti.rsi14 > 55);
  assert.ok(ti.macd.line !== null && ti.macd.signal !== null && ti.macd.histogram !== null);
  assert.ok(ti.atr14 !== null && ti.atr14 > 0);
  assert.ok(ti.atrPercent !== null && ti.atrPercent > 0);
  assert.ok(ti.bollinger.upper !== null && ti.bollinger.lower !== null);
  assert.ok(ti.bollinger.upper > ti.bollinger.lower);
  assert.ok(ti.vwap !== null && ti.vwap > 0);
  assert.ok(ti.volumeRatio !== null && ti.volumeRatio > 1.5);
  assert.ok(ti.pocPrice !== null && ti.pocPrice > 0);
  assert.ok(ti.high7d !== null && ti.low7d !== null && ti.high7d > ti.low7d);
  assert.equal(ti.multiTimeframe.length, 4);
  assert.equal(ti.multiTimeframe[0].timeframe, '15m');
  assert.equal(ti.multiTimeframe[0].trend, 'bullish');
});

test('buildOrderBookSummary computes ±0.5/1/2% bands and largest bid/ask walls', () => {
  const bids = [
    { price: 0.0998, amount: 5000 },
    { price: 0.0992, amount: 40000 }, // largest bid wall within 1%
    { price: 0.0985, amount: 10000 },
  ];
  const asks = [
    { price: 0.1002, amount: 3000 },
    { price: 0.1008, amount: 15000 },
    { price: 0.1018, amount: 55000 }, // largest ask wall within 2%
  ];

  const book = buildOrderBookSummary(bids, asks, 0.1);
  assert.ok(book);
  assert.equal(book.bestBid, 0.0998);
  assert.equal(book.bestAsk, 0.1002);
  assert.equal(book.bands?.length, 3);
  assert.equal(book.bands?.[0].rangePercent, 0.5);
  assert.ok((book.bands?.[0].bidSharePercent ?? 0) > 50);
  assert.equal(book.largestBidWall?.price, 0.0992);
  assert.equal(book.largestAskWall?.price, 0.1018);
});
