import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccuracyMetrics } from './forecast';
import { ForecastDirection, ForecastHistoryEntry } from '../types';

function makeEntry(
  id: number,
  createdAtUtc: string,
  direction: ForecastDirection,
  confidence: number,
  priceNow: number,
  actualPrice1h: number | null,
  targetPrice: number | null = null
): ForecastHistoryEntry {
  return {
    id,
    createdAtUtc,
    priceNow,
    marketPriceAtForecast: priceNow,
    direction,
    confidence,
    targetPrice,
    stopPrice: null,
    supportText: '',
    resistanceText: '',
    chartReasons: '',
    newsImpact: '',
    newsReasons: '',
    risks: '',
    modelName: 'gemini-4-hydrogen',
    providerName: 'Gemini API',
    responseTimeMs: 900,
    actualPrice1h,
    actualPrice2h: actualPrice1h,
    actualPrice4h: actualPrice1h,
  };
}

test('calculateAccuracyMetrics evaluates verified actual prices and high-confidence calibration', () => {
  const entries: ForecastHistoryEntry[] = [
    makeEntry(1, '2026-11-17T01:00:00Z', ForecastDirection.Up, 80, 0.04, 0.044, 0.044),
    makeEntry(2, '2026-11-17T03:00:00Z', ForecastDirection.Down, 75, 0.05, 0.045, 0.045),
    makeEntry(3, '2026-11-17T06:00:00Z', ForecastDirection.Up, 60, 0.04, 0.042, 0.042),
  ];

  const metrics = calculateAccuracyMetrics(entries);
  assert.equal(metrics.oneHour.hasSufficientData, true);
  assert.equal(metrics.oneHour.evaluableCount, 3);
  assert.equal(metrics.oneHour.correctCount, 3);
  assert.equal(metrics.oneHour.accuracyPercent, 100);
  assert.equal(metrics.calibration.highConfTotal, 2);
  assert.equal(metrics.calibration.highConfCorrect, 2);
  assert.equal(metrics.calibration.highConfWinRate, 100);
  assert.equal(metrics.calibration.avgTargetErrorPercent, 0);
});
