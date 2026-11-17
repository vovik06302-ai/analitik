import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreNewsItems } from './newsRadar';
import { NewsItem } from '../src/types';

test('scoreNewsItems tags direct PEARL items and bullish sentiment', () => {
  const nowIso = new Date().toISOString();
  const sample: NewsItem[] = [
    {
      title: 'Pearl Research Labs announces major SafeTrade listing rally',
      link: 'https://example.com/1',
      source: 'CryptoWire',
      publishedAt: nowIso,
      matchedQuery: 'Pearl Research Labs',
      formattedDate: '17.11 10:00',
    },
    {
      title: 'Exchange suffers major hack and exploit plunge across markets',
      link: 'https://example.com/2',
      source: 'CoinDesk',
      publishedAt: nowIso,
      matchedQuery: 'RSS',
      formattedDate: '17.11 09:00',
    },
  ];

  const scored = scoreNewsItems(sample);
  assert.equal(scored[0].relevance, 'DirectPearl');
  assert.equal(scored[0].sentiment, 'Bullish');
  assert.ok((scored[0].relevanceScore ?? 0) >= 70);

  assert.equal(scored[1].relevance, 'CryptoMarket');
  assert.equal(scored[1].sentiment, 'Bearish');
});
