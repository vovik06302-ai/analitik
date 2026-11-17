import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import {
  ConsensusSummary,
  ForecastDirection,
  ForecastHistoryEntry,
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
        actual_price_4h REAL NULL
      );
      CREATE INDEX IF NOT EXISTS idx_forecasts_created ON forecasts(created_at_utc);
    `);
  }

  public insertForecast(
    result: ForecastResult,
    newsSnapshot: NewsItem[],
    marketPrice: number | null
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
        news_snapshot_json, market_price_at_forecast, consensus_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      result.consensus ? JSON.stringify(result.consensus) : null
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
    };
  }

  public getAll(): ForecastHistoryEntry[] {
    const rows = this.db
      .prepare(`
        SELECT id, created_at_utc, price_now, direction, confidence, target_price, stop_price,
               support_text, resistance_text, chart_reasons, news_impact, news_reasons,
               risks, model_name, provider_name, response_time_ms, screenshot_data_url,
               news_snapshot_json, market_price_at_forecast, consensus_json,
               actual_price_1h, actual_price_2h, actual_price_4h
        FROM forecasts
        ORDER BY datetime(created_at_utc) DESC
        LIMIT 250
      `)
      .all() as Array<Record<string, any>>;

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
      };
    });
  }

  public updateActualPrices(
    id: number,
    updates: { h1?: number | null; h2?: number | null; h4?: number | null }
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
  }

  public deleteForecast(id: number): boolean {
    const info = this.db.prepare('DELETE FROM forecasts WHERE id = ?').run(id);
    return Number(info.changes) > 0;
  }
}

export const forecastDb = new ForecastDatabase();
