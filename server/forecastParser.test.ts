import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisPrompt, tryParseForecast } from './forecastParser';
import { ForecastDirection, MarketSnapshot, NewsItem } from '../src/types';

test('buildAnalysisPrompt includes live market telemetry when provided', () => {
  const market: MarketSnapshot = {
    symbol: 'PEARL / USDT',
    primaryExchange: 'SafeTrade',
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
      { timestamp: 1700000000000, open: 0.04, high: 0.043, low: 0.039, close: 0.0421 },
    ],
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

  const prompt = buildAnalysisPrompt(news, 'en', market, false);
  assert.ok(prompt.includes('SafeTrade'));
  assert.ok(prompt.includes('0.0421'));
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
      chart_reasons: ['Higher lows on 30m'],
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
