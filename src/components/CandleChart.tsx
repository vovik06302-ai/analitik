import React from 'react';
import { OhlcCandle } from '../types';

export interface ChartLevel {
  label: string;
  value: number;
  color: string;
}

interface CandleChartProps {
  candles: OhlcCandle[];
  levels: ChartLevel[];
  currentPrice: number | null;
  periodMinutes: number;
}

const WIDTH = 900;
const HEIGHT = 320;
const MARGIN_LEFT = 8;
const MARGIN_RIGHT = 74;
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 22;
const VOLUME_HEIGHT = 46;
const UP_COLOR = '#00D4AA';
const DOWN_COLOR = '#EF4444';

function formatAxisPrice(value: number): string {
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const CandleChart: React.FC<CandleChartProps> = ({
  candles,
  levels,
  currentPrice,
  periodMinutes,
}) => {
  const visible = candles.slice(-96);
  if (visible.length < 2) {
    return null;
  }

  const candleLow = Math.min(...visible.map((c) => c.low));
  const candleHigh = Math.max(...visible.map((c) => c.high));
  const span = Math.max(candleHigh - candleLow, candleHigh * 0.001);

  // Уровни показываем только если они не слишком далеко от графика.
  const shownLevels = levels.filter(
    (lvl) => lvl.value >= candleLow - span * 0.6 && lvl.value <= candleHigh + span * 0.6
  );
  const allValues = [candleLow, candleHigh, ...shownLevels.map((l) => l.value)];
  const minV = Math.min(...allValues) - span * 0.05;
  const maxV = Math.max(...allValues) + span * 0.05;

  const plotW = WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const plotBottom = HEIGHT - MARGIN_BOTTOM - VOLUME_HEIGHT;
  const plotH = plotBottom - MARGIN_TOP;
  const step = plotW / visible.length;
  const bodyW = Math.max(2, step * 0.62);

  const y = (value: number): number =>
    MARGIN_TOP + (1 - (value - minV) / (maxV - minV)) * plotH;

  const maxVolume = Math.max(...visible.map((c) => c.volume ?? 0), 0);
  const ticks = [0, 1, 2, 3, 4].map((i) => minV + ((maxV - minV) * i) / 4);
  const timeLabelIdx = [0, Math.floor(visible.length / 2), visible.length - 1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto block"
      role="img"
      aria-label={`PEARL/USDT ${periodMinutes}m`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={MARGIN_LEFT}
            x2={WIDTH - MARGIN_RIGHT}
            y1={y(tick)}
            y2={y(tick)}
            stroke="#25324D"
            strokeWidth={0.6}
          />
          <text x={WIDTH - MARGIN_RIGHT + 6} y={y(tick) + 3.5} fontSize={11} fill="#94A3B8">
            {formatAxisPrice(tick)}
          </text>
        </g>
      ))}

      {visible.map((c, i) => {
        const cx = MARGIN_LEFT + step * i + step / 2;
        const up = c.close >= c.open;
        const color = up ? UP_COLOR : DOWN_COLOR;
        const bodyTop = y(Math.max(c.open, c.close));
        const bodyH = Math.max(1, Math.abs(y(c.open) - y(c.close)));
        const volH = maxVolume > 0 && c.volume ? (c.volume / maxVolume) * (VOLUME_HEIGHT - 6) : 0;
        return (
          <g key={c.timestamp}>
            <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1} />
            <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
            {volH > 0 && (
              <rect
                x={cx - bodyW / 2}
                y={HEIGHT - MARGIN_BOTTOM - volH}
                width={bodyW}
                height={volH}
                fill={color}
                opacity={0.35}
              />
            )}
          </g>
        );
      })}

      {shownLevels.map((lvl, idx) => (
        <g key={`${lvl.label}-${idx}`}>
          <line
            x1={MARGIN_LEFT}
            x2={WIDTH - MARGIN_RIGHT}
            y1={y(lvl.value)}
            y2={y(lvl.value)}
            stroke={lvl.color}
            strokeWidth={1}
            strokeDasharray="5 4"
            opacity={0.85}
          />
          <text
            x={MARGIN_LEFT + 4}
            y={y(lvl.value) - 3}
            fontSize={10.5}
            fontWeight={600}
            fill={lvl.color}
          >
            {lvl.label} {formatAxisPrice(lvl.value)}
          </text>
        </g>
      ))}

      {currentPrice !== null && currentPrice >= minV && currentPrice <= maxV && (
        <g>
          <line
            x1={MARGIN_LEFT}
            x2={WIDTH - MARGIN_RIGHT}
            y1={y(currentPrice)}
            y2={y(currentPrice)}
            stroke="#E2E8F0"
            strokeWidth={0.8}
            strokeDasharray="2 3"
          />
          <rect
            x={WIDTH - MARGIN_RIGHT}
            y={y(currentPrice) - 9}
            width={MARGIN_RIGHT - 2}
            height={18}
            rx={3}
            fill="#E2E8F0"
          />
          <text
            x={WIDTH - MARGIN_RIGHT + 5}
            y={y(currentPrice) + 4}
            fontSize={11}
            fontWeight={700}
            fill="#0A0E17"
          >
            {formatAxisPrice(currentPrice)}
          </text>
        </g>
      )}

      {timeLabelIdx.map((idx) => (
        <text
          key={idx}
          x={MARGIN_LEFT + step * idx + step / 2}
          y={HEIGHT - 6}
          fontSize={11}
          fill="#94A3B8"
          textAnchor={idx === 0 ? 'start' : idx === visible.length - 1 ? 'end' : 'middle'}
        >
          {formatTime(visible[idx].timestamp)}
        </text>
      ))}
    </svg>
  );
};
