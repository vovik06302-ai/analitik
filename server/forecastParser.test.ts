import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnalysisPrompt,
  tryParseForecast,
  validateForecastGuardrails,
} from './forecastParser';
import { ForecastDirection, MarketSnapshot, NewsItem } from '../src/types';

test('buildAnalysisPrompt includes live market telemetry, horizon, indicators and macro context', () => {
  const market: MarketSnapshot = {
    symbol: 'PEARL / USDT',
    primaryExchange: 'Gate.io',
    candlesSource: 'Gate.io',
    safeTradeStatus: 'blocked_403',
    priceUsd: 0.0421,
    priceChange24hPercent: 9.4,
    high24h: 0.045,
    low24h: 0.038,
    volume24hUsd: 125000,
    spreadPercent: 0.4,
    marketCapUsd: 4200000,
    dexLiquidityUsd: 80000,
    tickers: [],
    ohlc: [
      { timestamp: 1700000000000, open: 0.04, high: 0.043, low: 0.039, close: 0.0421, volume: 9500 },
    ],
    ohlcPeriodMinutes: 15,
    technicalIndicators: {
      ema9: 0.0418,
      ema21: 0.0411,
      ema50: 0.0402,
      ema200: null,
      vwap: 0.0415,
      rsi14: 61.2,
      rsiDivergence: 'none',
      macd: { line: 0.0004, signal: 0.0002, histogram: 0.0002 },
      atr14: 0.0009,
      atrPercent: 2.14,
      bollinger: { upper: 0.0435, middle: 0.0414, lower: 0.0393, bandwidthPercent: 10.1, squeeze: false },
      volumeRatio: 1.8,
      swingHighs: [0.0445],
      swingLows: [0.0392],
      pocPrice: 0.041,
      high7d: 0.047,
      low7d: 0.036,
      structure: 'HH/HL',
      multiTimeframe: [
        { timeframe: '15m', trend: 'bullish', emaFast: 0.0418, emaSlow: 0.0411, rsi14: 61.2 },
      ],
    },
    macroContext: {
      btc: {
        symbol: 'BTC/USDT',
        priceUsd: 95000,
        change1hPercent: 0.8,
        change4hPercent: 1.5,
        change24hPercent: 3.2,
        trend1h: 'bullish',
      },
      eth: null,
    },
    anomalies: ['Резкое движение 24ч: +9.40%'],
    fetchedAtUtc: '2026-11-17T10:00:00.000Z',
  };
  const news: NewsItem[] = [
    {
      title: 'PEARL volume climbs on SafeTrade',
      link: 'https://example.com',
      source: 'Decrypt',
      publishedAt: '2026-11-17T09:00:00.000Z',
      matchedQuery: 'SafeTrade',
      formattedDate: '17.11 09:00',
      relevance: 'DirectPearl',
      sentiment: 'Bullish',
    },
  ];

  const prompt = buildAnalysisPrompt(news, 'en', market, false, 2);
  assert.ok(prompt.includes('Gate.io'));
  assert.ok(prompt.includes('next 2 hour(s)'));
  assert.ok(prompt.includes('0.0421'));
  assert.ok(prompt.includes('RSI(14)=61.2'));
  assert.ok(prompt.includes('BTC $95000'));
  assert.ok(prompt.includes('No chart screenshot is attached'));
  assert.ok(prompt.includes('[PEARL][Bullish]'));
});

test('tryParseForecast extracts valid fenced JSON and normalizes fields', () => {
  const raw = [
    '```json',
    JSON.stringify({
      price_now: '$0.0421',
      direction: 'bullish',
      confidence: 84.6,
      support: [0.039, 0.037],
      resistance: ['0.045'],
      target_price: 0.046,
      stop_price: 0.0385,
      chart_reasons: ['Higher lows on 15m'],
      news_impact: 'Positive catalyst',
      news_reasons: ['Listing momentum'],
      risks: ['Thin orderbook'],
    }),
    '```',
  ].join('\n');

  const outcome = tryParseForecast(raw);
  assert.equal(outcome.success, true);
  assert.equal(outcome.result?.direction, ForecastDirection.Up);
  assert.equal(outcome.result?.confidence, 85);
  assert.equal(outcome.result?.priceNow, 0.0421);
  assert.deepEqual(outcome.result?.resistance, [0.045]);
});

test('validateForecastGuardrails detects inverted target/stop and filters misplaced levels', () => {
  const parsedOutcome = tryParseForecast(
    JSON.stringify({
      price_now: 0.05,
      direction: 'up',
      confidence: 75,
      support: [0.048, 0.055], // 0.055 is invalid support above price
      resistance: [0.047, 0.054], // 0.047 is invalid resistance below price
      target_price: 0.046, // fatal: below refPrice for up
      stop_price: 0.052, // fatal: above refPrice for up
      chart_reasons: ['Test'],
      news_impact: 'Neutral',
      news_reasons: [],
      risks: [],
    })
  );
  assert.equal(parsedOutcome.success, true);
  const check = validateForecastGuardrails(parsedOutcome.result!, null, 4);
  assert.equal(check.fatalErrors.length, 2);
  assert.deepEqual(check.sanitized.support, [0.048]);
  assert.deepEqual(check.sanitized.resistance, [0.054]);
});

test('validateForecastGuardrails calculates R:R ratio for valid setup', () => {
  const parsedOutcome = tryParseForecast(
    JSON.stringify({
      price_now: 0.1,
      direction: 'up',
      confidence: 72,
      support: [0.095],
      resistance: [0.11],
      target_price: 0.11,
      stop_price: 0.095,
      chart_reasons: ['Breakout'],
      news_impact: 'Positive',
      news_reasons: [],
      risks: [],
    })
  );
  assert.equal(parsedOutcome.success, true);
  const check = validateForecastGuardrails(parsedOutcome.result!, null, 2);
  assert.equal(check.fatalErrors.length, 0);
  assert.equal(check.riskRewardRatio, 2);
  assert.equal(check.sanitized.horizonHours, 2);
});
