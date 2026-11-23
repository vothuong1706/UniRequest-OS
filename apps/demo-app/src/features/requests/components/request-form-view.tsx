// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
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
  DepartmentGroupItem,
  RequestCategoryItem,
  RequestPriority,
  TargetDepartment,
} from '../types';
import { getTargetDepartmentLabel, PRIORITY_LEVELS } from '../utils/priority';
import { FileDropzone } from './file-dropzone';

interface RequestFormViewProps {
  categories: RequestCategoryItem[];
  departments: DepartmentGroupItem[];
  loadingDepartments: boolean;
  onRefreshDepartments: () => Promise<void>;
  isStaff: boolean;
  onCreated: () => Promise<void>;
}

const OTHER_CATEGORY_ITEM: RequestCategoryItem = {
  id: 'fallback-other',
  code: 'OTHER',
  name: 'Yêu cầu khác',
  department: '',
  sla_hours: 24,
  requires_evidence: false,
  is_active: true,
  sort_order: 999,
};

function resolveDepartmentPath(
  departmentValue: string,
  departments: DepartmentGroupItem[]
): string {
  const clean = departmentValue.trim().replace(/^\/+/, '');
  if (!clean) return '';
  const exact = departments.find(
    (d) =>
      d.path.toLowerCase() === clean.toLowerCase() ||
      d.name.toLowerCase() === clean.toLowerCase()
  );
  return exact ? exact.path : clean;
}

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
  const [targetDepartment, setTargetDepartment] = useState<TargetDepartment | ''>('');

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('NORMAL');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [departmentError, setDepartmentError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [descError, setDescError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const comboboxRef = useRef<HTMLDivElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const departmentRef = useRef<HTMLSelectElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const activeCategories = useMemo(() => {
    const active = categories.filter((c) => c.is_active && c.code !== 'OTHER');
    return [...active, OTHER_CATEGORY_ITEM];
  }, [categories]);

  const selectedCategory = useMemo(
    () => activeCategories.find((item) => item.code === categoryCode) ?? null,
    [activeCategories, categoryCode]
  );

  const isOtherCategory = selectedCategory?.code === 'OTHER';
  const isDepartmentAutoLocked = Boolean(selectedCategory && !isOtherCategory);

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
  const needsEvidence = Boolean(selectedCategory?.requires_evidence);
  const autoDepartmentLabel = targetDepartment
    ? (getTargetDepartmentLabel(targetDepartment, departments) ?? targetDepartment)
    : '';

  const handleSelectCategory = (item: RequestCategoryItem) => {
    setCategoryCode(item.code);
    setComboboxOpen(false);
    setCategorySearch('');
    setCategoryError('');
    setDescError('');

    if (item.code === 'OTHER') {
      setTargetDepartment('');
      setDepartmentError('');
    } else {
      const resolvedPath = resolveDepartmentPath(item.department, departments);
      setTargetDepartment(resolvedPath);
      setDepartmentError('');
    }
  };

  const handleReset = () => {
    setCategoryCode('');
    setCategorySearch('');
    setTargetDepartment('');
    setTitle('');
    setPriority('NORMAL');
    setDescription('');
    setSelectedFile(null);
    setCategoryError('');
    setDepartmentError('');
    setTitleError('');
    setDescError('');
    setStatusMessage('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedCategory) {
      setCategoryError('Vui lòng chọn loại yêu cầu.');
      categoryButtonRef.current?.focus();
      return;
    }
    setCategoryError('');

    const resolvedTargetDept = isOtherCategory
      ? targetDepartment
      : resolveDepartmentPath(selectedCategory.department, departments);

    if (!resolvedTargetDept) {
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
        `Danh mục "${selectedCategory.name}" cần đính kèm tệp hoặc mô tả chi tiết (tối thiểu 15 ký tự).`
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
        target_department: resolvedTargetDept,
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
            {/* 1. Loại yêu cầu (chọn trước -> tự động điền & khóa Phòng ban quản lý danh mục đó) */}
            <div className="space-y-2" ref={comboboxRef}>
              <Label>
                Loại yêu cầu <span className="text-destructive">*</span>
              </Label>

              <div className="relative">
                <button
                  ref={categoryButtonRef}
                  type="button"
                  disabled={submitting}
                  onClick={() => setComboboxOpen((prev) => !prev)}
                  aria-expanded={comboboxOpen}
                  aria-invalid={Boolean(categoryError)}
                  className={cn(
                    'border-input bg-background hover:bg-accent/50 flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm transition-colors outline-none cursor-pointer focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/35',
                    !selectedCategory && 'text-muted-foreground',
                    comboboxOpen && 'border-ring ring-1 ring-ring/35',
                    categoryError &&
                      'border-destructive focus-visible:ring-destructive/20'
                  )}
                >
                  <span className="truncate font-medium">
                    {selectedCategory ? selectedCategory.name : '-- Chọn loại yêu cầu --'}
                  </span>
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

                    <div className="max-h-72 overflow-y-auto p-1">
                      {filteredCategories.length === 0 ? (
                        <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                          Không có danh mục phù hợp.
                        </p>
                      ) : (
                        filteredCategories.map((item) => {
                          const isSelected = item.code === selectedCategory?.code;
                          const deptBadgeLabel =
                            item.code === 'OTHER'
                              ? 'Tự chọn Ban'
                              : (getTargetDepartmentLabel(item.department, departments) ??
                                item.department);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectCategory(item)}
                              className={cn(
                                'hover:bg-accent flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors cursor-pointer',
                                isSelected && 'bg-accent',
                                item.code === 'OTHER' && 'mt-1 border-t pt-2.5'
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
                              <Badge
                                variant={item.code === 'OTHER' ? 'outline' : 'secondary'}
                                className="shrink-0 text-[11px] font-normal"
                              >
                                {deptBadgeLabel}
                              </Badge>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
              {categoryError && (
                <p className="text-destructive text-xs">{categoryError}</p>
              )}
            </div>

            {/* 2. Phòng ban / Nhóm tiếp nhận (Tự động điền & khóa theo Loại yêu cầu; chỉ mở chọn tay khi chọn "Yêu cầu khác") */}
            {isDepartmentAutoLocked ? (
              <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Building2 className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">Phòng ban tiếp nhận</p>
                    <p className="truncate text-sm font-medium">{autoDepartmentLabel}</p>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 gap-1 text-[11px]">
                  <Lock className="size-3" />
                  <span>SLA {selectedCategory?.sla_hours ?? 24}h</span>
                </Badge>
              </div>
            ) : isOtherCategory ? (
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
            ) : null}

            {/* 3. Tiêu đề */}
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
                  isOtherCategory
                    ? 'VD: Xin chuyển lớp sang K11A2, Xin cấp giấy khen kỷ niệm...'
                    : isStaff
                      ? 'VD: Báo hỏng máy chiếu phòng A201, Đăng ký mượn hội trường...'
                      : 'VD: Xin giấy xác nhận sinh viên vay vốn học kỳ 1'
                }
              />
              {titleError && <p className="text-destructive text-xs">{titleError}</p>}
            </div>

            {/* 4. Mức độ ưu tiên (Compact 1-row Segmented Control) */}
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

            {/* 5. Nội dung chi tiết */}
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

            {/* 6. Tệp đính kèm */}
            <div className="space-y-2">
              <Label>
                Tệp đính kèm{' '}
                <span className="text-muted-foreground text-xs font-normal">
                  {needsEvidence
                    ? '(Khuyến nghị chụp ảnh hoặc tải minh chứng)'
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
