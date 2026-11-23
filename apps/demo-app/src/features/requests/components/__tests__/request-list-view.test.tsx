// SPDX-License-Identifier: Apache-2.0
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DepartmentGroupItem, RequestCategoryItem, RequestItem } from '../../types';
import { RequestListView } from '../request-list-view';
import { CategoryBadge, DepartmentBadge } from '../status-badge';

const MOCK_DEPARTMENTS: DepartmentGroupItem[] = [
  {
    id: 'd1',
    name: 'KETOAN',
    path: 'KETOAN',
    display_label: 'KETOAN',
    parent_path: null,
    depth: 0,
    sub_group_count: 0,
  },
  {
    id: 'd2',
    name: 'CTSV',
    path: 'CTSV',
    display_label: 'CTSV',
    parent_path: null,
    depth: 0,
    sub_group_count: 0,
  },
];

const MOCK_CATEGORIES: RequestCategoryItem[] = [
  {
    id: 'c1',
    code: 'KETOAN_HOC_PHI',
    name: 'Xác nhận & tra soát học phí',
    department: 'KETOAN',
    sla_hours: 24,
    requires_evidence: true,
    is_active: true,
    sort_order: 10,
  },
];

const MOCK_REQUESTS: RequestItem[] = [
  {
    id: 'req-1',
    title: 'Đề nghị xác nhận biên lai nộp lệ phí bảo vệ đồ án tốt nghiệp học kỳ 2',
    description: 'Mô tả chi tiết rất dài không được hiện ở hàng gọn của bảng',
    category: 'KETOAN_HOC_PHI',
    target_department: 'KETOAN',
    sender_group: 'K11A1',
    priority: 'HIGH',
    status: 'PENDING',
    created_by: 'sinhvien',
    created_at: '2026-11-23T08:30:00Z',
    updated_at: '2026-11-23T08:30:00Z',
    attachment_url: '/api/upload/files/bien-lai.pdf',
  },
  {
    id: 'req-2',
    title: 'Xin giấy xác nhận sinh viên vay vốn ngân hàng',
    description: 'Mô tả ẩn số 2',
    category: 'OTHER',
    target_department: 'CTSV',
    sender_group: 'k11A2',
    priority: 'NORMAL',
    status: 'APPROVED',
    created_by: 'sinhvien2',
    created_at: '2026-11-23T09:00:00Z',
    updated_at: '2026-11-23T09:00:00Z',
    attachment_url: null,
  },
];

describe('Compact Table UI & Badge Truncation (RequestListView)', () => {
  it('CategoryBadge và DepartmentBadge bọc nhãn trong span.truncate riêng để hiển thị đúng dấu ba chấm ellipsis và giữ title tooltip', () => {
    const catHtml = renderToStaticMarkup(
      <CategoryBadge label="Đăng ký lịch phòng thực hành thẩm mỹ" />
    );
    expect(catHtml).toContain('title="Đăng ký lịch phòng thực hành thẩm mỹ"');
    expect(catHtml).toContain('justify-start');
    expect(catHtml).toContain('<span class="block min-w-0 truncate">');

    const deptHtml = renderToStaticMarkup(
      <DepartmentBadge label="Phòng Quản trị Thiết bị" />
    );
    expect(deptHtml).toContain('title="Phòng Quản trị Thiết bị"');
    expect(deptHtml).toContain('<span class="block min-w-0 truncate">');
  });

  it('Quản lý & Phê duyệt cắt gọn cột Tiêu đề đúng 1 dòng + title + aria-label, ẩn mô tả phụ, dùng icon Tệp và menu ... (không dùng em/en-dash)', () => {
    const html = renderToStaticMarkup(
      <RequestListView
        mode="manage"
        requests={MOCK_REQUESTS}
        categories={MOCK_CATEGORIES}
        departments={MOCK_DEPARTMENTS}
        loading={false}
        isStaff
        currentUsername="giangvien"
        statusFilter="ALL"
        onStatusFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onInspectRequest={vi.fn()}
        onRequestStatusChange={vi.fn()}
        onDeleteRequests={vi.fn(async () => {})}
        onNavigate={vi.fn()}
      />
    );

    // 1. Tiêu đề 1 dòng với button + title + aria-label + span.truncate
    expect(html).toContain(
      'title="Đề nghị xác nhận biên lai nộp lệ phí bảo vệ đồ án tốt nghiệp học kỳ 2"'
    );
    expect(html).toContain(
      'aria-label="Xem chi tiết yêu cầu: Đề nghị xác nhận biên lai nộp lệ phí bảo vệ đồ án tốt nghiệp học kỳ 2"'
    );
    expect(html).toContain('<span class="block truncate font-medium">');

    // 2. Ẩn mô tả phụ khỏi hàng bảng để giữ chiều cao thấp gọn
    expect(html).not.toContain('Mô tả chi tiết rất dài không được hiện');

    // 3. Cột Đính kèm thu gọn thành cột Tệp + link icon Paperclip với aria-label
    expect(html).toContain('>Tệp<');
    expect(html).toContain(
      'aria-label="Xem tệp đính kèm của Đề nghị xác nhận biên lai nộp lệ phí bảo vệ đồ án tốt nghiệp học kỳ 2"'
    );

    // 4. Có nút mở menu thao tác "..." và KHÔNG hiển thị nút Xóa lẻ bên ngoài hàng
    expect(html).toContain(
      'aria-label="Mở menu thao tác cho Đề nghị xác nhận biên lai nộp lệ phí bảo vệ đồ án tốt nghiệp học kỳ 2"'
    );
    expect(html).not.toContain('aria-label="Xóa yêu cầu"');

    // 5. Có nút chuyển chế độ "Gom theo Lớp" và không chứa em-dash / en-dash
    expect(html).toContain('Gom theo Lớp');
    expect(html).not.toMatch(/[—–]/);
  });

  it('Yêu cầu của tôi hiển thị bảng gọn chuẩn, nút Gom theo Ban và không có cột Người gửi', () => {
    const html = renderToStaticMarkup(
      <RequestListView
        mode="history"
        requests={MOCK_REQUESTS}
        categories={MOCK_CATEGORIES}
        departments={MOCK_DEPARTMENTS}
        loading={false}
        isStaff={false}
        currentUsername="sinhvien"
        statusFilter="ALL"
        onStatusFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onInspectRequest={vi.fn()}
        onRequestStatusChange={vi.fn()}
        onDeleteRequests={vi.fn(async () => {})}
        onNavigate={vi.fn()}
      />
    );

    expect(html).toContain('Yêu cầu của tôi');
    expect(html).toContain('Gom theo Ban');
    expect(html).not.toContain('>Người gửi<');
    expect(html).toContain('<span class="block truncate font-medium">');
    expect(html).not.toMatch(/[—–]/);
  });
});
