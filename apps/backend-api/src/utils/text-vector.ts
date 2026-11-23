// SPDX-License-Identifier: Apache-2.0

/**
 * Chuẩn hóa chuỗi tiếng Việt GIỮ NGUYÊN DẤU (NFC + chữ thường + gọn khoảng trắng).
 * Giúp phân biệt chính xác các cặp từ khác nghĩa như "muốn" vs "mượn", "kỷ" vs "ký", "đang" vs "đăng".
 */
export function normalizeKeepDiacritics(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chuẩn hóa bỏ dấu tiếng Việt (NFD strip + đ -> d) chỉ dùng có kiểm soát cho cụm nhiều từ hoặc từ không đồng âm.
 */
export function stripVietnameseDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeDiacriticAware(
  input: string,
  stopwords: ReadonlySet<string>
): string[] {
  const normalized = normalizeKeepDiacritics(input);
  if (!normalized) return [];
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !stopwords.has(token));
}

export function tokenizeAccentlessSafe(
  input: string,
  ambiguousStopwords: ReadonlySet<string>
): string[] {
  const normalized = stripVietnameseDiacritics(input);
  if (!normalized) return [];
  return normalized
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !ambiguousStopwords.has(token));
}

export function extractBigrams(tokens: readonly string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

const NON_WORD_UNICODE_RE = /[^\p{L}\p{N}]+/gu;
const NON_WORD_ASCII_RE = /[^a-z0-9]+/g;

export function toPaddedDiacriticTokens(input: string): string {
  const clean = normalizeKeepDiacritics(input)
    .replace(NON_WORD_UNICODE_RE, ' ')
    .trim();
  return clean ? ` ${clean} ` : ' ';
}

export function toPaddedAsciiTokens(input: string): string {
  const clean = stripVietnameseDiacritics(input)
    .replace(NON_WORD_ASCII_RE, ' ')
    .trim();
  return clean ? ` ${clean} ` : ' ';
}

const phraseTokenCache = new Map<
  string,
  { diaNeedle: string; asciiNeedle: string | null }
>();

function getPhraseNeedles(phrase: string): {
  diaNeedle: string;
  asciiNeedle: string | null;
} {
  const cached = phraseTokenCache.get(phrase);
  if (cached) return cached;

  const cleanDia = normalizeKeepDiacritics(phrase)
    .replace(NON_WORD_UNICODE_RE, ' ')
    .trim();
  const diaNeedle = cleanDia ? ` ${cleanDia} ` : '';

  let asciiNeedle: string | null = null;
  if (cleanDia.includes(' ')) {
    const cleanAscii = stripVietnameseDiacritics(phrase)
      .replace(NON_WORD_ASCII_RE, ' ')
      .trim();
    asciiNeedle = cleanAscii ? ` ${cleanAscii} ` : null;
  }

  const entry = { diaNeedle, asciiNeedle };
  phraseTokenCache.set(phrase, entry);
  return entry;
}

/**
 * Kiểm tra chuỗi văn bản có chứa cụm từ mục tiêu đúng ranh giới từ hay không (không dùng RegExp động, < 0.05ms).
 * - Cụm 1 từ: bắt buộc khớp đúng ranh giới từ GIỮ DẤU (không để "muốn" khớp "mượn").
 * - Cụm >= 2 từ: khớp giữ dấu trước; nếu người dùng gõ không dấu toàn câu thì cho phép khớp bỏ dấu theo cụm từ.
 */
export function matchesVietnamesePhrase(
  diacriticText: string,
  accentlessText: string,
  phrase: string
): boolean {
  if (!phrase || !phrase.trim()) return false;
  const { diaNeedle, asciiNeedle } = getPhraseNeedles(phrase);
  if (!diaNeedle) return false;

  const paddedDia =
    diacriticText.startsWith(' ') && diacriticText.endsWith(' ')
      ? diacriticText
      : toPaddedDiacriticTokens(diacriticText);
  if (paddedDia.includes(diaNeedle)) {
    return true;
  }

  if (asciiNeedle) {
    const paddedAscii =
      accentlessText.startsWith(' ') && accentlessText.endsWith(' ')
        ? accentlessText
        : toPaddedAsciiTokens(accentlessText);
    return paddedAscii.includes(asciiNeedle);
  }
  return false;
}

export function hasVietnameseDiacritics(input: string): boolean {
  const normalized = normalizeKeepDiacritics(input);
  return stripVietnameseDiacritics(normalized) !== normalized;
}

export interface VietnameseMatchScore {
  score: number;
  overlap: number;
  phrase_hit: boolean;
  query_tokens: number;
}

/**
 * So khớp từ khóa tiếng Việt không dùng băm/vector:
 * - Câu hỏi có dấu: so khớp token giữ dấu (tránh "muốn" khớp "mượn").
 * - Câu hỏi gõ không dấu: so khớp token bỏ dấu có kiểm soát.
 * - Điểm = 65% độ phủ token + 35% độ phủ bigram + thưởng cụm từ xuất hiện nguyên vẹn.
 */
export function scoreVietnameseRelevance(
  query: string,
  doc: string,
  options: {
    diacriticStopwords: ReadonlySet<string>;
    accentlessStopwords: ReadonlySet<string>;
  }
): VietnameseMatchScore {
  const queryNorm = normalizeKeepDiacritics(query);
  const docNorm = normalizeKeepDiacritics(doc);
  if (!queryNorm || !docNorm) {
    return { score: 0, overlap: 0, phrase_hit: false, query_tokens: 0 };
  }

  const strictDiacritics = hasVietnameseDiacritics(queryNorm);
  const tokenize = (text: string): string[] =>
    strictDiacritics
      ? tokenizeDiacriticAware(text, options.diacriticStopwords)
      : tokenizeAccentlessSafe(text, options.accentlessStopwords);

  const queryTokens = tokenize(queryNorm);
  const queryTokenSet = new Set(queryTokens);
  if (queryTokenSet.size === 0) {
    return { score: 0, overlap: 0, phrase_hit: false, query_tokens: 0 };
  }

  const docTokens = tokenize(docNorm);
  const docTokenSet = new Set(docTokens);
  let overlap = 0;
  for (const token of queryTokenSet) {
    if (docTokenSet.has(token)) overlap += 1;
  }

  const queryBigrams = Array.from(new Set(extractBigrams(queryTokens)));
  const docBigramSet = new Set(extractBigrams(docTokens));
  let bigramOverlap = 0;
  for (const bigram of queryBigrams) {
    if (docBigramSet.has(bigram)) bigramOverlap += 1;
  }

  const tokenScore = Math.min(
    1,
    overlap / Math.max(1, Math.min(queryTokenSet.size, 4))
  );
  const bigramScore =
    queryBigrams.length > 0
      ? Math.min(1, bigramOverlap / Math.max(1, Math.min(queryBigrams.length, 3)))
      : 0;

  const paddedQuery = toPaddedDiacriticTokens(query);
  const paddedDoc = toPaddedDiacriticTokens(doc);
  const phraseHit =
    queryTokenSet.size >= 2 &&
    paddedQuery.trim().length >= 6 &&
    paddedDoc.includes(paddedQuery);

  const score = Math.min(
    1,
    0.65 * tokenScore + 0.35 * bigramScore + (phraseHit ? 0.15 : 0)
  );

  return {
    score: Number(score.toFixed(4)),
    overlap,
    phrase_hit: phraseHit,
    query_tokens: queryTokenSet.size,
  };
}

export interface WeightedRequestFields {
  title: string;
  category_name?: string | null;
  description?: string | null;
  review_note?: string | null;
  created_by?: string | null;
  sender_group?: string | null;
  target_department?: string | null;
}

export interface FieldMatchResult {
  score: number;
  exact_phrase_field: string | null;
  matched_field: string | null;
}

const SEARCH_LEAD_IN_PATTERNS: RegExp[] = [
  /^(?:hãy\s+|vui lòng\s+|giúp (?:tôi|em|mình)\s+)?(?:tìm(?: kiếm)?|tra cứu|liệt kê|kiểm tra|cho (?:tôi|em|mình) xem|xem|lọc)\s+/iu,
  /^(?:các\s+|những\s+|tất cả\s+)?(?:hồ sơ|yêu cầu|đơn)\s+(?:có\s+(?:chữ|từ|tiêu đề|nội dung)\s+|liên quan(?:\s+đến|\s+tới)?\s+|về\s+|chứa\s+)?/iu,
  /^(?:có\s+(?:chữ|từ|tiêu đề|nội dung)\s+|liên quan(?:\s+đến|\s+tới)?\s+|về\s+|chứa\s+)/iu,
];

const SEARCH_LEAD_IN_ASCII_PATTERNS: RegExp[] = [
  /^(?:hay\s+|vui long\s+|giup (?:toi|em|minh)\s+)?(?:tim(?: kiem)?|tra cuu|liet ke|kiem tra|cho (?:toi|em|minh) xem|xem|loc)\s+/i,
  /^(?:cac\s+|nhung\s+|tat ca\s+)?(?:ho so|yeu cau|don)\s+(?:co\s+(?:chu|tu|tieu de|noi dung)\s+|lien quan(?:\s+den|\s+toi)?\s+|ve\s+|chua\s+)?/i,
  /^(?:co\s+(?:chu|tu|tieu de|noi dung)\s+|lien quan(?:\s+den|\s+toi)?\s+|ve\s+|chua\s+)/i,
];

const SEARCH_TRAILING_PATTERNS: RegExp[] = [
  /\s+(?:của (?:tôi|em|mình)|trong ban(?: mình)?|trong phòng(?: ban)?|giúp (?:tôi|em|mình)|với|nhé|nha|ạ|\?)+$/iu,
  /\s+(?:đã duyệt chưa|được duyệt chưa|duyệt chưa|chưa duyệt|đang chờ duyệt|chờ duyệt|đã duyệt|bị từ chối|từ chối|quá hạn sla|quá hạn)$/iu,
];

const SEARCH_TRAILING_ASCII_PATTERNS: RegExp[] = [
  /\s+(?:cua (?:toi|em|minh)|trong ban(?: minh)?|trong phong(?: ban)?|giup (?:toi|em|minh)|voi|nhe|nha|a|\?)+$/i,
  /\s+(?:da duyet chua|duoc duyet chua|duyet chua|chua duyet|dang cho duyet|cho duyet|da duyet|bi tu choi|tu choi|qua han sla|qua han)$/i,
];

/**
 * Trích cụm chữ nội dung gốc người dùng gửi trong câu hỏi tìm kiếm
 * (bảo toàn nguyên cụm chữ có dấu như "giấy khen", "hóa đơn học phí", "máy chiếu B201").
 */
export function extractSearchKeywordFromQuestion(
  question: string,
  excludeTerms: readonly string[] = []
): string {
  const quoted = question.match(/["“”'‘’]([^"“”'‘’]{2,120})["“”'‘’]/);
  if (quoted && quoted[1]?.trim()) {
    return normalizeKeepDiacritics(quoted[1]);
  }

  let cleaned = normalizeKeepDiacritics(question)
    .replace(/[?!.,;:()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const term of excludeTerms) {
    const cleanTerm = normalizeKeepDiacritics(term);
    if (!cleanTerm || cleanTerm.length < 2) continue;
    const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'giu'), ' ');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  const isAccentless = !hasVietnameseDiacritics(cleaned);
  const leadPatterns = isAccentless
    ? [...SEARCH_LEAD_IN_PATTERNS, ...SEARCH_LEAD_IN_ASCII_PATTERNS]
    : SEARCH_LEAD_IN_PATTERNS;
  const trailPatterns = isAccentless
    ? [...SEARCH_TRAILING_PATTERNS, ...SEARCH_TRAILING_ASCII_PATTERNS]
    : SEARCH_TRAILING_PATTERNS;

  for (let pass = 0; pass < 2; pass += 1) {
    for (const pattern of leadPatterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
    for (const pattern of trailPatterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * So khớp có trọng số theo từng trường dữ liệu gốc (không dùng chữ nhân tạo hay hash vector):
 * - Ưu tiên cao nhất: khớp nguyên cụm chữ người dùng gửi trên từng trường (title > category > sender > description > review_note).
 * - Tiếp theo: so khớp từ khóa + bigram giữ dấu tiếng Việt (tránh "muốn" khớp "mượn").
 */
export function scoreRequestByFields(
  query: string,
  fields: WeightedRequestFields,
  options: {
    diacriticStopwords: ReadonlySet<string>;
    accentlessStopwords: ReadonlySet<string>;
  }
): FieldMatchResult {
  const cleanQuery = normalizeKeepDiacritics(query);
  if (!cleanQuery || cleanQuery.length < 2) {
    return { score: 0, exact_phrase_field: null, matched_field: null };
  }

  const strictDiacritics = hasVietnameseDiacritics(cleanQuery);
  const queryDiaPadded = toPaddedDiacriticTokens(cleanQuery);
  const queryAsciiPadded = toPaddedAsciiTokens(cleanQuery);
  const isMultiWord = cleanQuery.includes(' ');

  const weightedEntries: Array<{
    name: string;
    text: string;
    exactScore: number;
    weight: number;
  }> = [
    { name: 'title', text: fields.title || '', exactScore: 1.0, weight: 1.0 },
    {
      name: 'category_name',
      text: fields.category_name || '',
      exactScore: 0.88,
      weight: 0.85,
    },
    {
      name: 'created_by',
      text: [fields.created_by || '', fields.sender_group || '']
        .filter(Boolean)
        .join(' '),
      exactScore: 0.86,
      weight: 0.82,
    },
    {
      name: 'description',
      text: fields.description || '',
      exactScore: 0.8,
      weight: 0.78,
    },
    {
      name: 'review_note',
      text: fields.review_note || '',
      exactScore: 0.72,
      weight: 0.68,
    },
  ];

  // Tầng 1: Khớp nguyên cụm chữ người dùng đã gửi (ưu tiên ranh giới từ trước khi lọc stopword)
  for (const entry of weightedEntries) {
    if (!entry.text.trim()) continue;
    const fieldDia = toPaddedDiacriticTokens(entry.text);
    if (queryDiaPadded.trim().length >= 2 && fieldDia.includes(queryDiaPadded)) {
      return {
        score: entry.exactScore,
        exact_phrase_field: entry.name,
        matched_field: entry.name,
      };
    }
    if (!strictDiacritics && queryAsciiPadded.trim().length >= 2) {
      const fieldAscii = toPaddedAsciiTokens(entry.text);
      if (fieldAscii.includes(queryAsciiPadded)) {
        return {
          score: Number((entry.exactScore - 0.04).toFixed(4)),
          exact_phrase_field: entry.name,
          matched_field: entry.name,
        };
      }
    }
    // Cho phép khớp cụm >= 2 từ dù thiếu dấu nếu toàn cụm dài >= 6 ký tự
    if (isMultiWord && queryAsciiPadded.trim().length >= 6) {
      const fieldAscii = toPaddedAsciiTokens(entry.text);
      if (fieldAscii.includes(queryAsciiPadded)) {
        return {
          score: Number((entry.exactScore - 0.06).toFixed(4)),
          exact_phrase_field: entry.name,
          matched_field: entry.name,
        };
      }
    }
  }

  // Tầng 2: So khớp từ khóa + bigram giữ dấu theo từng trường có trọng số
  let bestScore = 0;
  let bestField: string | null = null;
  let matchedFieldCount = 0;

  for (const entry of weightedEntries) {
    if (!entry.text.trim()) continue;
    const match = scoreVietnameseRelevance(cleanQuery, entry.text, options);
    if (match.overlap === 0) continue;
    // Chống nhiễu từ ghép tiếng Việt: câu >= 3 từ có nghĩa mà chỉ trùng 1 từ đơn rời rạc (VD "ký" trong "đăng ký" vs "ký túc xá")
    if (match.query_tokens >= 3 && match.overlap <= 1 && !match.phrase_hit) {
      continue;
    }

    matchedFieldCount += 1;
    const weighted = Number((match.score * entry.weight).toFixed(4));
    if (weighted > bestScore) {
      bestScore = weighted;
      bestField = entry.name;
    }
  }

  // Thưởng nhẹ khi từ khóa xuất hiện xuyên suốt nhiều trường thật (chỉ khi đã đạt ngưỡng khớp thực)
  if (bestScore >= 0.3 && matchedFieldCount >= 2) {
    bestScore = Math.min(0.96, Number((bestScore + 0.08).toFixed(4)));
  }

  return {
    score: bestScore,
    exact_phrase_field: null,
    matched_field: bestField,
  };
}

export function renderPromptTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const val = variables[key];
    return val !== undefined ? String(val) : '';
  });
}
