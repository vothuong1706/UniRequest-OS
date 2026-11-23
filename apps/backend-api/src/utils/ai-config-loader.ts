// SPDX-License-Identifier: Apache-2.0
import fs from 'fs';
import path from 'path';
import { config } from '../config/environment.js';

export interface AiDomainProfileConfig {
  id: string;
  label: string;
  departmentHints: string[];
  categoryHints: string[];
  keywords: string[];
}

export interface AiDepartmentDirectoryEntry {
  department: string;
  display_name: string;
  summary: string;
  responsibilities: string[];
  aliases: string[];
}

export interface AiRouterConfig {
  timeout_ms: number;
  num_predict: number;
  temperature: number;
  system_prompt: string;
}

export interface AiAgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiExternalConfig {
  schema_version: string;
  description?: string;
  router: AiRouterConfig;
  department_directory: AiDepartmentDirectoryEntry[];
  retrieval: {
    top_k: number;
    min_keyword_score: number;
  };
  agent: {
    max_steps: number;
    max_history_messages: number;
    system_prompt: string;
    tool_definitions?: AiAgentToolDefinition[];
  };
  prompts: {
    assistant_system_prompt: string;
    assistant_user_template: string;
    triage_prompt_template: string;
  };
  quick_prompts: {
    student: string[];
    staff: string[];
  };
  diacritic_stopwords: string[];
  accentless_ambiguous_stopwords: string[];
  intent_keywords: {
    stats: string[];
    approved: string[];
    pending: string[];
    rejected: string[];
    overdue: string[];
    urgent: string[];
    senders?: string[];
    routing_help: string[];
    top_category?: string[];
    greeting?: string[];
    top_sender?: string[];
    existing_request_refs?: string[];
  };
  priority_keywords: {
    urgent: string[];
    high: string[];
  };
  domain_profiles: AiDomainProfileConfig[];
}

interface CachedAiConfig {
  filePath: string;
  mtimeMs: number;
  checkedAtMs: number;
  data: AiExternalConfig;
}

const STAT_TTL_MS = 2000;
let cachedConfig: CachedAiConfig | null = null;

export function resolveAiConfigPath(explicitPath?: string): string {
  const candidates = [
    explicitPath,
    config.ai.configFile,
    '/usr/src/app/ai-config/assistant-config.json',
    path.resolve(process.cwd(), 'config/ai/assistant-config.json'),
    path.resolve(process.cwd(), '../../config/ai/assistant-config.json'),
    path.resolve(__dirname, '../../../../config/ai/assistant-config.json'),
    path.resolve(__dirname, '../../../config/ai/assistant-config.json'),
  ].filter((item): item is string => Boolean(item && item.trim()));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Không tìm thấy tệp cấu hình AI ngoài (assistant-config.json). Đã kiểm tra: ${candidates.join(', ')}`
  );
}

export function loadAiConfig(explicitPath?: string): AiExternalConfig {
  const now = Date.now();
  if (
    !explicitPath &&
    cachedConfig &&
    now - cachedConfig.checkedAtMs < STAT_TTL_MS
  ) {
    return cachedConfig.data;
  }

  const filePath = resolveAiConfigPath(explicitPath);
  const stat = fs.statSync(filePath);

  if (
    cachedConfig &&
    cachedConfig.filePath === filePath &&
    cachedConfig.mtimeMs === stat.mtimeMs
  ) {
    cachedConfig.checkedAtMs = now;
    return cachedConfig.data;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as AiExternalConfig;

  if (
    !parsed ||
    !parsed.router?.system_prompt ||
    !Array.isArray(parsed.department_directory) ||
    !parsed.agent?.system_prompt ||
    !parsed.prompts?.assistant_system_prompt ||
    !parsed.prompts?.assistant_user_template ||
    !parsed.prompts?.triage_prompt_template ||
    !Array.isArray(parsed.domain_profiles)
  ) {
    throw new Error(`Tệp cấu hình AI không đúng cấu trúc chuẩn: ${filePath}`);
  }

  cachedConfig = {
    filePath,
    mtimeMs: stat.mtimeMs,
    checkedAtMs: now,
    data: parsed,
  };
  return parsed;
}

export function clearAiConfigCache(): void {
  cachedConfig = null;
}
