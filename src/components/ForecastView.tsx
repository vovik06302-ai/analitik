import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Eye,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import { ForecastDirection, ForecastResult, MarketSnapshot } from '../types';
import { Language, t } from '../i18n/translations';
import {
  formatCompactUsd,
  formatLocalDateTime,
  formatPrice,
  getDirectionColor,
  getDirectionLabel,
  getDirectionTint,
} from '../utils/forecast';

interface ForecastViewProps {
  lang: Language;
  forecast: ForecastResult | null;
  market: MarketSnapshot | null;
  isLoadingMarket: boolean;
  marketError: string;
  onRefreshMarket: () => void;
  screenshotDataUrl: string | null;
  screenshotLabel: string;
  screenshotCapturedAt: string | null;
  autoModeEnabled: boolean;
  autoIntervalMinutes: number;
  nextAutoRunTimeText: string;
  onOpenRegionModal: () => void;
  onImageFileDropped: (file: File) => void;
}

const DirectionArrowSvg: React.FC<{ direction: ForecastDirection; color: string }> = ({
  direction,
  color,
}) => {
  if (direction === ForecastDirection.Up) {
    return (
      <svg viewBox="0 0 24 24" className="w-12 h-12 animate-arrow-float" fill={color}>
        <path d="M 12,2 L 22,12 L 16,12 L 16,22 L 8,22 L 8,12 L 2,12 Z" />
      </svg>
    );
  }
  if (direction === ForecastDirection.Down) {
    return (
      <svg viewBox="0 0 24 24" className="w-12 h-12 animate-arrow-float" fill={color}>
        <path d="M 8,2 L 16,2 L 16,12 L 22,12 L 12,22 L 2,12 L 8,12 Z" />
      </svg>
    );
  }
  if (direction === ForecastDirection.Sideways) {
    return (
      <svg viewBox="0 0 24 24" className="w-12 h-12 animate-arrow-float" fill={color}>
        <path d="M 2,12 L 8,6 L 8,10 L 16,10 L 16,6 L 22,12 L 16,18 L 16,14 L 8,14 L 8,18 Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-12 h-12" fill={color}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
};

const OhlcSparkline: React.FC<{ market: MarketSnapshot }> = ({ market }) => {
  const geometry = useMemo(() => {
    const candles = market.ohlc;
    if (!candles || candles.length < 2) return null;

    const width = 260;
    const height = 58;
    const padY = 4;
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const minP = Math.min(...lows);
    const maxP = Math.max(...highs);
    const range = maxP - minP || minP * 0.01 || 0.0001;

    const toY = (p: number) =>
      padY + (1 - (p - minP) / range) * (height - padY * 2);

    const stepX = width / candles.length;
    const linePts = candles
      .map((c, idx) => `${(idx * stepX + stepX / 2).toFixed(1)},${toY(c.close).toFixed(1)}`)
      .join(' ');

    return { width, height, candles, stepX, toY, linePts };
  }, [market.ohlc]);

  if (!geometry) return null;

  const isUp = (market.priceChange24hPercent ?? 0) >= 0;
  const strokeColor = isUp ? '#22C55E' : '#EF4444';

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className="w-full h-[58px] overflow-visible"
      aria-label="PEARL 24h OHLC"
    >
      {geometry.candles.map((c, idx) => {
        const xCenter = idx * geometry.stepX + geometry.stepX / 2;
        const yHigh = geometry.toY(c.high);
        const yLow = geometry.toY(c.low);
        const yOpen = geometry.toY(c.open);
        const yClose = geometry.toY(c.close);
        const bull = c.close >= c.open;
        const color = bull ? '#22C55E' : '#EF4444';
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
        return (
          <g key={c.timestamp || idx} opacity={0.85}>
            <line
              x1={xCenter}
              y1={yHigh}
              x2={xCenter}
              y2={yLow}
              stroke={color}
              strokeWidth="1"
            />
            <rect
              x={xCenter - Math.max(1, geometry.stepX * 0.28)}
              y={bodyTop}
              width={Math.max(2, geometry.stepX * 0.56)}
              height={bodyHeight}
              fill={color}
              rx="0.5"
            />
          </g>
        );
      })}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.2"
        strokeOpacity="0.45"
        points={geometry.linePts}
      />
    </svg>
  );
};

export const ForecastView: React.FC<ForecastViewProps> = ({
  lang,
  forecast,
  market,
  isLoadingMarket,
  marketError,
  onRefreshMarket,
  screenshotDataUrl,
  screenshotLabel,
  screenshotCapturedAt,
  autoModeEnabled,
  autoIntervalMinutes,
  nextAutoRunTimeText,
  onOpenRegionModal,
  onImageFileDropped,
}) => {
  const noData = t(lang, 'NoData');
  const [showLevelsHud, setShowLevelsHud] = useState(true);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onImageFileDropped(file);
    }
  };

  // Compute normalized HUD overlay lines when forecast has numeric levels
  const hudLevels = useMemo(() => {
    if (!forecast || !showLevelsHud) return [];
    const items: Array<{ label: string; value: number; color: string }> = [];
    if (forecast.targetPrice !== null) {
      items.push({ label: t(lang, 'LabelTargetPrice'), value: forecast.targetPrice, color: '#22C55E' });
    }
    for (const r of forecast.resistance.slice(0, 2)) {
      items.push({ label: t(lang, 'LabelResistance'), value: r, color: '#F59E0B' });
    }
    const current = forecast.priceNow ?? market?.priceUsd ?? null;
    if (current !== null) {
      items.push({ label: t(lang, 'LabelCurrentPrice'), value: current, color: '#F1F5F9' });
    }
    for (const s of forecast.support.slice(0, 2)) {
      items.push({ label: t(lang, 'LabelSupport'), value: s, color: '#38BDF8' });
    }
    if (forecast.stopPrice !== null) {
      items.push({ label: t(lang, 'LabelStopPrice'), value: forecast.stopPrice, color: '#EF4444' });
    }
    if (items.length < 2) return [];

    const vals = items.map((i) => i.value);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = maxV - minV || maxV * 0.02 || 0.0001;

    return items.map((item) => {
      const pct = 12 + (1 - (item.value - minV) / span) * 76;
      return { ...item, topPct: Math.max(8, Math.min(90, pct)) };
    });
  }, [forecast, market?.priceUsd, showLevelsHud, lang]);

  return (
    <div className="space-y-3.5 pb-6">
      {/* Constant Financial Disclaimer */}
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-[10px] px-3.5 py-2.5 flex items-center gap-2.5">
        <AlertTriangle className="w-5 h-5 text-[#F87171] shrink-0" />
        <span className="text-[#FCA5A5] font-semibold text-[13px]">
          {t(lang, 'Disclaimer')}
        </span>
      </div>

      {/* Live PEARL/USDT Market Card */}
      <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 animate-card-enter">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#00D4AA]" />
            <h3 className="text-[14px] font-bold text-[#F1F5F9]">
              {t(lang, 'MarketLiveTitle')}
            </h3>
            {market && (
              <span className="bg-[#0E1420] border border-[#25324D] rounded-[6px] px-2 py-0.5 text-[11.5px] text-[#38BDF8]">
                {market.primaryExchange}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {market && (
              <span className="text-[11.5px] text-[#64748B]">
                {t(lang, 'LabelUpdated')}:{' '}
                {new Date(market.fetchedAtUtc).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}
            <button
              type="button"
              onClick={onRefreshMarket}
              disabled={isLoadingMarket}
              className="bg-[#1B263B] hover:bg-[#24334F] text-[#F1F5F9] border border-[#25324D] rounded-[8px] px-2.5 py-1 text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMarket ? 'animate-spin' : ''}`} />
              <span>{t(lang, 'MarketRefresh')}</span>
            </button>
          </div>
        </div>

        {marketError && !market ? (
          <div className="text-[12.5px] text-[#FCA5A5] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-[8px] px-3 py-2">
            {marketError}
          </div>
        ) : market ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-center">
              <div className="bg-[#0E1420] border border-[#25324D] rounded-[10px] p-3">
                <div className="text-[11px] text-[#94A3B8]">PEARL / USDT</div>
                <div className="text-[20px] font-bold text-[#F1F5F9] mt-0.5">
                  ${formatPrice(market.priceUsd, noData)}
                </div>
                {market.priceChange24hPercent !== null && (
                  <div
                    className={`text-[12px] font-semibold mt-0.5 ${
                      market.priceChange24hPercent >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                    }`}
                  >
                    {market.priceChange24hPercent >= 0 ? '+' : ''}
                    {market.priceChange24hPercent.toFixed(2)}% (24h)
                  </div>
                )}
              </div>

              <div className="bg-[#0E1420] border border-[#25324D] rounded-[10px] p-3">
                <div className="text-[11px] text-[#94A3B8]">{t(lang, 'MarketVolume24h')}</div>
                <div className="text-[16px] font-bold text-[#38BDF8] mt-0.5">
                  {formatCompactUsd(market.volume24hUsd, noData)}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  {t(lang, 'MarketSpread')}:{' '}
                  {market.spreadPercent !== null ? `${market.spreadPercent.toFixed(2)}%` : noData}
                </div>
              </div>

              <div className="bg-[#0E1420] border border-[#25324D] rounded-[10px] p-3">
                <div className="text-[11px] text-[#94A3B8]">{t(lang, 'MarketHighLow')}</div>
                <div className="text-[13px] font-semibold text-[#F1F5F9] mt-1">
                  {market.low24h !== null && market.high24h !== null
                    ? `$${formatPrice(market.low24h, noData)} — $${formatPrice(market.high24h, noData)}`
                    : noData}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  DEX Liq: {formatCompactUsd(market.dexLiquidityUsd, noData)}
                </div>
              </div>

              <div className="col-span-2 bg-[#0E1420] border border-[#25324D] rounded-[10px] px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-[#94A3B8] mb-1">
                  <span>{lang === 'en' ? '24h OHLC Candles (30m)' : 'Свечи OHLC 24ч (30м)'}</span>
                  <span>{market.ohlc.length} pts</span>
                </div>
                <OhlcSparkline market={market} />
              </div>
            </div>

            {/* Anomalies & Cross-Exchange Tickers */}
            {(market.anomalies.length > 0 || market.tickers.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {market.anomalies.map((anom, idx) => (
                  <span
                    key={idx}
                    className="bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#FBBF24] rounded-[8px] px-2.5 py-1 text-[11.5px] font-semibold inline-flex items-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{anom}</span>
                  </span>
                ))}
                {market.tickers.slice(0, 5).map((tk, idx) => (
                  <span
                    key={`${tk.exchange}-${idx}`}
                    className="bg-[#0E1420] border border-[#25324D] text-[#94A3B8] rounded-[8px] px-2.5 py-1 text-[11.5px]"
                  >
                    <strong className="text-[#F1F5F9]">{tk.exchange}</strong>: $
                    {formatPrice(tk.lastPrice, noData)}{' '}
                    <span className="text-[#64748B]">({formatCompactUsd(tk.volumeUsd24h, '-')})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[12.5px] text-[#64748B]">
            {lang === 'en' ? 'Loading live PEARL/USDT telemetry...' : 'Загрузка живых данных PEARL/USDT...'}
          </div>
        )}
      </div>

      {/* Empty State when no forecast has run yet */}
      {!forecast ? (
        <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-7 text-center animate-card-enter">
          <div className="w-14 h-14 rounded-full bg-[#00D4AA]/10 flex items-center justify-center mx-auto mb-3.5">
            <TrendingUp className="w-6 h-6 text-[#00D4AA]" />
          </div>
          <h2 className="text-[17px] font-bold text-[#F1F5F9]">
            {t(lang, 'EmptyForecastTitle')}
          </h2>
          <p className="text-[13.5px] text-[#94A3B8] mt-1.5 max-w-xl mx-auto">
            {t(lang, 'EmptyForecastSubtitle')}
          </p>
        </div>
      ) : (
        <>
          {/* Hero Forecast Card */}
          <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px] animate-card-enter">
            <div className="flex flex-col lg:flex-row lg:items-center gap-5">
              {/* Animated Direction Badge */}
              <div
                className="w-[112px] h-[112px] rounded-[22px] flex items-center justify-center relative shrink-0"
                style={{
                  backgroundColor: getDirectionTint(forecast.direction),
                  border: `1.5px solid ${getDirectionColor(forecast.direction)}`,
                }}
              >
                <div
                  className="absolute w-[86px] h-[86px] rounded-full animate-ring-pulse"
                  style={{ border: `1.2px solid ${getDirectionColor(forecast.direction)}` }}
                />
                <DirectionArrowSvg
                  direction={forecast.direction}
                  color={getDirectionColor(forecast.direction)}
                />
              </div>

              {/* Direction Title, Price, Confidence Bar */}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-[#94A3B8]">{t(lang, 'LabelDirection')}</div>
                <div className="flex flex-wrap items-center gap-5 mt-0.5 mb-2.5">
                  <span
                    className="text-[30px] font-bold leading-none"
                    style={{ color: getDirectionColor(forecast.direction) }}
                  >
                    {getDirectionLabel(forecast.direction, lang)}
                  </span>
                  <div>
                    <div className="text-[11px] text-[#94A3B8]">
                      {t(lang, 'LabelCurrentPrice')}
                    </div>
                    <div className="text-[18px] font-semibold text-[#F1F5F9]">
                      {formatPrice(forecast.priceNow, noData)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                  <span className="text-[#94A3B8]">{t(lang, 'LabelConfidence')}</span>
                  <span
                    className="text-[13.5px] font-bold"
                    style={{ color: getDirectionColor(forecast.direction) }}
                  >
                    {forecast.confidence}%
                  </span>
                </div>

                <div className="h-2.5 rounded-[5px] bg-[#0D131F] border border-[#25324D] overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 rounded-[5px]"
                    style={{
                      width: `${forecast.confidence}%`,
                      backgroundColor: getDirectionColor(forecast.direction),
                    }}
                  />
                </div>
              </div>

              {/* Meta Info Column */}
              <div className="lg:w-[230px] bg-[#0E1420] border border-[#25324D] rounded-[10px] p-3 shrink-0 space-y-2">
                <div>
                  <div className="text-[11px] text-[#64748B]">{t(lang, 'LabelModel')}</div>
                  <div className="text-[12.5px] font-semibold text-[#F1F5F9] truncate">
                    {forecast.providerName} / {forecast.modelName}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">
                    {t(lang, 'LabelResponseTime')}
                  </div>
                  <div className="text-[12.5px] font-semibold text-[#00D4AA]">
                    {(forecast.responseTimeMs / 1000).toFixed(1)} с ({forecast.responseTimeMs} мс)
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B]">{t(lang, 'LabelUpdated')}</div>
                  <div className="text-[12px] text-[#94A3B8]">
                    {formatLocalDateTime(forecast.createdAtUtc)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Model Consensus Breakdown Card */}
          {forecast.consensus && (
            <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 animate-card-enter">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#00D4AA]" />
                  <h3 className="text-[14px] font-bold text-[#F1F5F9]">
                    {t(lang, 'ConsensusHeader')}
                  </h3>
                  <span className="bg-[#00D4AA]/15 text-[#00D4AA] rounded-[6px] px-2 py-0.5 text-[11.5px] font-bold">
                    {forecast.consensus.agreementPercent}% ({forecast.consensus.totalSucceeded}/
                    {forecast.consensus.totalQueried})
                  </span>
                </div>

                {forecast.consensus.hasDisagreement && (
                  <span className="bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#FBBF24] rounded-[6px] px-2.5 py-0.5 text-[11.5px] font-semibold">
                    {t(lang, 'ConsensusDisagreement')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {forecast.consensus.votes.map((vote, i) => (
                  <div
                    key={`${vote.provider}-${i}`}
                    className="bg-[#0E1420] border border-[#25324D] rounded-[10px] p-3 text-[12px]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-[#F1F5F9] truncate">{vote.provider}</span>
                      {vote.error ? (
                        <span className="text-[#EF4444] font-semibold">Error</span>
                      ) : (
                        <span
                          className="font-bold"
                          style={{ color: getDirectionColor(vote.direction) }}
                        >
                          {getDirectionLabel(vote.direction, lang)} ({vote.confidence}%)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#64748B] truncate mb-1">{vote.model}</div>
                    {vote.error ? (
                      <div className="text-[11px] text-[#FCA5A5] truncate" title={vote.error}>
                        {vote.error}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                        <span>
                          {t(lang, 'LabelTargetPrice')}: {formatPrice(vote.targetPrice, noData)}
                        </span>
                        <span>{(vote.responseTimeMs / 1000).toFixed(1)}s</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Levels Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-card-enter">
            <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-3.5">
              <div className="text-[12px] text-[#94A3B8]">{t(lang, 'LabelTargetPrice')}</div>
              <div className="text-[17px] font-bold text-[#22C55E] mt-1 break-words">
                {formatPrice(forecast.targetPrice, noData)}
              </div>
            </div>
            <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-3.5">
              <div className="text-[12px] text-[#94A3B8]">{t(lang, 'LabelStopPrice')}</div>
              <div className="text-[17px] font-bold text-[#EF4444] mt-1 break-words">
                {formatPrice(forecast.stopPrice, noData)}
              </div>
            </div>
            <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-3.5">
              <div className="text-[12px] text-[#94A3B8]">{t(lang, 'LabelSupport')}</div>
              <div className="text-[14.5px] font-semibold text-[#38BDF8] mt-1 break-words">
                {forecast.support.length > 0
                  ? forecast.support.map((v) => formatPrice(v, noData)).join('  •  ')
                  : noData}
              </div>
            </div>
            <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-3.5">
              <div className="text-[12px] text-[#94A3B8]">{t(lang, 'LabelResistance')}</div>
              <div className="text-[14.5px] font-semibold text-[#F59E0B] mt-1 break-words">
                {forecast.resistance.length > 0
                  ? forecast.resistance.map((v) => formatPrice(v, noData)).join('  •  ')
                  : noData}
              </div>
            </div>
          </div>

          {/* Reasons & Risks 2-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 animate-card-enter">
            <div className="space-y-3.5">
              <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px]">
                <h3 className="text-[14.5px] font-semibold text-[#00D4AA] mb-2.5">
                  {t(lang, 'LabelChartReasons')}
                </h3>
                <ul className="space-y-1.5">
                  {(forecast.chartReasons.length > 0 ? forecast.chartReasons : [noData]).map(
                    (reason, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[13px] leading-[19px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] mt-2 shrink-0" />
                        <span className="text-[#F1F5F9]">{reason}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>

              <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px]">
                <h3 className="text-[14.5px] font-semibold text-[#F59E0B] mb-2.5">
                  {t(lang, 'LabelRisks')}
                </h3>
                <ul className="space-y-1.5">
                  {(forecast.risks.length > 0 ? forecast.risks : [noData]).map((risk, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] leading-[19px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] mt-2 shrink-0" />
                      <span className="text-[#F1F5F9]">{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px]">
              <h3 className="text-[14.5px] font-semibold text-[#38BDF8] mb-2">
                {t(lang, 'LabelNewsImpact')}
              </h3>
              <p className="text-[13.5px] leading-[20px] text-[#F1F5F9] mb-3.5">
                {forecast.newsImpact?.trim() || noData}
              </p>

              <h4 className="text-[13px] font-semibold text-[#94A3B8] mb-2">
                {t(lang, 'LabelNewsReasons')}
              </h4>
              <ul className="space-y-1.5">
                {(forecast.newsReasons.length > 0 ? forecast.newsReasons : [noData]).map(
                  (reason, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] leading-[19px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] mt-2 shrink-0" />
                      <span className="text-[#F1F5F9]">{reason}</span>
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>
        </>
      )}

      {/* Last Screenshot Preview Card + Visual Levels HUD Overlay */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-[18px] animate-card-enter"
      >
        <div className="flex flex-wrap items-center justify-between mb-2.5 gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[14.5px] font-semibold text-[#F1F5F9]">
              {t(lang, 'LabelLastScreenshot')}
            </span>
            {screenshotLabel && (
              <span className="text-[11.5px] text-[#94A3B8] bg-[#0E1420] border border-[#25324D] rounded-[6px] px-2 py-0.5">
                {screenshotLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            {forecast && screenshotDataUrl && (
              <button
                type="button"
                onClick={() => setShowLevelsHud((prev) => !prev)}
                className={`border rounded-[6px] px-2 py-0.5 inline-flex items-center gap-1 cursor-pointer transition-colors ${
                  showLevelsHud
                    ? 'bg-[#00D4AA]/15 border-[#00D4AA] text-[#00D4AA]'
                    : 'bg-[#0E1420] border-[#25324D] text-[#94A3B8]'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>{t(lang, 'HudToggleLabel')}</span>
              </button>
            )}
            <span className="bg-[#0E1420] border border-[#25324D] rounded-[6px] px-2 py-0.5 text-[#94A3B8]">
              {t(lang, 'LabelScreenshotTime')}:{' '}
              <strong className="text-[#F1F5F9]">
                {screenshotCapturedAt
                  ? formatLocalDateTime(screenshotCapturedAt)
                  : t(lang, 'ScreenshotNotTaken')}
              </strong>
            </span>
            <span className="bg-[#0E1420] border border-[#25324D] rounded-[6px] px-2 py-0.5 text-[#94A3B8]">
              {t(lang, 'LabelUpdatePeriod')}:{' '}
              <strong className="text-[#00D4AA]">
                {t(lang, 'EveryPrefix')} {autoIntervalMinutes} {t(lang, 'MinutesShort')}
              </strong>
              {autoModeEnabled && nextAutoRunTimeText ? (
                <span className="text-[#38BDF8]">
                  {' '}
                  • {t(lang, 'LabelNextCapture')}: {nextAutoRunTimeText}
                </span>
              ) : (
                <span className="text-[#64748B]"> • {t(lang, 'AutoStatusOff')}</span>
              )}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenRegionModal}
          className="relative w-full bg-[#0A0E17] border border-[#25324D] hover:border-[#384E75] rounded-[10px] min-h-[180px] max-h-[340px] flex items-center justify-center overflow-hidden cursor-pointer transition-colors"
        >
          {screenshotDataUrl ? (
            <>
              <img
                src={screenshotDataUrl}
                alt="PEARL/USDT Chart"
                className="max-h-[336px] w-auto object-contain"
              />
              {hudLevels.length > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  {hudLevels.map((lvl, idx) => (
                    <div
                      key={`${lvl.label}-${idx}`}
                      className="absolute left-0 right-0 flex items-center"
                      style={{ top: `${lvl.topPct}%` }}
                    >
                      <div
                        className="w-full border-t border-dashed opacity-75"
                        style={{ borderColor: lvl.color }}
                      />
                      <span
                        className="absolute right-2 -translate-y-1/2 bg-[#0A0E17]/90 border px-1.5 py-0.5 rounded text-[10.5px] font-semibold whitespace-nowrap"
                        style={{ borderColor: lvl.color, color: lvl.color }}
                      >
                        {lvl.label}: {formatPrice(lvl.value, noData)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
              <Upload className="w-6 h-6 text-[#64748B]" />
              <span className="text-[#64748B] text-[13px]">{t(lang, 'NoData')}</span>
              <span className="text-[#94A3B8] text-[12px]">
                {lang === 'en'
                  ? 'Click here to select screen region, upload chart image, or press Ctrl+V'
                  : 'Нажмите, чтобы выбрать область экрана, загрузить скриншот или вставьте через Ctrl+V'}
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
