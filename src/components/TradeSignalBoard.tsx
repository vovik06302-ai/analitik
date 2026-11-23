import React, { useMemo } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Play,
  Scale,
} from 'lucide-react';
import { ForecastResult, MarketSnapshot } from '../types';
import { Language, t } from '../i18n/translations';
import { formatPrice } from '../utils/forecast';
import {
  BasisStance,
  buildTradeSignal,
  TradeAction,
} from '../utils/tradeSignal';

interface TradeSignalBoardProps {
  lang: Language;
  forecast: ForecastResult | null;
  market: MarketSnapshot | null;
  isAnalyzing: boolean;
  onAnalyzeNow: () => void;
}

function getActionPalette(action: TradeAction): {
  text: string;
  surface: string;
  border: string;
  buyAccent: string;
  sellAccent: string;
} {
  if (action === 'BUY_PEARL') {
    return {
      text: '#22C55E',
      surface: 'rgba(34, 197, 94, 0.09)',
      border: 'rgba(34, 197, 94, 0.35)',
      buyAccent: '#22C55E',
      sellAccent: '#94A3B8',
    };
  }
  if (action === 'SELL_PEARL') {
    return {
      text: '#EF4444',
      surface: 'rgba(239, 68, 68, 0.09)',
      border: 'rgba(239, 68, 68, 0.35)',
      buyAccent: '#38BDF8',
      sellAccent: '#EF4444',
    };
  }
  return {
    text: '#F59E0B',
    surface: 'rgba(245, 158, 11, 0.09)',
    border: 'rgba(245, 158, 11, 0.35)',
    buyAccent: '#F59E0B',
    sellAccent: '#64748B',
  };
}

function getStanceColor(stance: BasisStance): string {
  if (stance === 'bullish') return '#22C55E';
  if (stance === 'bearish') return '#EF4444';
  return '#94A3B8';
}

export const TradeSignalBoard: React.FC<TradeSignalBoardProps> = ({
  lang,
  forecast,
  market,
  isAnalyzing,
  onAnalyzeNow,
}) => {
  const signal = useMemo(
    () => buildTradeSignal(forecast, market, lang),
    [forecast, market, lang]
  );

  const noData = t(lang, 'NoData');

  if (!signal) {
    return (
      <section
        aria-label={t(lang, 'TradeBoardTitle')}
        data-testid="trade-signal-board"
        data-action="LOADING"
        className="bg-[#151D2E] border border-[#25324D] rounded-[14px] p-4 animate-card-enter"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#00D4AA]" />
            <h2 className="text-[14px] font-bold text-[#F1F5F9]">
              {t(lang, 'TradeBoardTitle')}
            </h2>
          </div>
          <span className="text-[12px] text-[#64748B]">
            {t(lang, 'TradeBoardWaitingData')}
          </span>
        </div>
      </section>
    );
  }

  const palette = getActionPalette(signal.action);

  const ActionIcon =
    signal.action === 'BUY_PEARL'
      ? ArrowUpRight
      : signal.action === 'SELL_PEARL'
      ? ArrowDownRight
      : Minus;

  return (
    <section
      aria-label={t(lang, 'TradeBoardTitle')}
      data-testid="trade-signal-board"
      data-action={signal.action}
      data-source={signal.sourceMode}
      className="bg-[#151D2E] border border-[#25324D] rounded-[14px] overflow-hidden animate-card-enter"
    >
      {/* Board Header Bar */}
      <div className="px-4 py-3 border-b border-[#25324D] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Scale className="w-4 h-4 text-[#00D4AA] shrink-0" />
          <h2 className="text-[14px] font-bold text-[#F1F5F9]">
            {t(lang, 'TradeBoardTitle')}
          </h2>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-[12px] text-[#94A3B8]">{signal.sourceLabel}</span>
        </div>

        <div className="flex items-center gap-3 text-[12px] tabular-nums">
          <span className="text-[#22C55E] font-semibold">
            {signal.bullishCount} {t(lang, 'TradeBoardForBuy')}
          </span>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-[#94A3B8]">
            {signal.neutralCount} {t(lang, 'TradeBoardNeutralShort')}
          </span>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-[#EF4444] font-semibold">
            {signal.bearishCount} {t(lang, 'TradeBoardForSell')}
          </span>
        </div>
      </div>

      {/* Primary Buy / Sell Currency Decision Strip */}
      <div className="p-4 border-b border-[#25324D] grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">
        {/* Verdict Left */}
        <div className="xl:col-span-6 flex items-start gap-3.5 min-w-0">
          <div
            className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
            style={{
              backgroundColor: palette.surface,
              border: `1px solid ${palette.border}`,
            }}
          >
            <ActionIcon className="w-6 h-6" style={{ color: palette.text }} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#94A3B8]">
              <span className="font-semibold" style={{ color: palette.text }}>
                {signal.strengthLabel}
              </span>
              {signal.confidence !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {t(lang, 'LabelConfidence')}: <strong className="text-[#F1F5F9]">{signal.confidence}%</strong>
                  </span>
                </>
              )}
              {signal.horizonHours !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {t(lang, 'ForecastHorizonLabel')}: <strong className="text-[#F1F5F9]">{signal.horizonHours}{lang === 'en' ? 'h' : 'ч'}</strong>
                  </span>
                </>
              )}
            </div>

            <div
              className="text-[22px] sm:text-[24px] font-bold leading-tight mt-0.5 tracking-tight"
              style={{ color: palette.text }}
            >
              {signal.actionTitle}
            </div>

            <p className="text-[12.5px] text-[#CBD5E1] mt-1 leading-[18px]">
              {signal.actionSubtitle}
            </p>
          </div>
        </div>

        {/* Currency Action Readout Right */}
        <div className="xl:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Buy / Hold Currency Box */}
          <div
            className="rounded-[10px] px-3.5 py-2.5 bg-[#0E1420] border"
            style={{
              borderColor:
                signal.action === 'BUY_PEARL' ? 'rgba(34, 197, 94, 0.45)' : '#25324D',
            }}
          >
            <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#94A3B8]">
              <span>
                {signal.action === 'WAIT_HOLD_USDT'
                  ? t(lang, 'TradeBoardKeepCurrency')
                  : t(lang, 'TradeBoardBuyCurrency')}
              </span>
              <span className="font-mono tabular-nums text-[#64748B]">
                {signal.buyAsset === 'PEARL' && signal.referencePrice !== null
                  ? `$${formatPrice(signal.referencePrice, noData)}`
                  : '≈ $1.00'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span
                className="text-[20px] font-bold font-mono tabular-nums tracking-tight"
                style={{ color: palette.buyAccent }}
              >
                {signal.buyAsset}
              </span>
              <span className="text-[12px] text-[#CBD5E1] truncate">{signal.buyHint}</span>
            </div>
          </div>

          {/* Sell Currency Box */}
          <div
            className="rounded-[10px] px-3.5 py-2.5 bg-[#0E1420] border"
            style={{
              borderColor:
                signal.action === 'SELL_PEARL' ? 'rgba(239, 68, 68, 0.45)' : '#25324D',
            }}
          >
            <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#94A3B8]">
              <span>{t(lang, 'TradeBoardSellCurrency')}</span>
              {signal.riskRewardRatio !== null ? (
                <span className="font-mono tabular-nums text-[#00D4AA] font-semibold">
                  R:R {signal.riskRewardRatio}:1
                </span>
              ) : (
                <span className="font-mono tabular-nums text-[#64748B]">PEARL / USDT</span>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span
                className="text-[20px] font-bold font-mono tabular-nums tracking-tight"
                style={{ color: palette.sellAccent }}
              >
                {signal.sellAsset ?? '—'}
              </span>
              <span className="text-[12px] text-[#94A3B8] truncate">{signal.sellHint}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Grounds Breakdown Table */}
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-[12.5px] font-semibold text-[#94A3B8]">
            {t(lang, 'TradeBoardBasisHeading')}
          </h3>

          {signal.sourceMode === 'market_only' && (
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={onAnalyzeNow}
              className="bg-[#00D4AA]/15 hover:bg-[#00D4AA]/25 text-[#00D4AA] border border-[#00D4AA]/40 rounded-[8px] px-3 py-1 text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{t(lang, 'TradeBoardRunAiBtn')}</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-[#25324D]/70 border-t border-[#25324D]/70">
          {signal.basis.map((item) => {
            const color = getStanceColor(item.stance);
            const arrow =
              item.stance === 'bullish' ? '↑' : item.stance === 'bearish' ? '↓' : '→';
            return (
              <div
                key={item.id}
                className="py-2.5 grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-1 items-baseline text-[12.5px]"
              >
                <div className="md:col-span-3 font-semibold text-[#F1F5F9]">
                  {item.label}
                </div>
                <div
                  className="md:col-span-2 font-semibold whitespace-nowrap"
                  style={{ color }}
                >
                  <span aria-hidden="true" className="mr-1">
                    {arrow}
                  </span>
                  {item.stanceLabel}
                </div>
                <div className="md:col-span-3 font-mono tabular-nums text-[12px] text-[#CBD5E1] break-words">
                  {item.metric}
                </div>
                <div className="md:col-span-4 text-[#94A3B8] leading-[18px]">
                  {item.summary}
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Cautions / Guardrails */}
        {signal.cautions.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-[#25324D]/70 flex flex-col gap-1.5">
            {signal.cautions.map((caution, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-[12px] text-[#FCD34D] leading-[17px]"
              >
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#F59E0B]" />
                <span>{caution}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
