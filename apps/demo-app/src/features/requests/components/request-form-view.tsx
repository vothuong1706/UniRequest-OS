import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { requestsApi, uploadApi } from '@/services/api-client';
import type {
  AiTriageSuggestion,
  DepartmentGroupItem,
  RequestCategoryItem,
  RequestPriority,
  TargetDepartment,
} from '../types';
import { PRIORITY_LEVELS } from '../utils/priority';
import { FileDropzone } from './file-dropzone';

interface RequestFormViewProps {
  categories: RequestCategoryItem[];
  departments: DepartmentGroupItem[];
  loadingDepartments: boolean;
  onRefreshDepartments: () => Promise<void>;
  isStaff: boolean;
  onCreated: () => Promise<void>;
}

const FALLBACK_CATEGORIES: RequestCategoryItem[] = [
  {
    id: 'fallback-other',
    code: 'OTHER',
    name: 'Yêu cầu khác',
    department: 'Văn phòng Trường',
    sla_hours: 24,
    requires_evidence: false,
    is_active: true,
    sort_order: 999,
  },
];

export function RequestFormView({
  categories,
  departments,
  loadingDepartments,
  onRefreshDepartments,
  isStaff,
  onCreated,
}: RequestFormViewProps) {
  const [categoryCode, setCategoryCode] = useState<string>('');
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [customCategoryLabel, setCustomCategoryLabel] = useState('');
  const [targetDepartment, setTargetDepartment] = useState<TargetDepartment | ''>('');

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('NORMAL');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [departmentError, setDepartmentError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [descError, setDescError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiTriageSuggestion | null>(null);

  const comboboxRef = useRef<HTMLDivElement>(null);
  const departmentRef = useRef<HTMLSelectElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const activeCategories = useMemo(() => {
    const active = categories.filter((c) => c.is_active);
    if (!targetDepartment) {
      return active.length > 0 ? active : FALLBACK_CATEGORIES;
    }
    const matchingDept = active.filter(
      (c) =>
        c.department === targetDepartment ||
        targetDepartment.startsWith(`${c.department}/`)
    );
    return matchingDept.length > 0
      ? [...matchingDept, ...FALLBACK_CATEGORIES]
      : FALLBACK_CATEGORIES;
  }, [categories, targetDepartment]);

  const defaultCategoryCode = activeCategories[0].code;
  const effectiveCategoryCode = categoryCode || defaultCategoryCode;

  const selectedCategory = useMemo(
    () =>
      activeCategories.find((item) => item.code === effectiveCategoryCode) ??
      activeCategories[0],
    [activeCategories, effectiveCategoryCode]
  );

  const filteredCategories = useMemo(() => {
    const keyword = categorySearch.trim().toLowerCase();
    if (!keyword) return activeCategories;
    return activeCategories.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.department.toLowerCase().includes(keyword)
    );
  }, [activeCategories, categorySearch]);

  useEffect(() => {
    if (!comboboxOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setComboboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [comboboxOpen]);

  const trimmedTitle = title.trim();
  const trimmedDesc = description.trim();
  const isOtherCategory = selectedCategory.code === 'OTHER';
  const needsEvidence = Boolean(selectedCategory.requires_evidence);

  const handleReset = () => {
    setCategoryCode('');
    setCategorySearch('');
    setCustomCategoryLabel('');
    setTargetDepartment('');
    setTitle('');
    setPriority('NORMAL');
    setDescription('');
    setSelectedFile(null);
    setDepartmentError('');
    setTitleError('');
    setDescError('');
    setStatusMessage('');
    setAiSuggestion(null);
  };

  const handleAiSuggest = async () => {
    if (`${trimmedTitle} ${trimmedDesc}`.trim().length < 3) {
      toast.info(
        'Vui lòng nhập tiêu đề hoặc nội dung tối thiểu 3 ký tự để AI phân tích.'
      );
      titleRef.current?.focus();
      return;
    }

    setAiLoading(true);
    try {
      const res = await requestsApi.suggestAi({
        title: trimmedTitle || trimmedDesc.slice(0, 100),
        description: trimmedDesc || undefined,
      });

      if (!res.success || !res.data) {
        throw new Error(res.message || 'Không nhận được gợi ý từ hệ thống AI.');
      }

      const suggestion = res.data;
      setAiSuggestion(suggestion);

      if (suggestion.suggested_department) {
        const matchedDept = departments.find(
          (d) =>
            d.path === suggestion.suggested_department ||
            d.name === suggestion.suggested_department
        );
        if (matchedDept) {
          setTargetDepartment(matchedDept.path);
          setDepartmentError('');
        }
      }

      const matchedCategory = categories.find(
        (c) =>
          c.is_active &&
          c.code.toUpperCase() === suggestion.suggested_category_code.toUpperCase()
      );
      setCategoryCode(matchedCategory ? matchedCategory.code : '');
      setPriority(suggestion.suggested_priority);
      setDescError('');

      toast.success(
        `AI [I] đã đề xuất: ${suggestion.suggested_department_label ?? 'Phòng ban phù hợp'} (${suggestion.suggested_category_name}).`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Không thể phân tích gợi ý AI lúc này.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!targetDepartment) {
      setDepartmentError('Vui lòng chọn phòng ban tiếp nhận yêu cầu.');
      departmentRef.current?.focus();
      return;
    }
    setDepartmentError('');

    if (trimmedTitle.length < 5) {
      setTitleError('Vui lòng nhập tiêu đề tối thiểu 5 ký tự.');
      titleRef.current?.focus();
      return;
    }
    setTitleError('');

    if (needsEvidence && !selectedFile && trimmedDesc.length < 15) {
      setDescError(
        `Danh mục "${selectedCategory.name}" cần đính kèm ảnh hoặc mô tả vị trí, tình trạng (tối thiểu 15 ký tự).`
      );
      descRef.current?.focus();
      return;
    }

    if (priority === 'URGENT' && trimmedDesc.length < 10) {
      setDescError('Yêu cầu khẩn cấp cần nêu rõ lý do (tối thiểu 10 ký tự).');
      descRef.current?.focus();
      return;
    }

    setDescError('');
    setSubmitting(true);
    setStatusMessage('');

    try {
      let attachmentUrl: string | undefined;

      if (selectedFile) {
        setStatusMessage('Đang tải tệp đính kèm...');
        const uploadRes = await uploadApi.uploadFile(selectedFile);
        if (!uploadRes.success || !uploadRes.data?.url) {
          throw new Error('Không thể tải tệp đính kèm. Vui lòng thử lại.');
        }
        attachmentUrl = uploadRes.data.url;
      }

      setStatusMessage('Đang gửi yêu cầu...');
      const response = await requestsApi.create({
        title: trimmedTitle,
        description: trimmedDesc || undefined,
        category: selectedCategory.code,
        custom_category_label: isOtherCategory
          ? customCategoryLabel.trim() || undefined
          : undefined,
        target_department: targetDepartment,
        priority,
        attachment_url: attachmentUrl,
      });

      if (response.success) {
        handleReset();
        toast.success('Đã gửi yêu cầu thành công.');
        await onCreated();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể gửi yêu cầu.');
    } finally {
      setSubmitting(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tạo yêu cầu mới</h1>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Không gian [I] Intelligence: Trợ lý phân tuyến AI Hybrid */}
            <div className="bg-muted/50 space-y-2.5 rounded-lg border p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-foreground size-4 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">Trợ lý phân tuyến AI</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={submitting || aiLoading}
                  onClick={() => void handleAiSuggest()}
                >
                  {aiLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  <span>{aiLoading ? 'Đang phân tích...' : 'Gợi ý phân tuyến AI'}</span>
                </Button>
              </div>

              {aiSuggestion && (
                <div className="bg-background space-y-1.5 rounded-md border p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[11px]">
                        {aiSuggestion.provider === 'ollama'
                          ? `Ollama (${aiSuggestion.model ?? 'LLM'})`
                          : 'Local NLP Engine'}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] tabular-nums">
                        Độ tin cậy {Math.round(aiSuggestion.confidence * 100)}%
                      </Badge>
                    </div>
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      {aiSuggestion.latency_ms}ms
                    </span>
                  </div>
                  <p className="font-medium leading-snug">{aiSuggestion.summary}</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Lý do: {aiSuggestion.reason}
                  </p>
                </div>
              )}
            </div>

            {/* Phòng ban / Nhóm tiếp nhận (Đồng bộ động từ Keycloak Groups) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="target-department">
                  Phòng ban / Nhóm tiếp nhận <span className="text-destructive">*</span>
                </Label>
                <button
                  type="button"
                  disabled={submitting || loadingDepartments}
                  onClick={() => void onRefreshDepartments()}
                  className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs transition-colors disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn('size-3', loadingDepartments && 'animate-spin')}
                  />
                  <span>Đồng bộ từ Keycloak</span>
                </button>
              </div>
              <select
                ref={departmentRef}
                id="target-department"
                name="target_department"
                value={targetDepartment}
                disabled={submitting}
                aria-invalid={Boolean(departmentError)}
                onChange={(e) => {
                  setTargetDepartment(e.target.value as TargetDepartment);
                  setCategoryCode('');
                  setCategorySearch('');
                  if (departmentError) setDepartmentError('');
                }}
                className={cn(
                  'border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/35 flex h-10 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50',
                  !targetDepartment && 'text-muted-foreground',
                  departmentError &&
                    'border-destructive focus-visible:ring-destructive/20'
                )}
              >
                <option value="" disabled>
                  {loadingDepartments
                    ? 'Đang tải...'
                    : departments.length === 0
                      ? 'Chưa có Group nào trong Keycloak'
                      : '-- Chọn phòng ban / nhóm tiếp nhận --'}
                </option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.path}>
                    {dept.depth > 0
                      ? `${'\u00A0\u00A0'.repeat(dept.depth)}└ ${dept.display_label}`
                      : dept.name}
                  </option>
                ))}
              </select>
              {departmentError && (
                <p className="text-destructive text-xs">{departmentError}</p>
              )}
            </div>

            {/* Searchable Dynamic Category Combobox */}
            <div className="space-y-2" ref={comboboxRef}>
              <Label>
                Loại yêu cầu <span className="text-destructive">*</span>
              </Label>

              <div className="relative">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setComboboxOpen((prev) => !prev)}
                  aria-expanded={comboboxOpen}
                  className={cn(
                    'border-input bg-background hover:bg-accent/50 flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm transition-colors outline-none cursor-pointer focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/35',
                    comboboxOpen && 'border-ring ring-1 ring-ring/35'
                  )}
                >
                  <span className="truncate font-medium">{selectedCategory.name}</span>
                  <ChevronsUpDown className="text-muted-foreground ml-2 size-4 shrink-0" />
                </button>

                {comboboxOpen && (
                  <div className="bg-popover text-popover-foreground absolute z-30 mt-1.5 w-full rounded-lg border shadow-md">
                    <div className="flex items-center border-b px-3 py-2">
                      <Search className="text-muted-foreground mr-2 size-4 shrink-0" />
                      <input
                        type="text"
                        autoFocus
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        placeholder="Tìm loại yêu cầu..."
                        className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
                      />
                    </div>

                    <div className="max-h-64 overflow-y-auto p-1">
                      {filteredCategories.length === 0 ? (
                        <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                          Không có danh mục phù hợp.
                        </p>
                      ) : (
                        filteredCategories.map((item) => {
                          const isSelected = item.code === selectedCategory.code;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setCategoryCode(item.code);
                                setComboboxOpen(false);
                                setCategorySearch('');
                                setDescError('');
                              }}
                              className={cn(
                                'hover:bg-accent flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors cursor-pointer',
                                isSelected && 'bg-accent'
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <Check
                                  className={cn(
                                    'size-3.5 shrink-0',
                                    isSelected ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span className="truncate font-medium">{item.name}</span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Custom category free-text when "Yêu cầu khác" is chosen */}
            {isOtherCategory && (
              <div className="space-y-2">
                <Label htmlFor="custom-category-label">
                  Tên loại yêu cầu cụ thể (không bắt buộc)
                </Label>
                <Input
                  id="custom-category-label"
                  maxLength={120}
                  disabled={submitting}
                  value={customCategoryLabel}
                  onChange={(e) => setCustomCategoryLabel(e.target.value)}
                  placeholder="VD: Xin xác nhận thực tập..."
                />
              </div>
            )}

            {/* Tiêu đề */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="req-title">
                  Tiêu đề <span className="text-destructive">*</span>
                </Label>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {title.length}/255
                </span>
              </div>
              <Input
                ref={titleRef}
                id="req-title"
                maxLength={255}
                value={title}
                disabled={submitting}
                aria-invalid={Boolean(titleError)}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError) setTitleError('');
                }}
                placeholder={
                  isStaff
                    ? 'VD: Báo hỏng máy chiếu phòng A201, Đăng ký mượn hội trường...'
                    : 'VD: Xin giấy xác nhận sinh viên vay vốn học kỳ 1'
                }
              />
              {titleError && <p className="text-destructive text-xs">{titleError}</p>}
            </div>

            {/* Mức độ ưu tiên (Compact 1-row Segmented Control) */}
            <div className="space-y-2">
              <Label>Mức độ ưu tiên</Label>
              <div className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
                {PRIORITY_LEVELS.map((item) => {
                  const active = priority === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setPriority(item.value);
                        setDescError('');
                      }}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer',
                        active
                          ? 'bg-background text-foreground font-medium shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nội dung chi tiết */}
            <div className="space-y-2">
              <Label htmlFor="req-desc">
                Nội dung chi tiết
                {(needsEvidence || priority === 'URGENT') && (
                  <span className="text-destructive"> *</span>
                )}
              </Label>
              <Textarea
                ref={descRef}
                id="req-desc"
                rows={4}
                value={description}
                disabled={submitting}
                aria-invalid={Boolean(descError)}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (descError) setDescError('');
                }}
                placeholder={
                  isStaff
                    ? 'Nêu rõ đơn vị, phòng học, thiết bị hoặc thông tin cần hỗ trợ...'
                    : 'Nêu rõ mã sinh viên, lớp, phòng học hoặc thông tin cần hỗ trợ...'
                }
              />
              {descError && (
                <p className="text-destructive flex items-center gap-1.5 text-xs">
                  <AlertCircle className="size-3.5 shrink-0" />
                  <span>{descError}</span>
                </p>
              )}
            </div>

            {/* Tệp đính kèm */}
            <div className="space-y-2">
              <Label>
                Tệp đính kèm{' '}
                <span className="text-muted-foreground text-xs font-normal">
                  {needsEvidence
                    ? '(Khuyến nghị chụp ảnh hiện trường)'
                    : '(Không bắt buộc)'}
                </span>
              </Label>
              <FileDropzone
                file={selectedFile}
                onFileSelect={(f) => {
                  setSelectedFile(f);
                  if (f && descError) setDescError('');
                }}
                disabled={submitting}
                onError={(msg) => toast.error(msg)}
              />
            </div>

            {statusMessage && (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2 className="size-3.5 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={handleReset}
              >
                <RotateCcw className="size-3.5" />
                <span>Nhập lại</span>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                <span>{submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
