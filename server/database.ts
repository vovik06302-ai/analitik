import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import {
  ConsensusSummary,
  ForecastDirection,
  ForecastHistoryEntry,
  ForecastOutcomeStatus,
  ForecastResult,
  NewsItem,
} from '../src/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'pearl_analyst.db');

class ForecastDatabase {
  private readonly db: DatabaseSync;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS forecasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at_utc TEXT NOT NULL,
        price_now REAL NULL,
        direction TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        target_price REAL NULL,
        stop_price REAL NULL,
        support_text TEXT NOT NULL,
        resistance_text TEXT NOT NULL,
        chart_reasons TEXT NOT NULL,
        news_impact TEXT NOT NULL,
        news_reasons TEXT NOT NULL,
        risks TEXT NOT NULL,
        model_name TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        response_time_ms INTEGER NOT NULL,
        screenshot_data_url TEXT NULL,
        news_snapshot_json TEXT NULL,
        market_price_at_forecast REAL NULL,
        consensus_json TEXT NULL,
        actual_price_1h REAL NULL,
        actual_price_2h REAL NULL,
        actual_price_4h REAL NULL,
        horizon_hours INTEGER NULL,
        atr_percent_at_forecast REAL NULL,
        outcome_status TEXT NULL,
        high_during_horizon REAL NULL,
        low_during_horizon REAL NULL
      );
      CREATE INDEX IF NOT EXISTS idx_forecasts_created ON forecasts(created_at_utc);
    `);

    // Safe migration for existing SQLite databases created before v1.0.26
    const cols = this.db.prepare('PRAGMA table_info(forecasts)').all() as Array<{ name: string }>;
    const existing = new Set(cols.map((c) => c.name));
    const additions: Array<[string, string]> = [
      ['horizon_hours', 'INTEGER NULL'],
      ['atr_percent_at_forecast', 'REAL NULL'],
      ['outcome_status', 'TEXT NULL'],
      ['high_during_horizon', 'REAL NULL'],
      ['low_during_horizon', 'REAL NULL'],
    ];
    for (const [col, def] of additions) {
      if (!existing.has(col)) {
        this.db.exec(`ALTER TABLE forecasts ADD COLUMN ${col} ${def}`);
      }
    }
  }

  public insertForecast(
    result: ForecastResult,
    newsSnapshot: NewsItem[],
    marketPrice: number | null,
    horizonHours = 4,
    atrPercent: number | null = null
  ): ForecastHistoryEntry {
    const supportText = result.support.join('; ');
    const resistanceText = result.resistance.join('; ');
    const chartReasons = result.chartReasons.join(' | ');
    const newsReasons = result.newsReasons.join(' | ');
    const risks = result.risks.join(' | ');

    const stmt = this.db.prepare(`
      INSERT INTO forecasts (
        created_at_utc, price_now, direction, confidence, target_price, stop_price,
        support_text, resistance_text, chart_reasons, news_impact, news_reasons,
        risks, model_name, provider_name, response_time_ms, screenshot_data_url,
        news_snapshot_json, market_price_at_forecast, consensus_json,
        horizon_hours, atr_percent_at_forecast, outcome_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      result.createdAtUtc,
      result.priceNow,
      result.direction,
      result.confidence,
      result.targetPrice,
      result.stopPrice,
      supportText,
      resistanceText,
      chartReasons,
      result.newsImpact,
      newsReasons,
      risks,
      result.modelName,
      result.providerName,
      result.responseTimeMs,
      result.screenshotDataUrl ?? null,
      JSON.stringify(newsSnapshot.slice(0, 15)),
      marketPrice,
      result.consensus ? JSON.stringify(result.consensus) : null,
      horizonHours,
      atrPercent,
      'pending'
    );

    return {
      id: Number(info.lastInsertRowid),
      createdAtUtc: result.createdAtUtc,
      priceNow: result.priceNow,
      direction: result.direction,
      confidence: result.confidence,
      targetPrice: result.targetPrice,
      stopPrice: result.stopPrice,
      supportText,
      resistanceText,
      chartReasons,
      newsImpact: result.newsImpact,
      newsReasons,
      risks,
      modelName: result.modelName,
      providerName: result.providerName,
      responseTimeMs: result.responseTimeMs,
      screenshotDataUrl: result.screenshotDataUrl,
      newsSnapshot: newsSnapshot.slice(0, 15),
      marketPriceAtForecast: marketPrice,
      consensusSummary: result.consensus ?? null,
      actualPrice1h: null,
      actualPrice2h: null,
      actualPrice4h: null,
      horizonHours,
      atrPercentAtForecast: atrPercent,
      outcomeStatus: 'pending',
      highDuringHorizon: null,
      lowDuringHorizon: null,
    };
  }

  public getAll(limit = 250): ForecastHistoryEntry[] {
    const rows = this.db
      .prepare(`
        SELECT id, created_at_utc, price_now, direction, confidence, target_price, stop_price,
               support_text, resistance_text, chart_reasons, news_impact, news_reasons,
               risks, model_name, provider_name, response_time_ms, screenshot_data_url,
               news_snapshot_json, market_price_at_forecast, consensus_json,
               actual_price_1h, actual_price_2h, actual_price_4h,
               horizon_hours, atr_percent_at_forecast, outcome_status,
               high_during_horizon, low_during_horizon
        FROM forecasts
        ORDER BY datetime(created_at_utc) DESC
        LIMIT ?
      `)
      .all(limit) as Array<Record<string, any>>;

    return rows.map((r) => {
      let newsSnapshot: NewsItem[] = [];
      let consensusSummary: ConsensusSummary | null = null;
      try {
        if (r.news_snapshot_json) newsSnapshot = JSON.parse(String(r.news_snapshot_json));
      } catch {
        // Ignore parse error
      }
      try {
        if (r.consensus_json) consensusSummary = JSON.parse(String(r.consensus_json));
      } catch {
        // Ignore parse error
      }

      return {
        id: Number(r.id),
        createdAtUtc: String(r.created_at_utc),
        priceNow: r.price_now !== null ? Number(r.price_now) : null,
        direction: (r.direction as ForecastDirection) ?? ForecastDirection.Unknown,
        confidence: Number(r.confidence),
        targetPrice: r.target_price !== null ? Number(r.target_price) : null,
        stopPrice: r.stop_price !== null ? Number(r.stop_price) : null,
        supportText: String(r.support_text ?? ''),
        resistanceText: String(r.resistance_text ?? ''),
        chartReasons: String(r.chart_reasons ?? ''),
        newsImpact: String(r.news_impact ?? ''),
        newsReasons: String(r.news_reasons ?? ''),
        risks: String(r.risks ?? ''),
        modelName: String(r.model_name ?? ''),
        providerName: String(r.provider_name ?? ''),
        responseTimeMs: Number(r.response_time_ms ?? 0),
        screenshotDataUrl: r.screenshot_data_url ? String(r.screenshot_data_url) : undefined,
        newsSnapshot,
        marketPriceAtForecast:
          r.market_price_at_forecast !== null ? Number(r.market_price_at_forecast) : null,
        consensusSummary,
        actualPrice1h: r.actual_price_1h !== null ? Number(r.actual_price_1h) : null,
        actualPrice2h: r.actual_price_2h !== null ? Number(r.actual_price_2h) : null,
        actualPrice4h: r.actual_price_4h !== null ? Number(r.actual_price_4h) : null,
        horizonHours: r.horizon_hours !== null ? Number(r.horizon_hours) : null,
        atrPercentAtForecast:
          r.atr_percent_at_forecast !== null ? Number(r.atr_percent_at_forecast) : null,
        outcomeStatus: (r.outcome_status as ForecastOutcomeStatus) ?? null,
        highDuringHorizon:
          r.high_during_horizon !== null ? Number(r.high_during_horizon) : null,
        lowDuringHorizon:
          r.low_during_horizon !== null ? Number(r.low_during_horizon) : null,
      };
    });
  }

  public getRecentFeedback(limit = 3): ForecastHistoryEntry[] {
    return this.getAll(limit);
  }

  /**
   * Computes empirical directional accuracy per model from verified history
   * (minimum 5 verified entries required before weighting diverges from neutral 0.5).
   */
  public getModelHistoricalWinRates(): Map<string, { winRate: number; sampleSize: number }> {
    const entries = this.getAll(250);
    const stats = new Map<string, { total: number; correct: number }>();

    for (const e of entries) {
      const base = e.marketPriceAtForecast ?? e.priceNow;
      const fact =
        e.horizonHours === 1
          ? e.actualPrice1h
          : e.horizonHours === 2
          ? e.actualPrice2h
          : e.actualPrice4h ?? e.actualPrice2h ?? e.actualPrice1h;
      if (!base || !fact || e.direction === ForecastDirection.Unknown) continue;

      const atrPct = e.atrPercentAtForecast ?? 1.5;
      const sidewaysThreshold = Math.max(0.005, (atrPct / 100) * 0.5);
      const relChange = (fact - base) / base;
      const isCorrect =
        e.outcomeStatus === 'target_hit'
          ? true
          : e.outcomeStatus === 'stop_hit'
          ? false
          : e.direction === ForecastDirection.Up
          ? fact > base
          : e.direction === ForecastDirection.Down
          ? fact < base
          : Math.abs(relChange) <= sidewaysThreshold;

      const key = e.modelName.toLowerCase();
      const prev = stats.get(key) ?? { total: 0, correct: 0 };
      prev.total++;
      if (isCorrect) prev.correct++;
      stats.set(key, prev);
    }

    const out = new Map<string, { winRate: number; sampleSize: number }>();
    for (const [key, s] of stats.entries()) {
      out.set(key, {
        winRate: Number(((s.correct / s.total) * 100).toFixed(1)),
        sampleSize: s.total,
      });
    }
    return out;
  }

  public updateActualPrices(
    id: number,
    updates: {
      h1?: number | null;
      h2?: number | null;
      h4?: number | null;
      outcomeStatus?: ForecastOutcomeStatus | null;
      highDuringHorizon?: number | null;
      lowDuringHorizon?: number | null;
    }
  ): void {
    if (updates.h1 !== undefined) {
      this.db
        .prepare('UPDATE forecasts SET actual_price_1h = ? WHERE id = ?')
        .run(updates.h1, id);
    }
    if (updates.h2 !== undefined) {
      this.db
        .prepare('UPDATE forecasts SET actual_price_2h = ? WHERE id = ?')
        .run(updates.h2, id);
    }
    if (updates.h4 !== undefined) {
      this.db
        .prepare('UPDATE forecasts SET actual_price_4h = ? WHERE id = ?')
        .run(updates.h4, id);
    }
    if (updates.outcomeStatus !== undefined) {
      this.db
        .prepare('UPDATE forecasts SET outcome_status = ? WHERE id = ?')
        .run(updates.outcomeStatus, id);
    }
    if (updates.highDuringHorizon !== undefined) {
      this.db
        .prepare('UPDATE forecasts SET high_during_horizon = ? WHERE id = ?')
        .run(updates.highDuringHorizon, id);
    }
    if (updates.lowDuringHorizon !== undefined) {
      this.db
        .prepare('UPDATE forecasts SET low_during_horizon = ? WHERE id = ?')
        .run(updates.lowDuringHorizon, id);
    }
  }

  public deleteForecast(id: number): boolean {
    const info = this.db.prepare('DELETE FROM forecasts WHERE id = ?').run(id);
    return Number(info.changes) > 0;
  }
}

export const forecastDb = new ForecastDatabase();
