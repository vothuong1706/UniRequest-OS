import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Loader2,
  RotateCcw,
  Search,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { requestsApi, uploadApi } from '@/services/api-client';
import type { RequestCategoryItem, RequestPriority } from '../types';
import { PRIORITY_LEVELS } from '../utils/priority';
import { FileDropzone } from './file-dropzone';

interface RequestFormViewProps {
  categories: RequestCategoryItem[];
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
  isStaff,
  onCreated,
}: RequestFormViewProps) {
  const activeCategories = useMemo(() => {
    const active = categories.filter((c) => c.is_active);
    return active.length > 0 ? active : FALLBACK_CATEGORIES;
  }, [categories]);

  const defaultCategoryCode = activeCategories[0].code;

  const [categoryCode, setCategoryCode] = useState<string>('');
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [customCategoryLabel, setCustomCategoryLabel] = useState('');

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('NORMAL');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [titleError, setTitleError] = useState('');
  const [descError, setDescError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const comboboxRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

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
    setTitle('');
    setPriority('NORMAL');
    setDescription('');
    setSelectedFile(null);
    setTitleError('');
    setDescError('');
    setStatusMessage('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tạo yêu cầu mới</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Chọn loại yêu cầu phù hợp để gửi thẳng tới phòng ban phụ trách.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Searchable Dynamic Category Combobox */}
            <div className="space-y-2" ref={comboboxRef}>
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Loại yêu cầu <span className="text-destructive">*</span>
                </Label>
                <span className="text-muted-foreground text-xs">
                  {selectedCategory.department} · Dự kiến {selectedCategory.sla_hours}h
                </span>
              </div>

              <div className="relative">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setComboboxOpen((prev) => !prev)}
                  aria-expanded={comboboxOpen}
                  className={cn(
                    'border-input bg-background hover:bg-accent/50 flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm transition-colors cursor-pointer',
                    comboboxOpen && 'ring-ring/40 border-ring ring-2'
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
                        placeholder="Tìm loại yêu cầu hoặc phòng ban..."
                        className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
                      />
                    </div>

                    <div className="max-h-64 overflow-y-auto p-1">
                      {filteredCategories.length === 0 ? (
                        <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                          Không tìm thấy danh mục phù hợp.
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
                              <span className="text-muted-foreground shrink-0 text-xs">
                                {item.department}
                              </span>
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
                  placeholder="VD: Xin xác nhận thực tập, Đề xuất tổ chức câu lạc bộ..."
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
