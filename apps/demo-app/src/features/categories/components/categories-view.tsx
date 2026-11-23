// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DepartmentGroupItem, RequestCategoryItem } from '@/features/requests/types';
import { getTargetDepartmentLabel } from '@/features/requests/utils/priority';
import { categoriesApi } from '@/services/api-client';

interface CategoriesViewProps {
  categories: RequestCategoryItem[];
  departments: DepartmentGroupItem[];
  userRoles: string[];
  userGroups: string[];
  loading: boolean;
  onReload: () => Promise<void>;
}

interface CategoryFormState {
  name: string;
  department: string;
  requires_evidence: boolean;
}

const EMPTY_FORM: CategoryFormState = {
  name: '',
  department: '',
  requires_evidence: false,
};

export function CategoriesView({
  categories,
  departments,
  userRoles,
  userGroups,
  loading,
  onReload,
}: CategoriesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RequestCategoryItem | null>(null);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const isAdmin = userRoles.some((r) => r.toLowerCase() === 'admin');

  const allowedDepartments = useMemo(() => {
    if (isAdmin || userGroups.length === 0) {
      return departments;
    }
    return departments.filter((d) =>
      userGroups.some(
        (ug) =>
          d.path === ug ||
          d.path.startsWith(`${ug}/`) ||
          (!ug.includes('/') && d.path.endsWith(`/${ug}`))
      )
    );
  }, [departments, isAdmin, userGroups]);

  const counts = useMemo(
    () => ({
      all: categories.length,
      active: categories.filter((c) => c.is_active).length,
      hidden: categories.filter((c) => !c.is_active).length,
    }),
    [categories]
  );

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return categories.filter((item) => {
      if (statusFilter === 'active' && !item.is_active) return false;
      if (statusFilter === 'hidden' && item.is_active) return false;
      if (!keyword) return true;
      const deptLabel =
        getTargetDepartmentLabel(item.department, departments) ?? item.department;
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.department.toLowerCase().includes(keyword) ||
        deptLabel.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword)
      );
    });
  }, [categories, departments, searchQuery, statusFilter]);

  const visibleSelectedIds = useMemo(() => {
    const visibleSet = new Set(filtered.map((item) => item.id));
    return selectedIds.filter((id) => visibleSet.has(id));
  }, [filtered, selectedIds]);

  const visibleSelectedSet = useMemo(
    () => new Set(visibleSelectedIds),
    [visibleSelectedIds]
  );

  const allVisibleSelected =
    filtered.length > 0 && visibleSelectedIds.length === filtered.length;
  const someVisibleSelected =
    visibleSelectedIds.length > 0 && visibleSelectedIds.length < filtered.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(filtered.map((c) => c.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...filtered.map((c) => c.id)]))
      );
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    const defaultDept =
      allowedDepartments.length === 1
        ? allowedDepartments[0].path
        : allowedDepartments[0]?.path || userGroups[0] || '';
    setForm({
      ...EMPTY_FORM,
      department: defaultDept,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: RequestCategoryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      department: item.department,
      requires_evidence: item.requires_evidence,
    });
    setDialogOpen(true);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const department = form.department.trim();

    if (name.length < 2 || department.length < 2) {
      toast.error('Vui lòng nhập tên danh mục và chọn ban phụ trách.');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await categoriesApi.update(editingItem.id, {
          name,
          department,
          requires_evidence: form.requires_evidence,
        });
        toast.success('Đã cập nhật danh mục.');
      } else {
        await categoriesApi.create({
          name,
          department,
          requires_evidence: form.requires_evidence,
        });
        toast.success('Đã thêm danh mục mới.');
      }

      setDialogOpen(false);
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu danh mục.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: RequestCategoryItem) => {
    setTogglingId(item.id);
    try {
      await categoriesApi.toggle(item.id);
      toast.success(
        item.is_active ? `Đã ẩn "${item.name}".` : `Đã bật lại "${item.name}".`
      );
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể thay đổi trạng thái.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteIds = async (ids: string[]) => {
    if (ids.length === 0 || deleting) return;
    setDeleting(true);
    try {
      const res = await categoriesApi.deleteMany(ids);
      if (res.success) {
        const removed = new Set(res.data ?? ids);
        setSelectedIds((prev) => prev.filter((id) => !removed.has(id)));
        toast.success(`Đã xóa ${removed.size} danh mục.`);
        await onReload();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa danh mục.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold tracking-tight">Danh mục yêu cầu</h1>

        <div className="flex items-center gap-2">
          {visibleSelectedIds.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              disabled={deleting}
              onClick={() => void handleDeleteIds(visibleSelectedIds)}
              aria-label="Xóa danh mục đã chọn"
              title="Xóa"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void onReload()}
          >
            <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
            <span>Làm mới</span>
          </Button>
          <Button type="button" size="sm" onClick={openCreateDialog}>
            <Plus className="size-3.5" />
            <span>Thêm danh mục</span>
          </Button>
        </div>
      </div>

      {/* Search & Status Filter Toolbar */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên danh mục, ban..."
            className="pr-8 pl-9"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Xóa từ khóa"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Tabs
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'hidden')}
        >
          <TabsList>
            <TabsTrigger value="all">
              Tất cả{' '}
              <span className="text-muted-foreground tabular-nums">{counts.all}</span>
            </TabsTrigger>
            <TabsTrigger value="active">
              Đang bật{' '}
              <span className="text-muted-foreground tabular-nums">{counts.active}</span>
            </TabsTrigger>
            <TabsTrigger value="hidden">
              Đang ẩn{' '}
              <span className="text-muted-foreground tabular-nums">{counts.hidden}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Categories Table */}
      <div className="bg-card overflow-hidden rounded-xl border shadow-xs">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <Tags className="text-muted-foreground mb-3 size-8" />
            <p className="text-sm font-medium">Chưa có danh mục nào</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pr-0">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả"
                    className="accent-primary size-4 cursor-pointer rounded align-middle"
                  />
                </TableHead>
                <TableHead>Tên danh mục</TableHead>
                <TableHead>Ban / Nhóm</TableHead>
                <TableHead>Minh chứng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const isBusy = togglingId === item.id;
                const deptLabel =
                  getTargetDepartmentLabel(item.department, departments) ??
                  item.department;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="w-10 pr-0">
                      <input
                        type="checkbox"
                        checked={visibleSelectedSet.has(item.id)}
                        onChange={() => toggleSelectOne(item.id)}
                        aria-label={`Chọn ${item.name}`}
                        className="accent-primary size-4 cursor-pointer rounded align-middle"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {deptLabel}
                    </TableCell>
                    <TableCell>
                      {item.requires_evidence ? (
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          Yêu cầu ảnh / mô tả
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Không bắt buộc
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${item.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`}
                        />
                        <span>{item.is_active ? 'Đang bật' : 'Đang ẩn'}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(item)}
                          aria-label={`Sửa ${item.name}`}
                          title="Sửa"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={isBusy}
                          onClick={() => void handleToggle(item)}
                          aria-label={
                            item.is_active ? `Ẩn ${item.name}` : `Bật ${item.name}`
                          }
                          title={item.is_active ? 'Ẩn' : 'Bật'}
                        >
                          {isBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : item.is_active ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={deleting}
                          onClick={() => void handleDeleteIds([item.id])}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Xóa ${item.name}`}
                          title="Xóa"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / Edit Category Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Chỉnh sửa danh mục' : 'Thêm danh mục yêu cầu'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Thông tin danh mục yêu cầu theo từng ban
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">
                Tên danh mục <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cat-name"
                value={form.name}
                disabled={saving}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="VD: Xin xác nhận đóng học phí"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-dept">
                Ban / Nhóm phụ trách <span className="text-destructive">*</span>
              </Label>
              {allowedDepartments.length > 0 ? (
                <select
                  id="cat-dept"
                  value={form.department}
                  disabled={saving || allowedDepartments.length === 1}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, department: e.target.value }))
                  }
                  className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/35 flex h-10 w-full rounded-md border px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {allowedDepartments.length > 1 && (
                    <option value="" disabled>
                      -- Chọn ban / nhóm --
                    </option>
                  )}
                  {allowedDepartments.map((dept) => (
                    <option key={dept.id} value={dept.path}>
                      {dept.depth > 0
                        ? `${'\u00A0\u00A0'.repeat(dept.depth)}└ ${dept.display_label}`
                        : dept.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="cat-dept"
                  value={form.department}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, department: e.target.value }))
                  }
                  placeholder="VD: KETOAN"
                />
              )}
            </div>

            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_evidence}
                disabled={saving}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    requires_evidence: e.target.checked,
                  }))
                }
                className="accent-primary size-4 rounded border"
              />
              <span>Yêu cầu đính kèm tệp hoặc mô tả chi tiết</span>
            </label>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                <span>{editingItem ? 'Lưu thay đổi' : 'Thêm danh mục'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
