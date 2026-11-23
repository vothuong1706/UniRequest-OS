// SPDX-License-Identifier: Apache-2.0
import {
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  ShieldCheck,
  Tags,
  type LucideIcon,
} from 'lucide-react';

export type PageId = 'dashboard' | 'create' | 'history' | 'manage' | 'categories';

export interface NavItem {
  id: PageId;
  label: string;
  description: string;
  icon: LucideIcon;
  staffOnly?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'Tổng quan',
    description: 'Thống kê nhanh và yêu cầu gần đây',
    icon: LayoutDashboard,
  },
  {
    id: 'create',
    label: 'Tạo yêu cầu',
    description: 'Gửi yêu cầu mới trực tuyến',
    icon: FilePlus2,
  },
  {
    id: 'history',
    label: 'Yêu cầu của tôi',
    description: 'Theo dõi trạng thái yêu cầu bạn đã gửi',
    icon: ClipboardList,
  },
  {
    id: 'manage',
    label: 'Quản lý & Duyệt',
    description: 'Xử lý yêu cầu toàn trường',
    icon: ShieldCheck,
    staffOnly: true,
  },
  {
    id: 'categories',
    label: 'Danh mục',
    description: 'Quản lý loại yêu cầu và phòng ban',
    icon: Tags,
    staffOnly: true,
  },
];
