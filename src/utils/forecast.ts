import {
  AccuracyMetrics,
  CalibrationStats,
  CaptureRegion,
  ForecastDirection,
  ForecastHistoryEntry,
  HorizonAccuracy,
} from '../types';
import { Language, t } from '../i18n/translations';

const MINIMUM_SAMPLES_FOR_ACCURACY = 3;

export function formatPrice(price: number | null | undefined, noData: string): string {
  if (price === null || price === undefined || !Number.isFinite(price)) {
    return noData;
  }
  return Number(price.toFixed(8)).toString();
}

export function formatCompactUsd(val: number | null | undefined, noData: string): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return noData;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

export function formatRegionBadge(region: CaptureRegion, lang: Language): string {
  if (region.width > 0 && region.height > 0) {
    return `${region.width}×${region.height} (${region.x}, ${region.y})`;
  }
  return t(lang, 'RegionNotSet');
}

export function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatResponseTime(ms: number, noData: string): string {
  if (!Number.isFinite(ms) || ms <= 0) return noData;
  return `${(ms / 1000).toFixed(1)} с`;
}

export function getDirectionLabel(dir: ForecastDirection, lang: Language): string {
  switch (dir) {
    case ForecastDirection.Up:
      return t(lang, 'DirectionUp');
    case ForecastDirection.Down:
      return t(lang, 'DirectionDown');
    case ForecastDirection.Sideways:
      return t(lang, 'DirectionSideways');
    default:
      return t(lang, 'DirectionUnknown');
  }
}

export function getDirectionColor(dir: ForecastDirection): string {
  switch (dir) {
    case ForecastDirection.Up:
      return '#22C55E';
    case ForecastDirection.Down:
      return '#EF4444';
    case ForecastDirection.Sideways:
      return '#F59E0B';
    default:
      return '#64748B';
  }
}

export function getDirectionTint(dir: ForecastDirection): string {
  switch (dir) {
    case ForecastDirection.Up:
      return 'rgba(34, 197, 94, 0.16)';
    case ForecastDirection.Down:
      return 'rgba(239, 68, 68, 0.16)';
    case ForecastDirection.Sideways:
      return 'rgba(245, 158, 11, 0.16)';
    default:
      return 'rgba(100, 116, 139, 0.13)';
  }
}

function getEntryBasePrice(entry: ForecastHistoryEntry): number | null {
  if (entry.marketPriceAtForecast && entry.marketPriceAtForecast > 0) {
    return entry.marketPriceAtForecast;
  }
  if (entry.priceNow && entry.priceNow > 0) {
    return entry.priceNow;
  }
  return null;
}

function isDirectionCorrect(
  direction: ForecastDirection,
  startPrice: number,
  endPrice: number
): boolean {
  const relChange = (endPrice - startPrice) / startPrice;
  if (direction === ForecastDirection.Up) return endPrice > startPrice;
  if (direction === ForecastDirection.Down) return endPrice < startPrice;
  if (direction === ForecastDirection.Sideways) return Math.abs(relChange) <= 0.005;
  return false;
}

function getVerifiedEndPrice(
  chronological: ForecastHistoryEntry[],
  index: number,
  hours: number,
  toleranceMinutes: number
): number | null {
  const current = chronological[index];
  if (hours === 1 && current.actualPrice1h && current.actualPrice1h > 0) {
    return current.actualPrice1h;
  }
  if (hours === 2 && current.actualPrice2h && current.actualPrice2h > 0) {
    return current.actualPrice2h;
  }
  if (hours === 4 && current.actualPrice4h && current.actualPrice4h > 0) {
    return current.actualPrice4h;
  }

  const currentMs = new Date(current.createdAtUtc).getTime();
  const targetMs = currentMs + hours * 3600 * 1000;
  const toleranceMs = toleranceMinutes * 60 * 1000;

  let bestMatch: ForecastHistoryEntry | null = null;
  let bestDiff = Number.MAX_SAFE_INTEGER;

  for (let j = index + 1; j < chronological.length; j++) {
    const candidate = chronological[j];
    const candPrice = getEntryBasePrice(candidate);
    if (!candPrice) continue;
    const candMs = new Date(candidate.createdAtUtc).getTime();
    const diff = Math.abs(candMs - targetMs);
    if (diff <= toleranceMs && diff < bestDiff) {
      bestDiff = diff;
      bestMatch = candidate;
    }
  }

  return bestMatch ? getEntryBasePrice(bestMatch) : null;
}

function evaluateHorizon(
  chronological: ForecastHistoryEntry[],
  hours: number,
  toleranceMinutes: number
): HorizonAccuracy {
  let evaluable = 0;
  let correct = 0;

  for (let i = 0; i < chronological.length; i++) {
    const current = chronological[i];
    const startPrice = getEntryBasePrice(current);
    if (!startPrice) continue;

    const endPrice = getVerifiedEndPrice(chronological, i, hours, toleranceMinutes);
    if (!endPrice) continue;

    evaluable++;
    if (isDirectionCorrect(current.direction, startPrice, endPrice)) {
      correct++;
    }
  }

  const sufficient = evaluable >= MINIMUM_SAMPLES_FOR_ACCURACY;
  return {
    hours,
    evaluableCount: evaluable,
    correctCount: correct,
    hasSufficientData: sufficient,
    accuracyPercent: sufficient ? Math.round((correct * 1000) / evaluable) / 10 : null,
  };
}

function evaluateCalibration(chronological: ForecastHistoryEntry[]): CalibrationStats {
  let highConfTotal = 0;
  let highConfCorrect = 0;
  const targetErrors: number[] = [];

  for (let i = 0; i < chronological.length; i++) {
    const entry = chronological[i];
    const startPrice = getEntryBasePrice(entry);
    if (!startPrice) continue;

    const endPrice =
      getVerifiedEndPrice(chronological, i, 4, 60) ??
      getVerifiedEndPrice(chronological, i, 2, 45) ??
      getVerifiedEndPrice(chronological, i, 1, 30);

    if (!endPrice) continue;

    if (entry.confidence >= 70) {
      highConfTotal++;
      if (isDirectionCorrect(entry.direction, startPrice, endPrice)) {
        highConfCorrect++;
      }
    }

    if (entry.targetPrice && entry.targetPrice > 0) {
      const errPct = (Math.abs(entry.targetPrice - endPrice) / endPrice) * 100;
      if (Number.isFinite(errPct)) {
        targetErrors.push(errPct);
      }
    }
  }

  return {
    highConfTotal,
    highConfCorrect,
    highConfWinRate:
      highConfTotal > 0 ? Math.round((highConfCorrect * 1000) / highConfTotal) / 10 : null,
    avgTargetErrorPercent:
      targetErrors.length > 0
        ? Math.round((targetErrors.reduce((a, b) => a + b, 0) / targetErrors.length) * 100) / 100
        : null,
  };
}

export function calculateAccuracyMetrics(entries: ForecastHistoryEntry[]): AccuracyMetrics {
  const chronological = entries
    .filter(
      (e) =>
        getEntryBasePrice(e) !== null && e.direction !== ForecastDirection.Unknown
    )
    .sort((a, b) => new Date(a.createdAtUtc).getTime() - new Date(b.createdAtUtc).getTime());

  return {
    oneHour: evaluateHorizon(chronological, 1, 30),
    twoHours: evaluateHorizon(chronological, 2, 45),
    fourHours: evaluateHorizon(chronological, 4, 60),
    calibration: evaluateCalibration(chronological),
  };
}

function escapeCsv(value: string): string {
  if (!value) return '""';
  const escaped = value.replaceAll('"', '""').replaceAll('\r', ' ').replaceAll('\n', ' ');
  return `"${escaped}"`;
}

export function exportHistoryToCsv(entries: ForecastHistoryEntry[]): void {
  const header =
    'ID;Время (локальное);Цена;Рынок (SQLite);Направление;Уверенность (%);Цель;Стоп;Факт 1ч;Факт 2ч;Факт 4ч;Поддержка;Сопротивление;Провайдер;Модель;Время ответа (мс);Причины по графику;Влияние новостей;Риски';

  const lines = entries.map((e) => {
    const row = [
      String(e.id),
      formatLocalDateTime(e.createdAtUtc),
      e.priceNow !== null && Number.isFinite(e.priceNow) ? String(e.priceNow) : 'нет данных',
      e.marketPriceAtForecast != null && Number.isFinite(e.marketPriceAtForecast)
        ? String(e.marketPriceAtForecast)
        : 'нет данных',
      e.direction,
      String(e.confidence),
      e.targetPrice !== null && Number.isFinite(e.targetPrice) ? String(e.targetPrice) : 'нет данных',
      e.stopPrice !== null && Number.isFinite(e.stopPrice) ? String(e.stopPrice) : 'нет данных',
      e.actualPrice1h != null ? String(e.actualPrice1h) : '',
      e.actualPrice2h != null ? String(e.actualPrice2h) : '',
      e.actualPrice4h != null ? String(e.actualPrice4h) : '',
      e.supportText,
      e.resistanceText,
      e.providerName,
      e.modelName,
      String(e.responseTimeMs),
      e.chartReasons,
      e.newsImpact,
      e.risks,
    ];
    return row.map(escapeCsv).join(';');
  });

  const csvContent = '\uFEFF' + [header, ...lines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fileName = `pearl_ai_history_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
