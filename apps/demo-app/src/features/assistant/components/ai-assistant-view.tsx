// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Building2,
  FileSearch,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PageId } from '@/components/layout/nav-config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PriorityBadge, StatusBadge } from '@/features/requests/components/status-badge';
import type {
  AiAssistantConfig,
  AiAssistantHistoryTurn,
  AiAssistantResponse,
  DepartmentGroupItem,
} from '@/features/requests/types';
import { getTargetDepartmentLabel } from '@/features/requests/utils/priority';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { aiApi } from '@/services/api-client';

interface AiAssistantViewProps {
  isStaff: boolean;
  departments: DepartmentGroupItem[];
  onOpenRequest: (requestId: string) => void;
  onNavigate: (page: PageId) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  response?: AiAssistantResponse;
}

function formatScopeLabel(config: AiAssistantConfig | null, isStaff: boolean): string {
  if (!config) {
    return isStaff ? 'Phạm vi phòng ban' : 'Phạm vi cá nhân';
  }
  if (config.scope === 'ALL') return 'Toàn trường';
  if (config.scope === 'DEPARTMENT') {
    return config.departments.length > 0
      ? `Ban: ${config.departments.join(', ')}`
      : 'Phạm vi phòng ban';
  }
  return 'Hồ sơ cá nhân';
}

export function AiAssistantView({
  isStaff,
  departments,
  onOpenRequest,
  onNavigate,
}: AiAssistantViewProps) {
  const [aiConfig, setAiConfig] = useState<AiAssistantConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgSeqRef = useRef(1);

  const loadAiConfig = useCallback(async () => {
    try {
      const res = await aiApi.getConfig();
      if (res.success && res.data) {
        setAiConfig(res.data);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    aiApi
      .getConfig()
      .then((res) => {
        if (active && res.success && res.data) {
          setAiConfig(res.data);
        }
      })
      .catch(() => {
        // Non-fatal
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  const sendQuestion = async (rawText: string) => {
    const clean = rawText.trim();
    if (clean.length < 2 || asking) return;

    const historyPayload: AiAssistantHistoryTurn[] = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const userMsg: ChatMessage = {
      id: `user-${msgSeqRef.current++}`,
      role: 'user',
      content: clean,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setAsking(true);

    try {
      const res = await aiApi.ask(clean, historyPayload);
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Không nhận được phản hồi từ Trợ lý AI.');
      }

      const data = res.data;
      setAiConfig((prev) => (prev ? { ...prev, scoped_count: data.scoped_count } : prev));
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${msgSeqRef.current++}`,
          role: 'assistant',
          content: data.answer,
          timestamp: new Date().toISOString(),
          response: data,
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Không thể truy vấn Trợ lý AI lúc này.';
      toast.error(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-err-${msgSeqRef.current++}`,
          role: 'assistant',
          content: `Không thể xử lý câu hỏi: ${message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setAsking(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendQuestion(question);
  };

  const handleReindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    try {
      await loadAiConfig();
      toast.success('Đã làm mới số liệu trong phạm vi của bạn.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Không thể làm mới dữ liệu tra cứu.'
      );
    } finally {
      setReindexing(false);
    }
  };

  const quickPrompts = aiConfig?.quick_prompts ?? [];

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-4xl flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="text-foreground size-5" />
            <h1 className="text-2xl font-semibold tracking-tight">Trợ lý AI</h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
              <ShieldCheck className="size-3" />
              <span>{formatScopeLabel(aiConfig, isStaff)}</span>
            </Badge>
            <Badge variant="outline" className="gap-1 text-[11px] font-normal">
              <FileSearch className="size-3" />
              <span className="tabular-nums">
                {aiConfig?.scoped_count ?? 0} hồ sơ trong phạm vi
              </span>
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isStaff && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reindexing}
              onClick={() => void handleReindex()}
            >
              <RefreshCw className={cn('size-3.5', reindexing && 'animate-spin')} />
              <span>Làm mới dữ liệu</span>
            </Button>
          )}
          {messages.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={asking}
              onClick={() => setMessages([])}
            >
              <RotateCcw className="size-3.5" />
              <span>Hội thoại mới</span>
            </Button>
          )}
        </div>
      </div>

      {/* Chat Container */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-8 text-center">
              <div className="bg-muted mb-4 flex size-12 items-center justify-center rounded-xl border">
                <Bot className="text-foreground size-6" />
              </div>
              <h2 className="text-lg font-semibold">
                {isStaff
                  ? 'Rà soát hồ sơ, thống kê người gửi & cảnh báo SLA theo Lớp / Phòng ban'
                  : 'Tra cứu hồ sơ theo từng Phòng ban & hướng dẫn thủ tục'}
              </h2>
              <p className="text-muted-foreground mt-1.5 max-w-xl text-sm leading-relaxed">
                {isStaff
                  ? 'Hỏi số sinh viên gửi yêu cầu, đơn chờ duyệt, quá hạn SLA hoặc lọc hồ sơ theo lớp/nội dung; mọi kết quả đều từ dữ liệu thực tế và phân nhóm theo Lớp người gửi.'
                  : 'Hỏi hướng dẫn gửi thủ tục, số hồ sơ đã duyệt, đang chờ hoặc tìm nhanh yêu cầu của bạn được gom gọn theo từng Phòng ban.'}
              </p>

              <div className="mt-6 w-full space-y-2 text-left">
                <p className="text-muted-foreground text-xs font-medium">Câu hỏi gợi ý</p>
                {loadingConfig ? (
                  <div className="text-muted-foreground flex items-center gap-2 py-3 text-xs">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Đang tải cấu hình Trợ lý AI...</span>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickPrompts.map((promptText) => (
                      <button
                        key={promptText}
                        type="button"
                        disabled={asking}
                        onClick={() => void sendQuestion(promptText)}
                        className="border-border bg-background hover:bg-accent/60 rounded-lg border p-3 text-left text-xs leading-relaxed transition-colors cursor-pointer"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="bg-muted mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border">
                    <Bot className="size-4" />
                  </div>
                )}

                <div
                  className={cn(
                    'max-w-[90%] space-y-3',
                    msg.role === 'user' && 'max-w-[80%]'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-foreground border'
                    )}
                  >
                    {msg.content}
                  </div>

                  {/* Chỉ hiển thị dữ liệu thật tương ứng với câu hỏi */}
                  {msg.response && (
                    <div className="space-y-3">
                      {/* Thống kê tổng quan: chỉ hiển thị khi câu hỏi liên quan thống kê/lọc/SLA */}
                      {msg.response.show_metrics && (
                        <div
                          className={cn(
                            'grid grid-cols-2 gap-2',
                            msg.response.scope !== 'PERSONAL'
                              ? 'sm:grid-cols-5'
                              : 'sm:grid-cols-4'
                          )}
                        >
                          {msg.response.scope !== 'PERSONAL' && (
                            <div className="bg-background rounded-lg border px-3 py-2">
                              <p className="text-muted-foreground text-[11px]">
                                Người gửi
                              </p>
                              <p className="text-base font-semibold tabular-nums">
                                {msg.response.metrics.unique_senders}
                              </p>
                            </div>
                          )}
                          <div className="bg-background rounded-lg border px-3 py-2">
                            <p className="text-muted-foreground text-[11px]">
                              Tổng hồ sơ
                            </p>
                            <p className="text-base font-semibold tabular-nums">
                              {msg.response.metrics.total}
                            </p>
                          </div>
                          <div className="bg-background rounded-lg border px-3 py-2">
                            <p className="text-muted-foreground text-[11px]">Đã duyệt</p>
                            <p className="text-base font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                              {msg.response.metrics.approved}
                            </p>
                          </div>
                          <div className="bg-background rounded-lg border px-3 py-2">
                            <p className="text-muted-foreground text-[11px]">Chờ duyệt</p>
                            <p className="text-base font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                              {msg.response.metrics.pending}
                            </p>
                          </div>
                          <div className="bg-background rounded-lg border px-3 py-2">
                            <p className="text-muted-foreground text-[11px]">
                              Quá hạn SLA
                            </p>
                            <p
                              className={cn(
                                'text-base font-semibold tabular-nums',
                                msg.response.metrics.overdue_sla > 0
                                  ? 'text-destructive'
                                  : 'text-foreground'
                              )}
                            >
                              {msg.response.metrics.overdue_sla}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Thống kê phân tách theo Lớp/Nhóm gửi hoặc Phòng ban có dữ liệu thật */}
                      {msg.response.show_metrics &&
                        (msg.response.department_stats.length > 1 ||
                          (msg.response.group_by_mode === 'sender_group' &&
                            msg.response.department_stats.length >= 1)) && (
                          <div className="space-y-1.5">
                            <p className="text-muted-foreground text-xs font-medium">
                              {msg.response.group_by_mode === 'sender_group'
                                ? `Phân bổ theo Lớp / Nhóm người gửi (${msg.response.department_stats.length})`
                                : `Phân bổ theo từng Phòng ban (${msg.response.department_stats.length})`}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {msg.response.department_stats.map((stat) => {
                                const isSenderGroup = stat.group_kind === 'sender_group';
                                const groupLabel = isSenderGroup
                                  ? stat.department
                                  : (getTargetDepartmentLabel(
                                      stat.department,
                                      departments
                                    ) ?? stat.department);
                                return (
                                  <div
                                    key={`${stat.group_kind}-${stat.department}`}
                                    className="bg-background flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                                  >
                                    <div className="flex min-w-0 items-center gap-1.5 font-medium">
                                      {isSenderGroup ? (
                                        <Users className="text-muted-foreground size-3.5 shrink-0" />
                                      ) : (
                                        <Building2 className="text-muted-foreground size-3.5 shrink-0" />
                                      )}
                                      <span className="truncate">{groupLabel}</span>
                                    </div>
                                    <div className="text-muted-foreground flex shrink-0 items-center gap-2 tabular-nums">
                                      {isSenderGroup && stat.unique_senders > 0 && (
                                        <span>{stat.unique_senders} người</span>
                                      )}
                                      <span>{stat.total} đơn</span>
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        {stat.approved} duyệt
                                      </span>
                                      <span className="text-amber-600 dark:text-amber-400">
                                        {stat.pending} chờ
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      {/* Danh sách hồ sơ gom nhóm theo Lớp/Nhóm gửi (Ban) hoặc Phòng ban (Sinh viên) */}
                      {msg.response.grouped_requests.length > 0 && (
                        <div className="space-y-3">
                          {msg.response.grouped_requests.map((group) => {
                            const isSenderGroup = group.group_kind === 'sender_group';
                            const groupLabel = isSenderGroup
                              ? group.department
                              : (getTargetDepartmentLabel(
                                  group.department,
                                  departments
                                ) ?? group.department);
                            return (
                              <div
                                key={`${group.group_kind}-${group.department}`}
                                className="bg-background overflow-hidden rounded-lg border"
                              >
                                <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2">
                                  <div className="flex items-center gap-2">
                                    {isSenderGroup ? (
                                      <Users className="text-foreground size-3.5 shrink-0" />
                                    ) : (
                                      <Building2 className="text-foreground size-3.5 shrink-0" />
                                    )}
                                    <span className="text-xs font-semibold">
                                      {groupLabel}
                                    </span>
                                    {isSenderGroup && group.unique_senders > 0 && (
                                      <Badge
                                        variant="outline"
                                        className="text-[11px] tabular-nums"
                                      >
                                        {group.unique_senders} người gửi
                                      </Badge>
                                    )}
                                    <Badge
                                      variant="secondary"
                                      className="text-[11px] tabular-nums"
                                    >
                                      {group.total} hồ sơ
                                    </Badge>
                                  </div>
                                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
                                    {group.approved > 0 && (
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        {group.approved} đã duyệt
                                      </span>
                                    )}
                                    {group.pending > 0 && (
                                      <span className="text-amber-600 dark:text-amber-400">
                                        {group.pending} chờ duyệt
                                      </span>
                                    )}
                                    {group.rejected > 0 && (
                                      <span>{group.rejected} từ chối</span>
                                    )}
                                    {group.overdue_sla > 0 && (
                                      <span className="text-destructive font-medium">
                                        {group.overdue_sla} quá SLA
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="divide-y">
                                  {group.requests.map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => onOpenRequest(item.id)}
                                      className="hover:bg-accent/50 flex w-full flex-col gap-1.5 px-3.5 py-2.5 text-left transition-colors cursor-pointer"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <StatusBadge status={item.status} />
                                          {item.priority !== 'NORMAL' && (
                                            <PriorityBadge priority={item.priority} />
                                          )}
                                          {item.sla_overdue && (
                                            <Badge
                                              variant="destructive"
                                              className="gap-1 text-[11px]"
                                            >
                                              <AlertTriangle className="size-3" />
                                              <span>
                                                Quá SLA ({item.elapsed_hours}h/
                                                {item.sla_hours}h)
                                              </span>
                                            </Badge>
                                          )}
                                        </div>
                                        <ArrowUpRight className="text-muted-foreground size-3.5 shrink-0" />
                                      </div>
                                      <p className="text-sm font-medium leading-snug">
                                        {item.title}
                                      </p>
                                      <p className="text-muted-foreground text-xs">
                                        {item.category_name} · {item.created_by}
                                        {item.sender_group && !isSenderGroup
                                          ? ` (${item.sender_group})`
                                          : ''}{' '}
                                        ·{' '}
                                        <span className="tabular-nums">
                                          {formatDateTime(item.created_at)}
                                        </span>
                                      </p>
                                      {item.review_note && (
                                        <p className="text-muted-foreground border-l-2 pl-2 text-xs">
                                          Phản hồi: {item.review_note}
                                        </p>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Hướng dẫn danh mục / phòng ban thật */}
                      {msg.response.recommended_categories.length > 0 && (
                        <div className="bg-background space-y-2 rounded-lg border p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold">
                              Thủ tục &amp; Phòng ban phụ trách
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onNavigate('create')}
                            >
                              <span>Tạo yêu cầu ngay</span>
                            </Button>
                          </div>
                          <div className="divide-y">
                            {msg.response.recommended_categories.map((cat) => (
                              <div
                                key={`${cat.code}-${cat.department}`}
                                className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs first:pt-0 last:pb-0"
                              >
                                <div className="space-y-0.5">
                                  <p className="font-medium">{cat.name}</p>
                                  <p className="text-muted-foreground text-[11px]">
                                    {cat.requires_evidence
                                      ? 'Khuyến nghị đính kèm tệp minh chứng'
                                      : 'Không bắt buộc đính kèm tệp'}
                                  </p>
                                </div>
                                <Badge variant="secondary" className="gap-1 text-[11px]">
                                  <Building2 className="size-3" />
                                  <span>
                                    {getTargetDepartmentLabel(
                                      cat.department,
                                      departments
                                    ) ?? cat.department}{' '}
                                    · SLA {cat.sla_hours}h
                                  </span>
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
                        <span>Trợ lý UniRequest</span>
                        <span>·</span>
                        <span className="tabular-nums">{msg.response.latency_ms}ms</span>
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="bg-primary text-primary-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {asking && (
            <div className="flex items-center gap-3">
              <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg border">
                <Bot className="size-4" />
              </div>
              <div className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Đang phân tích và tra cứu dữ liệu...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSubmit}
          className="bg-background flex items-center gap-2 border-t p-3 sm:p-4"
        >
          <Input
            ref={inputRef}
            value={question}
            disabled={asking}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Nhập câu hỏi cho Trợ lý AI"
            placeholder={
              isStaff
                ? 'VD: Thống kê hồ sơ chờ duyệt theo từng ban? Đơn nào quá hạn SLA?'
                : 'VD: Tôi muốn xin giấy xác nhận sinh viên thì đi đâu? Tôi có bao nhiêu đơn đã duyệt?'
            }
          />
          <Button
            type="submit"
            disabled={asking || question.trim().length < 2}
            aria-label="Gửi câu hỏi"
          >
            {asking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            <span className="hidden sm:inline">Hỏi AI</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
