import { useMemo, useState, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
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
import type { RequestCategoryItem } from '@/features/requests/types';
import { categoriesApi } from '@/services/api-client';

interface CategoriesViewProps {
  categories: RequestCategoryItem[];
  loading: boolean;
  onReload: () => Promise<void>;
}

interface CategoryFormState {
  name: string;
  department: string;
  sla_hours: string;
  sort_order: string;
  requires_evidence: boolean;
}

const EMPTY_FORM: CategoryFormState = {
  name: '',
  department: '',
  sla_hours: '24',
  sort_order: '100',
  requires_evidence: false,
};

export function CategoriesView({ categories, loading, onReload }: CategoriesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RequestCategoryItem | null>(null);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.department.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword)
      );
    });
  }, [categories, searchQuery, statusFilter]);

  const openCreateDialog = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (item: RequestCategoryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      department: item.department,
      sla_hours: String(item.sla_hours),
      sort_order: String(item.sort_order),
      requires_evidence: item.requires_evidence,
    });
    setDialogOpen(true);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const department = form.department.trim();

    if (name.length < 2 || department.length < 2) {
      toast.error('Vui lòng nhập đầy đủ tên danh mục và phòng ban phụ trách.');
      return;
    }

    const slaHours = Number(form.sla_hours);
    const sortOrder = Number(form.sort_order);

    setSaving(true);
    try {
      if (editingItem) {
        await categoriesApi.update(editingItem.id, {
          name,
          department,
          sla_hours: Number.isFinite(slaHours) && slaHours >= 1 ? slaHours : 24,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
          requires_evidence: form.requires_evidence,
        });
        toast.success('Đã cập nhật danh mục.');
      } else {
        await categoriesApi.create({
          name,
          department,
          sla_hours: Number.isFinite(slaHours) && slaHours >= 1 ? slaHours : 24,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Danh mục yêu cầu</h1>
          <p className="text-muted-foreground text-sm">
            Quản lý các loại yêu cầu, phòng ban phụ trách và thời gian xử lý dự kiến.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
            placeholder="Tìm tên danh mục, phòng ban..."
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
            <p className="text-sm font-medium">Không có danh mục nào</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Thêm danh mục mới để Sinh viên, Giảng viên và Cán bộ có thể chọn khi gửi yêu
              cầu.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tên danh mục</TableHead>
                <TableHead>Phòng ban phụ trách</TableHead>
                <TableHead>Thời hạn (SLA)</TableHead>
                <TableHead>Minh chứng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const isBusy = togglingId === item.id;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.department}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {item.sla_hours} giờ
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
                          size="sm"
                          onClick={() => openEditDialog(item)}
                        >
                          <Pencil className="size-3.5" />
                          <span>Sửa</span>
                        </Button>
                        {item.code === 'OTHER' ? (
                          <span className="text-muted-foreground px-2 text-xs">
                            Mặc định
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleToggle(item)}
                          >
                            {isBusy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : item.is_active ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                            <span>{item.is_active ? 'Ẩn' : 'Bật'}</span>
                          </Button>
                        )}
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
            <DialogDescription>
              Danh mục mới sẽ hiển thị ngay trên biểu mẫu gửi yêu cầu.
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
                placeholder="VD: Xin bảo lưu kết quả học tập"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-dept">
                Phòng ban phụ trách <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cat-dept"
                value={form.department}
                disabled={saving}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, department: e.target.value }))
                }
                placeholder="VD: Phòng Đào tạo"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cat-sla">Thời hạn xử lý (giờ)</Label>
                <Input
                  id="cat-sla"
                  type="number"
                  min={1}
                  max={720}
                  disabled={saving}
                  value={form.sla_hours}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, sla_hours: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cat-order">Thứ tự hiển thị</Label>
                <Input
                  id="cat-order"
                  type="number"
                  disabled={saving}
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, sort_order: e.target.value }))
                  }
                />
              </div>
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
              <span>Yêu cầu đính kèm ảnh hoặc mô tả hiện trường chi tiết</span>
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
