import { NewsItem, NewsRelevance, NewsSentiment } from '../src/types';

const DIRECT_PEARL_TERMS = [
  'pearl',
  'prl',
  'safetrade',
  'pearl research',
  'pearlresearch',
  'wprl',
];

const CRYPTO_CONTEXT_TERMS = [
  'crypto',
  'token',
  'coin',
  'usdt',
  'exchange',
  'safetrade',
  'near',
  'defi',
  'dex',
  'blockchain',
  'trading',
  'price',
  'market',
  'listing',
  'wallet',
  'gate.io',
  'kraken',
  'coinbase',
  'prl',
  'wprl',
  'крипт',
  'токен',
  'бирж',
  'курс',
  'листинг',
];

const NOISE_BLACKLIST_PATTERNS = [
  /\bpearl\s+harbor\b/i,
  /\bpearl\s+jam\b/i,
  /\bblack\s+pearl\b/i,
  /\bpearl\s+(necklace|earrings|jewelry|bracelet|oyster|oysters|milk\s+tea|barley|river|district)\b/i,
  /\bmother\s+of\s+pearl\b/i,
];

const BULLISH_WORDS = [
  'surge',
  'surges',
  'rally',
  'rallies',
  'soar',
  'soars',
  'jump',
  'jumps',
  'gain',
  'gains',
  'bull',
  'bullish',
  'breakout',
  'partnership',
  'launch',
  'launches',
  'upgrade',
  'adoption',
  'listing',
  'listed',
  'record',
  'growth',
  'inflow',
  'inflows',
  'approve',
  'approved',
  'approval',
  'rebound',
  'outperform',
  'рост',
  'ралли',
  'пробой',
  'листинг',
  'партнёрство',
  'партнерство',
  'запуск',
  'одобрен',
  'приток',
];

const BEARISH_WORDS = [
  'crash',
  'crashes',
  'plunge',
  'plunges',
  'drop',
  'drops',
  'fall',
  'falls',
  'bear',
  'bearish',
  'hack',
  'hacked',
  'exploit',
  'exploited',
  'ban',
  'banned',
  'lawsuit',
  'probe',
  'warning',
  'delist',
  'delisted',
  'delisting',
  'selloff',
  'sell-off',
  'outflow',
  'outflows',
  'liquidated',
  'liquidation',
  'liquidations',
  'attack',
  'slump',
  'tumble',
  'падение',
  'обвал',
  'взлом',
  'делистинг',
  'запрет',
  'иск',
  'отток',
  'ликвидац',
];

const NEGATION_PATTERN = /\b(no|not|never|without|fails?\s+to|avoids?|denies?|не|без|нет)\s+$/i;

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWordMatch(text: string, word: string): { matched: boolean; negated: boolean } {
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
  const m = pattern.exec(text);
  if (!m) return { matched: false, negated: false };
  const idx = m.index + (m[1]?.length ?? 0);
  const before = text.slice(Math.max(0, idx - 22), idx);
  return {
    matched: true,
    negated: NEGATION_PATTERN.test(before),
  };
}

export function isNonCryptoPearlNoise(item: NewsItem): boolean {
  const titleLower = item.title.toLowerCase();
  if (NOISE_BLACKLIST_PATTERNS.some((re) => re.test(titleLower))) {
    return true;
  }
  // If fetched from a bare "Pearl" keyword query, require at least one crypto/exchange cue
  if (
    item.matchedQuery &&
    item.matchedQuery !== 'RSS' &&
    /\bpearl\b/i.test(item.matchedQuery)
  ) {
    const combined = `${item.title} ${item.source}`.toLowerCase();
    const hasCryptoCue = CRYPTO_CONTEXT_TERMS.some((term) => combined.includes(term));
    if (!hasCryptoCue) return true;
  }
  return false;
}

export function buildCryptoNewsQuery(keyword: string): string {
  const kw = keyword.trim();
  if (!kw) return '';
  const lower = kw.toLowerCase();
  const alreadyScoped =
    lower.includes('usdt') ||
    lower.includes('safetrade') ||
    lower.includes('crypto') ||
    lower.includes('token') ||
    lower.includes('near');
  if (alreadyScoped) {
    return `"${kw}"`;
  }
  return `"${kw}" (crypto OR token OR USDT OR exchange OR NEAR)`;
}

export function scoreNewsItems(items: NewsItem[]): NewsItem[] {
  const filtered = items.filter((item) => !isNonCryptoPearlNoise(item));

  return filtered.map((item) => {
    const haystack = `${item.title} ${item.matchedQuery} ${item.source}`.toLowerCase();

    const isDirect = DIRECT_PEARL_TERMS.some((term) => hasWordMatch(haystack, term).matched);
    const relevance: NewsRelevance = isDirect ? 'DirectPearl' : 'CryptoMarket';

    let bullScore = 0;
    let bearScore = 0;
    for (const w of BULLISH_WORDS) {
      const m = hasWordMatch(item.title, w);
      if (m.matched) {
        if (m.negated) bearScore += 0.5;
        else bullScore += 1;
      }
    }
    for (const w of BEARISH_WORDS) {
      const m = hasWordMatch(item.title, w);
      if (m.matched) {
        if (m.negated) bullScore += 0.5;
        else bearScore += 1;
      }
    }

    let sentiment: NewsSentiment = 'Neutral';
    if (bullScore > bearScore) sentiment = 'Bullish';
    else if (bearScore > bullScore) sentiment = 'Bearish';

    const ageHours = item.publishedAt
      ? Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000)
      : 72;

    const recencyScore = Math.max(0, 40 - ageHours * 0.6);
    const relevanceScore = Math.round(
      (isDirect ? 55 : 15) + Math.min(35, recencyScore) + (bullScore + bearScore) * 4
    );

    return {
      ...item,
      relevance,
      sentiment,
      relevanceScore: Math.min(100, relevanceScore),
    };
  });
}

/**
 * Scores first, guarantees up to `directQuota` DirectPearl items so general
 * high-frequency RSS feeds never crowd out PEARL / SafeTrade news.
 */
export function prioritizeAndSelectNews(
  rawItems: NewsItem[],
  maxTotal = 40,
  directQuota = 15
): NewsItem[] {
  const scored = scoreNewsItems(rawItems);

  const byTimeDesc = (a: NewsItem, b: NewsItem): number => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
  };

  const direct = scored
    .filter((i) => i.relevance === 'DirectPearl')
    .sort((a, b) => {
      const scoreDiff = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
      if (Math.abs(scoreDiff) >= 12) return scoreDiff;
      return byTimeDesc(a, b);
    })
    .slice(0, directQuota);

  const market = scored
    .filter((i) => i.relevance !== 'DirectPearl')
    .sort(byTimeDesc)
    .slice(0, Math.max(0, maxTotal - direct.length));

  return [...direct, ...market].slice(0, maxTotal);
}
