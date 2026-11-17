import { NewsItem, NewsRelevance, NewsSentiment } from '../src/types';

const DIRECT_PEARL_TERMS = [
  'pearl',
  'prl',
  'safetrade',
  'pearl research',
  'pearlresearch',
  'wprl',
];

const BULLISH_WORDS = [
  'surge',
  'rally',
  'soar',
  'jump',
  'gain',
  'bull',
  'bullish',
  'breakout',
  'partnership',
  'launch',
  'upgrade',
  'adoption',
  'listing',
  'listed',
  'record',
  'high',
  'growth',
  'inflow',
  'approve',
  'approval',
  'рост',
  'ралли',
  'пробой',
  'листинг',
  'партнёрство',
  'запуск',
];

const BEARISH_WORDS = [
  'crash',
  'plunge',
  'drop',
  'fall',
  'bear',
  'bearish',
  'hack',
  'hacked',
  'exploit',
  'ban',
  'lawsuit',
  'sec',
  'probe',
  'warning',
  'delist',
  'selloff',
  'sell-off',
  'outflow',
  'liquidat',
  'attack',
  'risk',
  'падение',
  'обвал',
  'взлом',
  'делистинг',
  'запрет',
  'иск',
];

export function scoreNewsItems(items: NewsItem[]): NewsItem[] {
  return items.map((item) => {
    const haystack = `${item.title} ${item.matchedQuery} ${item.source}`.toLowerCase();

    const isDirect = DIRECT_PEARL_TERMS.some((term) => haystack.includes(term));
    const relevance: NewsRelevance = isDirect ? 'DirectPearl' : 'CryptoMarket';

    let bullScore = 0;
    let bearScore = 0;
    for (const w of BULLISH_WORDS) {
      if (haystack.includes(w)) bullScore++;
    }
    for (const w of BEARISH_WORDS) {
      if (haystack.includes(w)) bearScore++;
    }

    let sentiment: NewsSentiment = 'Neutral';
    if (bullScore > bearScore) sentiment = 'Bullish';
    else if (bearScore > bullScore) sentiment = 'Bearish';

    const ageHours = item.publishedAt
      ? Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000)
      : 72;

    const recencyScore = Math.max(0, 50 - ageHours);
    const relevanceScore = Math.round(
      (isDirect ? 50 : 15) + Math.min(35, recencyScore) + (bullScore + bearScore) * 4
    );

    return {
      ...item,
      relevance,
      sentiment,
      relevanceScore: Math.min(100, relevanceScore),
    };
  });
}
