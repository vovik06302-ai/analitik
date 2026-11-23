import {
  ForecastDirection,
  ForecastResult,
  MarketSnapshot,
} from '../types';
import { Language } from '../i18n/translations';
import { formatCompactUsd, formatPrice, getDirectionLabel } from './forecast';

export type TradeAction = 'BUY_PEARL' | 'SELL_PEARL' | 'WAIT_HOLD_USDT';
export type SignalStrength = 'strong' | 'moderate' | 'preliminary' | 'neutral';
export type BasisStance = 'bullish' | 'bearish' | 'neutral';

export interface AnalysisBasisItem {
  id: 'ai_forecast' | 'risk_reward' | 'trend_ema' | 'momentum' | 'order_flow' | 'macro_news';
  label: string;
  stance: BasisStance;
  stanceLabel: string;
  metric: string;
  summary: string;
  weight: number;
}

export interface TradeSignalSummary {
  action: TradeAction;
  strength: SignalStrength;
  sourceMode: 'ai_and_market' | 'market_only';
  actionTitle: string;
  buyAsset: 'PEARL' | 'USDT';
  sellAsset: 'USDT' | 'PEARL' | null;
  buyHint: string;
  sellHint: string;
  actionSubtitle: string;
  strengthLabel: string;
  sourceLabel: string;
  referencePrice: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  riskRewardRatio: number | null;
  potentialMovePercent: number | null;
  confidence: number | null;
  horizonHours: number | null;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  basis: AnalysisBasisItem[];
  cautions: string[];
}

function getStanceLabel(stance: BasisStance, lang: Language): string {
  if (lang === 'en') {
    if (stance === 'bullish') return 'Buy PEARL';
    if (stance === 'bearish') return 'Sell PEARL';
    return 'Neutral';
  }
  if (stance === 'bullish') return 'Покупка PEARL';
  if (stance === 'bearish') return 'Продажа PEARL';
  return 'Нейтрально';
}

function computeRiskReward(
  refPrice: number | null,
  targetPrice: number | null,
  stopPrice: number | null,
  fallbackRr: number | null | undefined
): number | null {
  if (fallbackRr != null && Number.isFinite(fallbackRr) && fallbackRr > 0) {
    return fallbackRr;
  }
  if (refPrice && targetPrice != null && stopPrice != null) {
    const reward = Math.abs(targetPrice - refPrice);
    const risk = Math.abs(refPrice - stopPrice);
    if (reward > 0 && risk > 0) {
      return Number((reward / risk).toFixed(2));
    }
  }
  return null;
}

export function buildTradeSignal(
  forecast: ForecastResult | null,
  market: MarketSnapshot | null,
  lang: Language
): TradeSignalSummary | null {
  if (!forecast && !market) {
    return null;
  }

  const noData = lang === 'en' ? 'n/a' : 'нет данных';
  const refPrice = forecast?.priceNow ?? market?.priceUsd ?? null;
  const targetPrice = forecast?.targetPrice ?? null;
  const stopPrice = forecast?.stopPrice ?? null;
  const riskRewardRatio = computeRiskReward(
    refPrice,
    targetPrice,
    stopPrice,
    forecast?.riskRewardRatio
  );

  const potentialMovePercent =
    refPrice && refPrice > 0 && targetPrice != null
      ? Number((((targetPrice - refPrice) / refPrice) * 100).toFixed(2))
      : null;

  const basis: AnalysisBasisItem[] = [];
  const cautions: string[] = [];

  // 1. AI Forecast basis
  if (forecast) {
    const dirLabel = getDirectionLabel(forecast.direction, lang);
    const horizon = forecast.horizonHours ?? 4;
    const consensusText = forecast.consensus
      ? lang === 'en'
        ? ` · Council ${forecast.consensus.agreementPercent}%`
        : ` · Совет ${forecast.consensus.agreementPercent}%`
      : '';

    const aiStance: BasisStance =
      forecast.direction === ForecastDirection.Up
        ? 'bullish'
        : forecast.direction === ForecastDirection.Down
        ? 'bearish'
        : 'neutral';

    const aiWeight =
      aiStance === 'neutral'
        ? 0
        : (aiStance === 'bullish' ? 1 : -1) * (forecast.confidence >= 70 ? 2 : 1);

    const firstChartReason = forecast.chartReasons[0]?.trim();
    const aiSummary =
      firstChartReason ||
      (lang === 'en'
        ? `Model forecasts ${dirLabel} over ${horizon}h with ${forecast.confidence}% confidence.`
        : `Модель прогнозирует «${dirLabel}» на горизонте ${horizon}ч с уверенностью ${forecast.confidence}%.`);

    basis.push({
      id: 'ai_forecast',
      label: lang === 'en' ? 'AI Forecast' : 'ИИ-прогноз',
      stance: aiStance,
      stanceLabel: getStanceLabel(aiStance, lang),
      metric: `${dirLabel} · ${forecast.confidence}% · ${horizon}${lang === 'en' ? 'h' : 'ч'}${consensusText}`,
      summary: aiSummary,
      weight: aiWeight,
    });

    if (forecast.confidence < 55 && forecast.direction !== ForecastDirection.Sideways) {
      cautions.push(
        lang === 'en'
          ? `Low AI confidence (${forecast.confidence}% < 55%) — waiting in USDT is safer.`
          : `Низкая уверенность ИИ (${forecast.confidence}% < 55%) — безопаснее оставаться в USDT.`
      );
    }

    if (forecast.consensus?.hasDisagreement) {
      cautions.push(
        lang === 'en'
          ? `AI models disagree (${forecast.consensus.agreementPercent}% agreement).`
          : `Модели Совета ИИ расходятся (${forecast.consensus.agreementPercent}% согласия).`
      );
    }

    if (forecast.guardrailWarnings && forecast.guardrailWarnings.length > 0) {
      for (const warn of forecast.guardrailWarnings.slice(0, 2)) {
        cautions.push(warn);
      }
    }
  }

  // 2. Risk / Reward & Target/Stop levels basis
  if (forecast && (targetPrice != null || stopPrice != null)) {
    let rrStance: BasisStance = 'neutral';
    if (
      riskRewardRatio !== null &&
      riskRewardRatio >= 1.2 &&
      forecast.direction === ForecastDirection.Up
    ) {
      rrStance = 'bullish';
    } else if (
      riskRewardRatio !== null &&
      riskRewardRatio >= 1.2 &&
      forecast.direction === ForecastDirection.Down
    ) {
      rrStance = 'bearish';
    }

    const rrMetricParts: string[] = [];
    if (riskRewardRatio !== null) {
      rrMetricParts.push(`R:R ${riskRewardRatio}:1`);
    }
    if (potentialMovePercent !== null) {
      rrMetricParts.push(
        `${potentialMovePercent >= 0 ? '+' : ''}${potentialMovePercent.toFixed(2)}%`
      );
    }
    if (targetPrice != null) {
      rrMetricParts.push(
        `${lang === 'en' ? 'TP' : 'Цель'} $${formatPrice(targetPrice, noData)}`
      );
    }
    if (stopPrice != null) {
      rrMetricParts.push(
        `${lang === 'en' ? 'SL' : 'Стоп'} $${formatPrice(stopPrice, noData)}`
      );
    }

    let rrSummary: string;
    if (riskRewardRatio !== null && riskRewardRatio < 0.8) {
      rrSummary =
        lang === 'en'
          ? `Unfavorable risk/reward (${riskRewardRatio}:1 < 0.8) — entry is not justified.`
          : `Невыгодное соотношение прибыль/риск (${riskRewardRatio}:1 < 0.8) — вход не оправдан.`;
      cautions.push(
        lang === 'en'
          ? `Poor R:R ratio (${riskRewardRatio}:1) blocks active entry.`
          : `Низкий R:R (${riskRewardRatio}:1) — активная сделка заблокирована.`
      );
    } else if (riskRewardRatio !== null && riskRewardRatio >= 1.2) {
      rrSummary =
        lang === 'en'
          ? `Favorable risk/reward (${riskRewardRatio}:1) with clear target and stop levels.`
          : `Благоприятный R:R (${riskRewardRatio}:1) с чёткими уровнями цели и стопа.`;
    } else {
      rrSummary =
        lang === 'en'
          ? 'Target and stop levels are tight — wait for better entry near support/resistance.'
          : 'Диапазон цели и стопа узкий — лучше дождаться входа от ключевого уровня.';
    }

    basis.push({
      id: 'risk_reward',
      label: lang === 'en' ? 'Target & Stop (R:R)' : 'Цель / Стоп (R:R)',
      stance: rrStance,
      stanceLabel: getStanceLabel(rrStance, lang),
      metric: rrMetricParts.join(' · ') || noData,
      summary: rrSummary,
      weight: rrStance === 'bullish' ? 1 : rrStance === 'bearish' ? -1 : 0,
    });
  }

  // 3. Trend, EMAs & Multi-timeframe basis (from real server indicators)
  const ti = market?.technicalIndicators;
  if (ti) {
    let trendScore = 0;
    const metricParts: string[] = [];

    if (ti.ema9 !== null && ti.ema21 !== null) {
      if (ti.ema9 > ti.ema21) {
        trendScore += 1;
        metricParts.push('EMA9 > EMA21');
      } else if (ti.ema9 < ti.ema21) {
        trendScore -= 1;
        metricParts.push('EMA9 < EMA21');
      } else {
        metricParts.push('EMA9 ≈ EMA21');
      }
    }

    if (ti.vwap !== null && refPrice !== null) {
      if (refPrice > ti.vwap * 1.001) {
        trendScore += 1;
      } else if (refPrice < ti.vwap * 0.999) {
        trendScore -= 1;
      }
    }

    if (ti.structure === 'HH/HL') {
      trendScore += 1;
    } else if (ti.structure === 'LH/LL') {
      trendScore -= 1;
    }
    metricParts.push(ti.structure);

    const bullTfs = ti.multiTimeframe.filter((tf) => tf.trend === 'bullish').length;
    const bearTfs = ti.multiTimeframe.filter((tf) => tf.trend === 'bearish').length;
    if (ti.multiTimeframe.length > 0) {
      if (bullTfs > bearTfs) trendScore += 1;
      else if (bearTfs > bullTfs) trendScore -= 1;
      metricParts.push(
        lang === 'en'
          ? `MTF ${bullTfs}↑/${bearTfs}↓`
          : `ТФ ${bullTfs}↑/${bearTfs}↓`
      );
    }

    const trendStance: BasisStance =
      trendScore >= 2 ? 'bullish' : trendScore <= -2 ? 'bearish' : 'neutral';

    const trendSummary =
      trendStance === 'bullish'
        ? lang === 'en'
          ? 'Price structure and EMAs point upward across timeframes, supporting PEARL accumulation.'
          : 'Структура цены, EMA и таймфреймы направлены вверх — фон в пользу покупки PEARL.'
        : trendStance === 'bearish'
        ? lang === 'en'
          ? 'Downtrend across EMAs and market structure favors selling PEARL into USDT.'
          : 'Нисходящая структура и EMA указывают на давление продавцов — предпочтителен выход в USDT.'
        : lang === 'en'
        ? 'Timeframes and moving averages are mixed or ranging with no confirmed breakout.'
        : 'Таймфреймы и скользящие в боковике или разнонаправлены — подтверждённого тренда нет.';

    basis.push({
      id: 'trend_ema',
      label: lang === 'en' ? 'Trend & Timeframes' : 'Тренд и таймфреймы',
      stance: trendStance,
      stanceLabel: getStanceLabel(trendStance, lang),
      metric: metricParts.join(' · ') || noData,
      summary: trendSummary,
      weight: trendStance === 'bullish' ? 1 : trendStance === 'bearish' ? -1 : 0,
    });

    // 4. Momentum (RSI + MACD + Divergence)
    if (ti.rsi14 !== null || ti.macd.histogram !== null) {
      let momScore = 0;
      const momParts: string[] = [];

      if (ti.rsi14 !== null) {
        momParts.push(`RSI ${ti.rsi14.toFixed(1)}`);
        if (ti.rsi14 >= 53 && ti.rsi14 <= 70) momScore += 1;
        else if (ti.rsi14 <= 47 && ti.rsi14 >= 30) momScore -= 1;
        else if (ti.rsi14 > 72) {
          momScore -= 1;
          cautions.push(
            lang === 'en'
              ? `RSI(14) is overbought (${ti.rsi14.toFixed(1)}) — pullback risk when buying PEARL.`
              : `RSI(14) в зоне перекупленности (${ti.rsi14.toFixed(1)}) — риск отката при покупке PEARL.`
          );
        } else if (ti.rsi14 < 28) {
          momScore += 1;
        }
      }

      if (ti.macd.histogram !== null) {
        momParts.push(
          `MACD ${ti.macd.histogram >= 0 ? '+' : ''}${ti.macd.histogram.toFixed(5)}`
        );
        if (ti.macd.histogram > 0) momScore += 1;
        else if (ti.macd.histogram < 0) momScore -= 1;
      }

      if (ti.rsiDivergence === 'bullish') {
        momScore += 1;
        momParts.push(lang === 'en' ? 'Bull div' : 'Бычья див.');
      } else if (ti.rsiDivergence === 'bearish') {
        momScore -= 1;
        momParts.push(lang === 'en' ? 'Bear div' : 'Медвежья див.');
      }

      const momStance: BasisStance =
        momScore >= 1 ? 'bullish' : momScore <= -1 ? 'bearish' : 'neutral';

      const momSummary =
        momStance === 'bullish'
          ? lang === 'en'
            ? 'Positive momentum on RSI/MACD supports upward continuation for PEARL.'
            : 'Положительный импульс по RSI и MACD поддерживает сценарий роста PEARL.'
          : momStance === 'bearish'
          ? lang === 'en'
            ? 'Negative momentum signals selling pressure — favor holding USDT over PEARL.'
            : 'Отрицательный импульс указывает на слабость покупателей — лучше фиксировать PEARL в USDT.'
          : lang === 'en'
          ? 'Momentum oscillators are balanced near neutral territory.'
          : 'Осцилляторы импульса находятся в равновесии без перевеса сторон.';

      basis.push({
        id: 'momentum',
        label: lang === 'en' ? 'Momentum (RSI / MACD)' : 'Импульс (RSI / MACD)',
        stance: momStance,
        stanceLabel: getStanceLabel(momStance, lang),
        metric: momParts.join(' · ') || noData,
        summary: momSummary,
        weight: momStance === 'bullish' ? 1 : momStance === 'bearish' ? -1 : 0,
      });
    }
  }

  // 5. Order Book & Trade Flow (OBI + CVD)
  if (market?.orderBook || market?.tradeFlow) {
    let flowScore = 0;
    const flowParts: string[] = [];

    if (market.orderBook) {
      const band1 =
        market.orderBook.bands?.find((b) => b.rangePercent === 1) ??
        market.orderBook.bands?.[0];
      const totalTop = market.orderBook.bidVolume + market.orderBook.askVolume;
      const bidShare =
        band1?.bidSharePercent ??
        (totalTop > 0 ? Number(((market.orderBook.bidVolume / totalTop) * 100).toFixed(1)) : null);

      if (bidShare !== null) {
        flowParts.push(
          lang === 'en'
            ? `Bids ${Math.round(bidShare)}%`
            : `Биды ${Math.round(bidShare)}%`
        );
        if (bidShare >= 57) flowScore += 1;
        else if (bidShare <= 43) flowScore -= 1;
      }
    }

    if (market.tradeFlow) {
      const cvdSign = market.tradeFlow.cvd >= 0 ? '+' : '-';
      flowParts.push(
        `CVD ${cvdSign}${formatCompactUsd(Math.abs(market.tradeFlow.cvd), '$0')} (${Math.round(
          market.tradeFlow.buySharePercent
        )}%)`
      );
      if (market.tradeFlow.buySharePercent >= 56 && market.tradeFlow.cvd > 0) {
        flowScore += 1;
      } else if (market.tradeFlow.buySharePercent <= 44 && market.tradeFlow.cvd < 0) {
        flowScore -= 1;
      }
    }

    const flowStance: BasisStance =
      flowScore >= 1 ? 'bullish' : flowScore <= -1 ? 'bearish' : 'neutral';

    const flowSummary =
      flowStance === 'bullish'
        ? lang === 'en'
          ? 'Buy-side liquidity and market buy flow dominate order book depth.'
          : 'Покупатели доминируют в стакане и ленте сделок — спрос на PEARL выше предложения.'
        : flowStance === 'bearish'
        ? lang === 'en'
          ? 'Ask pressure and net market selling dominate recent order flow.'
          : 'Преобладают рыночные продажи и давление асков — поток направлен на выход из PEARL.'
        : lang === 'en'
        ? 'Order book bids/asks and recent trade flow are roughly balanced.'
        : 'Баланс заявок в стакане и поток сделок примерно равны.';

    basis.push({
      id: 'order_flow',
      label: lang === 'en' ? 'Order Book & Flow' : 'Стакан и поток (CVD)',
      stance: flowStance,
      stanceLabel: getStanceLabel(flowStance, lang),
      metric: flowParts.join(' · ') || noData,
      summary: flowSummary,
      weight: flowStance === 'bullish' ? 1 : flowStance === 'bearish' ? -1 : 0,
    });
  }

  // 6. Macro BTC/ETH & News Impact
  const btc = market?.macroContext?.btc ?? null;
  const eth = market?.macroContext?.eth ?? null;
  const newsImpactText = forecast?.newsImpact?.trim() ?? '';

  if (btc || eth || newsImpactText) {
    let macroScore = 0;
    const macroParts: string[] = [];

    if (btc) {
      const arrow = btc.trend1h === 'bullish' ? '↑' : btc.trend1h === 'bearish' ? '↓' : '→';
      const chg =
        btc.change1hPercent !== null
          ? ` ${btc.change1hPercent >= 0 ? '+' : ''}${btc.change1hPercent.toFixed(2)}%`
          : '';
      macroParts.push(`BTC ${arrow}${chg}`);
      if (btc.trend1h === 'bullish') macroScore += 1;
      else if (btc.trend1h === 'bearish') macroScore -= 1;
    }

    if (eth) {
      const arrow = eth.trend1h === 'bullish' ? '↑' : eth.trend1h === 'bearish' ? '↓' : '→';
      const chg =
        eth.change1hPercent !== null
          ? ` ${eth.change1hPercent >= 0 ? '+' : ''}${eth.change1hPercent.toFixed(2)}%`
          : '';
      macroParts.push(`ETH ${arrow}${chg}`);
      if (eth.trend1h === 'bullish') macroScore += 1;
      else if (eth.trend1h === 'bearish') macroScore -= 1;
    }

    const macroStance: BasisStance =
      macroScore >= 1 ? 'bullish' : macroScore <= -1 ? 'bearish' : 'neutral';

    const macroSummary =
      newsImpactText ||
      (macroStance === 'bullish'
        ? lang === 'en'
          ? 'Major crypto leaders (BTC/ETH) are trending higher, providing tailwinds for PEARL.'
          : 'Лидеры рынка (BTC/ETH) растут на 1ч — макро-фон поддерживает покупку PEARL.'
        : macroStance === 'bearish'
        ? lang === 'en'
          ? 'Weakness in BTC/ETH creates headwinds for altcoins — favor defensive USDT.'
          : 'Снижение BTC/ETH создаёт давление на альткоины — безопаснее удерживать USDT.'
        : lang === 'en'
        ? 'BTC and ETH are neutral over the past hour with no strong macro impulse.'
        : 'BTC и ETH торгуются нейтрально за последний час без сильного макро-импульса.');

    basis.push({
      id: 'macro_news',
      label: lang === 'en' ? 'Macro (BTC/ETH) & News' : 'Макро (BTC/ETH) и новости',
      stance: macroStance,
      stanceLabel: getStanceLabel(macroStance, lang),
      metric: macroParts.join(' · ') || (lang === 'en' ? 'News context' : 'Новостной фон'),
      summary: macroSummary,
      weight: macroStance === 'bullish' ? 1 : macroStance === 'bearish' ? -1 : 0,
    });
  }

  if (market?.spreadPercent !== null && (market?.spreadPercent ?? 0) >= 1.2) {
    cautions.push(
      lang === 'en'
        ? `Wide bid/ask spread (${market!.spreadPercent!.toFixed(2)}%) — use limit orders instead of market orders.`
        : `Повышенный спред (${market!.spreadPercent!.toFixed(2)}%) — используйте лимитные ордера вместо рыночных.`
    );
  }

  const bullishCount = basis.filter((b) => b.stance === 'bullish').length;
  const bearishCount = basis.filter((b) => b.stance === 'bearish').length;
  const neutralCount = basis.filter((b) => b.stance === 'neutral').length;

  const marketOnlyBasis = basis.filter((b) => b.id !== 'ai_forecast' && b.id !== 'risk_reward');
  const marketNetScore = marketOnlyBasis.reduce((acc, b) => acc + b.weight, 0);
  const marketBullCount = marketOnlyBasis.filter((b) => b.stance === 'bullish').length;
  const marketBearCount = marketOnlyBasis.filter((b) => b.stance === 'bearish').length;

  let action: TradeAction = 'WAIT_HOLD_USDT';
  let strength: SignalStrength = 'neutral';
  const sourceMode: 'ai_and_market' | 'market_only' = forecast ? 'ai_and_market' : 'market_only';

  if (forecast) {
    const blockedByConfidence = forecast.confidence < 55;
    const blockedByConsensus =
      Boolean(forecast.consensus?.hasDisagreement) &&
      (forecast.consensus?.agreementPercent ?? 100) < 60;
    const blockedByRr = riskRewardRatio !== null && riskRewardRatio < 0.8;

    if (
      forecast.direction === ForecastDirection.Sideways ||
      forecast.direction === ForecastDirection.Unknown ||
      blockedByConfidence ||
      blockedByConsensus ||
      blockedByRr
    ) {
      action = 'WAIT_HOLD_USDT';
      strength = 'neutral';
    } else if (forecast.direction === ForecastDirection.Up) {
      const strongMarketConflict =
        marketBearCount >= 3 && marketBullCount === 0 && forecast.confidence < 68;
      if (strongMarketConflict) {
        action = 'WAIT_HOLD_USDT';
        strength = 'neutral';
        cautions.push(
          lang === 'en'
            ? 'AI bullish forecast conflicts with bearish live indicators — wait for confirmation.'
            : 'Бычий прогноз ИИ расходится с медвежьими живыми индикаторами — дождитесь подтверждения.'
        );
      } else {
        action = 'BUY_PEARL';
        strength =
          forecast.confidence >= 72 &&
          marketNetScore >= 0 &&
          !forecast.consensus?.hasDisagreement
            ? 'strong'
            : 'moderate';
      }
    } else if (forecast.direction === ForecastDirection.Down) {
      const strongMarketConflict =
        marketBullCount >= 3 && marketBearCount === 0 && forecast.confidence < 68;
      if (strongMarketConflict) {
        action = 'WAIT_HOLD_USDT';
        strength = 'neutral';
        cautions.push(
          lang === 'en'
            ? 'AI bearish forecast conflicts with bullish live indicators — wait for confirmation.'
            : 'Медвежий прогноз ИИ расходится с бычьими живыми индикаторами — дождитесь подтверждения.'
        );
      } else {
        action = 'SELL_PEARL';
        strength =
          forecast.confidence >= 72 &&
          marketNetScore <= 0 &&
          !forecast.consensus?.hasDisagreement
            ? 'strong'
            : 'moderate';
      }
    }
  } else {
    // Market-only preliminary signal before user triggers AI analysis
    if (marketNetScore >= 2 && marketBullCount >= 2 && marketBullCount >= marketBearCount + 2) {
      action = 'BUY_PEARL';
      strength = 'preliminary';
    } else if (
      marketNetScore <= -2 &&
      marketBearCount >= 2 &&
      marketBearCount >= marketBullCount + 2
    ) {
      action = 'SELL_PEARL';
      strength = 'preliminary';
    } else {
      action = 'WAIT_HOLD_USDT';
      strength = 'neutral';
    }
  }

  const buyAsset: 'PEARL' | 'USDT' = action === 'BUY_PEARL' ? 'PEARL' : 'USDT';
  const sellAsset: 'USDT' | 'PEARL' | null =
    action === 'BUY_PEARL' ? 'USDT' : action === 'SELL_PEARL' ? 'PEARL' : null;

  const actionTitle =
    action === 'BUY_PEARL'
      ? lang === 'en'
        ? 'Buy PEARL (spend USDT)'
        : 'Покупать PEARL (за USDT)'
      : action === 'SELL_PEARL'
      ? lang === 'en'
        ? 'Sell PEARL → move to USDT'
        : 'Продавать PEARL → в USDT'
      : lang === 'en'
      ? 'Wait — Hold USDT'
      : 'Ожидать — держать USDT';

  const buyHint =
    action === 'BUY_PEARL'
      ? lang === 'en'
        ? 'Accumulate PEARL'
        : 'Покупать PEARL'
      : action === 'SELL_PEARL'
      ? lang === 'en'
        ? 'Move into USDT'
        : 'Переходить в USDT'
      : lang === 'en'
      ? 'Stay in USDT'
      : 'Держать USDT';

  const sellHint =
    action === 'BUY_PEARL'
      ? lang === 'en'
        ? 'Convert USDT → PEARL'
        : 'Менять USDT → PEARL'
      : action === 'SELL_PEARL'
      ? lang === 'en'
        ? 'Sell / Exit PEARL'
        : 'Продавать PEARL'
      : lang === 'en'
      ? 'No active trade'
      : 'Сделка не открывается';

  const actionSubtitle =
    action === 'BUY_PEARL'
      ? lang === 'en'
        ? 'Analysis grounds favor buying PEARL with USDT right now.'
        : 'Совокупность оснований указывает на покупку PEARL за USDT в данный момент.'
      : action === 'SELL_PEARL'
      ? lang === 'en'
        ? 'Analysis grounds favor selling PEARL and protecting capital in USDT.'
        : 'Совокупность оснований указывает на продажу PEARL и фиксацию в USDT.'
      : forecast
      ? lang === 'en'
        ? 'Signals are sideways, low-conviction, or conflicted — hold USDT until a cleaner setup appears.'
        : 'Боковик, нехватка уверенности или конфликт сигналов — держите USDT до подтверждения.'
      : lang === 'en'
      ? 'Live indicators are mixed. Keep USDT and run full AI analysis for chart & news confirmation.'
      : 'Живые индикаторы разнонаправлены. Держите USDT или запустите полный ИИ-анализ.';

  const strengthLabel =
    strength === 'strong'
      ? lang === 'en'
        ? 'High conviction'
        : 'Уверенный сигнал'
      : strength === 'moderate'
      ? lang === 'en'
        ? 'Moderate conviction'
        : 'Умеренный сигнал'
      : strength === 'preliminary'
      ? lang === 'en'
        ? 'Preliminary (market only)'
        : 'Предварительно (рынок)'
      : lang === 'en'
      ? 'No clear edge'
      : 'Ожидание сигнала';

  const sourceLabel =
    sourceMode === 'ai_and_market'
      ? lang === 'en'
        ? 'AI Forecast + Live Market'
        : 'ИИ-анализ + живой рынок'
      : lang === 'en'
      ? 'Live Market Telemetry (run AI to confirm)'
      : 'Живые индикаторы рынка (запустите ИИ для подтверждения)';

  return {
    action,
    strength,
    sourceMode,
    actionTitle,
    buyAsset,
    sellAsset,
    buyHint,
    sellHint,
    actionSubtitle,
    strengthLabel,
    sourceLabel,
    referencePrice: refPrice,
    targetPrice,
    stopPrice,
    riskRewardRatio,
    potentialMovePercent,
    confidence: forecast?.confidence ?? null,
    horizonHours: forecast?.horizonHours ?? null,
    bullishCount,
    bearishCount,
    neutralCount,
    basis,
    cautions,
  };
}
