// SPDX-License-Identifier: Apache-2.0

export interface RecoveredToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    function?: {
      name?: string;
      arguments?: Record<string, unknown> | string;
    };
  }>;
}

function safeParseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function tryExtractFromCandidateJson(
  rawJson: string,
  allowedNames: ReadonlySet<string>
): RecoveredToolCall[] {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const results: RecoveredToolCall[] = [];

    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const fnObj =
        obj.function && typeof obj.function === 'object'
          ? (obj.function as Record<string, unknown>)
          : null;

      const rawName =
        (typeof obj.name === 'string' && obj.name) ||
        (typeof obj.tool === 'string' && obj.tool) ||
        (fnObj && typeof fnObj.name === 'string' ? fnObj.name : '');

      if (!rawName || !allowedNames.has(rawName)) continue;

      const rawArgs =
        obj.arguments ??
        obj.parameters ??
        obj.args ??
        (fnObj ? fnObj.arguments : undefined);

      results.push({
        name: rawName,
        arguments: safeParseArguments(rawArgs),
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Khôi phục lệnh gọi Tool cho cả định dạng native `tool_calls` lẫn JSON wrapper
 * mà các model nhỏ (3B/7B như qwen2.5:3b) đôi khi in trong trường `content`.
 */
export function extractToolCalls(
  message: OllamaChatMessage,
  allowedNames: ReadonlySet<string>
): RecoveredToolCall[] {
  const recovered: RecoveredToolCall[] = [];

  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    for (const call of message.tool_calls) {
      const name = call?.function?.name?.trim();
      if (!name || !allowedNames.has(name)) continue;
      recovered.push({
        name,
        arguments: safeParseArguments(call.function?.arguments),
      });
    }
    if (recovered.length > 0) return recovered;
  }

  const content = (message.content || '').trim();
  if (!content) return [];

  // 1. Dạng <tool_call>{...}</tool_call>
  const tagRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  for (const match of content.matchAll(tagRegex)) {
    recovered.push(...tryExtractFromCandidateJson(match[1], allowedNames));
  }
  if (recovered.length > 0) return recovered;

  // 2. Dạng code fence ```json ... ```
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  for (const match of content.matchAll(fenceRegex)) {
    recovered.push(...tryExtractFromCandidateJson(match[1], allowedNames));
  }
  if (recovered.length > 0) return recovered;

  // 3. Dạng JSON trực tiếp trong content
  if (content.startsWith('{') || content.startsWith('[')) {
    recovered.push(...tryExtractFromCandidateJson(content, allowedNames));
  }

  return recovered;
}

/**
 * Làm sạch phản hồi cuối cùng của Agent để không bao giờ lộ thẻ tool nội bộ,
 * chữ Hán rò rỉ, dấu gạch dài (em/en-dash), hay tên hạ tầng kỹ thuật ra màn hình người dùng cuối.
 */
export function sanitizeAgentAnswer(raw: string): string {
  return raw
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/```(?:json)?[\s\S]*?```/gi, '')
    .replace(/[\u3400-\u9FFF\uF900-\uFAFF]+/g, '')
    .replace(/[—–]/g, '-')
    .replace(/\b(PostgreSQL|postgres-vector|pgvector|SQLite|Ollama|rule-nlp-engine|tool_call)\b/gi, 'hệ thống')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
