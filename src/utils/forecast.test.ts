import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccuracyMetrics, isDirectionCorrect } from './forecast';
import { ForecastDirection, ForecastHistoryEntry } from '../types';

function makeEntry(
  id: number,
  createdAtUtc: string,
  direction: ForecastDirection,
  confidence: number,
  priceNow: number,
  actualPrice1h: number | null,
  targetPrice: number | null = null,
  extra: Partial<ForecastHistoryEntry> = {}
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
    ...extra,
  };
}

test('calculateAccuracyMetrics evaluates verified actual prices, calibration, and target/stop hit rate', () => {
  const entries: ForecastHistoryEntry[] = [
    makeEntry(1, '2026-11-17T01:00:00Z', ForecastDirection.Up, 80, 0.04, 0.044, 0.044, {
      outcomeStatus: 'target_hit',
    }),
    makeEntry(2, '2026-11-17T03:00:00Z', ForecastDirection.Down, 75, 0.05, 0.045, 0.045, {
      outcomeStatus: 'target_hit',
    }),
    makeEntry(3, '2026-11-17T06:00:00Z', ForecastDirection.Up, 60, 0.04, 0.042, 0.042, {
      outcomeStatus: 'stop_hit',
    }),
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
  assert.equal(metrics.calibration.targetHitCount, 2);
  assert.equal(metrics.calibration.stopHitCount, 1);
  assert.equal(metrics.calibration.targetHitRate, 66.7);
});

test('isDirectionCorrect uses ATR-adaptive threshold for Sideways forecasts', () => {
  // With default 0.5% threshold, a 0.8% move is NOT sideways
  assert.equal(isDirectionCorrect(ForecastDirection.Sideways, 1.0, 1.008, null), false);
  // With ATR = 2.4%, threshold becomes max(0.5%, 1.2%) = 1.2%, so 0.8% IS sideways
  assert.equal(isDirectionCorrect(ForecastDirection.Sideways, 1.0, 1.008, 2.4), true);
});
