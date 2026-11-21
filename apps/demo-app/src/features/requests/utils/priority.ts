import type {
  DepartmentGroupItem,
  RequestCategoryItem,
  RequestItem,
  RequestPriority,
} from '../types';

export function getTargetDepartmentLabel(
  code?: string | null,
  departments: DepartmentGroupItem[] = []
): string | null {
  if (!code) return null;
  const normalized = code.trim().replace(/^\/+/, '');
  if (!normalized) return null;
  const matched = departments.find((d) => d.path === normalized);
  return matched?.display_label ?? normalized.split('/').join(' / ');
}

export interface PriorityOption {
  value: RequestPriority;
  label: string;
  slaHint: string;
}

export const PRIORITY_LEVELS: readonly PriorityOption[] = [
  { value: 'NORMAL', label: 'Bình thường', slaHint: 'Trong 24 giờ' },
  { value: 'HIGH', label: 'Ưu tiên cao', slaHint: 'Trong 8 giờ' },
  { value: 'URGENT', label: 'Khẩn cấp', slaHint: 'Trong 2 giờ' },
] as const;

const LABEL_TO_VALUE: Record<string, RequestPriority> = {
  'bình thường': 'NORMAL',
  'ưu tiên cao': 'HIGH',
  'khẩn cấp': 'URGENT',
};

const VALUE_TO_LABEL: Record<RequestPriority, string> = {
  NORMAL: 'Bình thường',
  HIGH: 'Ưu tiên cao',
  URGENT: 'Khẩn cấp',
};

const LEGACY_CATEGORY_FALLBACK: Record<string, { label: string; department: string }> = {
  ACADEMIC: { label: 'Học vụ & Đào tạo', department: 'Phòng Đào tạo' },
  CERTIFICATE: {
    label: 'Giấy xác nhận sinh viên',
    department: 'Phòng Công tác Sinh viên',
  },
  FACILITY: { label: 'Báo hỏng cơ sở vật chất', department: 'Phòng Quản trị Thiết bị' },
  ENROLLMENT_CERT: {
    label: 'Giấy xác nhận sinh viên',
    department: 'Phòng Công tác Sinh viên',
  },
  ACADEMIC_REG: { label: 'Học vụ & Đăng ký tín chỉ', department: 'Phòng Đào tạo' },
  GRADE_REVIEW: { label: 'Phúc khảo & Bảng điểm', department: 'Phòng Khảo thí & ĐBCL' },
  TUITION_SCHOLARSHIP: {
    label: 'Học phí & Học bổng',
    department: 'Phòng Tài chính - Kế toán',
  },
  FACILITY_REPAIR: {
    label: 'Báo hỏng cơ sở vật chất',
    department: 'Phòng Quản trị Thiết bị',
  },
  ROOM_BOOKING: {
    label: 'Mượn phòng học / Hội trường',
    department: 'Phòng Hành chính - Tổng hợp',
  },
  DORM_SUPPORT: { label: 'Ký túc xá & Nội trú', department: 'Ban Quản lý Ký túc xá' },
  IT_ACCOUNT: { label: 'Hỗ trợ CNTT & Tài khoản', department: 'Trung tâm Công nghệ TT' },
  OTHER: { label: 'Yêu cầu khác', department: 'Văn phòng Trường' },
};

const PRIORITY_PREFIX_REGEX = /^\[Ưu tiên:\s*([^\]]+)\]\s*/i;

export function parseDescriptionPriority(description?: string | null): {
  priority: RequestPriority;
  cleanDescription: string;
} {
  if (!description) {
    return { priority: 'NORMAL', cleanDescription: '' };
  }

  const match = description.match(PRIORITY_PREFIX_REGEX);
  if (!match) {
    return { priority: 'NORMAL', cleanDescription: description };
  }

  const normalized = match[1].trim().toLowerCase();
  return {
    priority: LABEL_TO_VALUE[normalized] ?? 'NORMAL',
    cleanDescription: description.slice(match[0].length).trim(),
  };
}

export function resolveCategoryDisplay(
  req: Pick<RequestItem, 'category' | 'custom_category_label'>,
  categories: RequestCategoryItem[] = []
): { label: string; department: string } {
  const code = (req.category || 'OTHER').toUpperCase();
  const matched = categories.find((item) => item.code.toUpperCase() === code);
  const fallback = LEGACY_CATEGORY_FALLBACK[code];

  const customLabel = req.custom_category_label?.trim();
  const label = customLabel || matched?.name || fallback?.label || code;
  const department = matched?.department || fallback?.department || 'Văn phòng Trường';

  return { label, department };
}

export function resolveRequestDisplay(
  req: RequestItem,
  categories: RequestCategoryItem[] = [],
  departments: DepartmentGroupItem[] = []
): {
  categoryCode: string;
  categoryLabel: string;
  department: string;
  targetDepartmentLabel: string | null;
  priority: RequestPriority;
  cleanDescription: string;
} {
  const parsed = parseDescriptionPriority(req.description);
  const { label, department } = resolveCategoryDisplay(req, categories);
  const targetDepartmentLabel = getTargetDepartmentLabel(
    req.target_department,
    departments
  );

  return {
    categoryCode: req.category ?? 'OTHER',
    categoryLabel: label,
    department: targetDepartmentLabel ?? department,
    targetDepartmentLabel,
    priority: req.priority ?? parsed.priority,
    cleanDescription: parsed.cleanDescription,
  };
}

export function getPriorityLabel(priority: RequestPriority): string {
  return VALUE_TO_LABEL[priority] ?? VALUE_TO_LABEL.NORMAL;
}
