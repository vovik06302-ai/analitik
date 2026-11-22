import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCryptoNewsQuery,
  isNonCryptoPearlNoise,
  prioritizeAndSelectNews,
  scoreNewsItems,
} from './newsRadar';
import { NewsItem } from '../src/types';

test('scoreNewsItems tags direct PEARL items, bullish/bearish sentiment, and negation', () => {
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
    {
      title: 'PEARL token avoids crash and sees no hack on NEAR DEX',
      link: 'https://example.com/3',
      source: 'Decrypt',
      publishedAt: nowIso,
      matchedQuery: 'PEARL USDT',
      formattedDate: '17.11 08:30',
    },
  ];

  const scored = scoreNewsItems(sample);
  assert.equal(scored[0].relevance, 'DirectPearl');
  assert.equal(scored[0].sentiment, 'Bullish');
  assert.ok((scored[0].relevanceScore ?? 0) >= 70);

  assert.equal(scored[1].relevance, 'CryptoMarket');
  assert.equal(scored[1].sentiment, 'Bearish');

  assert.equal(scored[2].relevance, 'DirectPearl');
  assert.equal(scored[2].sentiment, 'Bullish');
});

test('isNonCryptoPearlNoise filters jewelry/music/history headlines and buildCryptoNewsQuery scopes bare queries', () => {
  const noise: NewsItem = {
    title: 'Pearl Jam announces European summer tour dates',
    link: 'https://example.com/music',
    source: 'RollingStone',
    publishedAt: new Date().toISOString(),
    matchedQuery: 'Pearl',
    formattedDate: '17.11 10:00',
  };
  assert.equal(isNonCryptoPearlNoise(noise), true);

  assert.ok(buildCryptoNewsQuery('Pearl Research Labs').includes('crypto OR token'));
  assert.equal(buildCryptoNewsQuery('PEARL USDT'), '"PEARL USDT"');
});

test('prioritizeAndSelectNews preserves DirectPearl items even when 50 newer market items exist', () => {
  const now = Date.now();
  const marketItems: NewsItem[] = Array.from({ length: 50 }, (_, i) => ({
    title: `Bitcoin ETF daily update #${i}`,
    link: `https://example.com/m/${i}`,
    source: 'CoinDesk',
    publishedAt: new Date(now - i * 60_000).toISOString(),
    matchedQuery: 'RSS',
    formattedDate: '17.11 10:00',
  }));
  const directItems: NewsItem[] = Array.from({ length: 6 }, (_, i) => ({
    title: `PEARL USDT liquidity rises on Gate.io #${i}`,
    link: `https://example.com/p/${i}`,
    source: 'Google News',
    publishedAt: new Date(now - (12 + i) * 3_600_000).toISOString(),
    matchedQuery: 'PEARL USDT',
    formattedDate: '16.11 20:00',
  }));

  const selected = prioritizeAndSelectNews([...marketItems, ...directItems], 40, 15);
  assert.equal(selected.length, 40);
  const directCount = selected.filter((item) => item.relevance === 'DirectPearl').length;
  assert.equal(directCount, 6);
  assert.equal(selected[0].relevance, 'DirectPearl');
});
