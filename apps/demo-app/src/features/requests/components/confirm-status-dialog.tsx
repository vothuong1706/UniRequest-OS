// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { RequestItem, RequestStatus } from '../types';

interface ConfirmStatusDialogProps {
  target: { request: RequestItem; nextStatus: RequestStatus } | null;
  loading: boolean;
  onConfirm: (reviewNote: string) => void;
  onClose: () => void;
}

export function ConfirmStatusDialog({
  target,
  loading,
  onConfirm,
  onClose,
}: ConfirmStatusDialogProps) {
  const [reviewNote, setReviewNote] = useState('');
  const [error, setError] = useState('');

  const isApprove = target?.nextStatus === 'APPROVED';

  const handleClose = () => {
    setReviewNote('');
    setError('');
    onClose();
  };

  const handleConfirmClick = () => {
    const trimmed = reviewNote.trim();
    if (!isApprove && trimmed.length < 5) {
      setError('Vui lòng nhập lý do từ chối tối thiểu 5 ký tự để người gửi nắm rõ.');
      return;
    }
    setError('');
    onConfirm(trimmed);
  };

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => !open && !loading && handleClose()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isApprove ? 'Phê duyệt yêu cầu' : 'Từ chối yêu cầu'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isApprove ? 'Phê duyệt yêu cầu' : 'Từ chối yêu cầu'}
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg border p-3 text-sm">
              <p className="font-medium">{target.request.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Người gửi: {target.request.created_by}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="review-note">
                {isApprove ? 'Ghi chú (không bắt buộc)' : 'Lý do từ chối'}
                {!isApprove && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="review-note"
                rows={3}
                disabled={loading}
                value={reviewNote}
                aria-invalid={Boolean(error)}
                onChange={(e) => {
                  setReviewNote(e.target.value);
                  if (error) setError('');
                }}
                placeholder={
                  isApprove
                    ? 'VD: Đã duyệt, mời nhận kết quả tại phòng phụ trách...'
                    : 'VD: Cần bổ sung ảnh minh chứng hoặc thông tin chi tiết hơn...'
                }
              />
              {error && (
                <p className="text-destructive flex items-center gap-1.5 text-xs">
                  <AlertCircle className="size-3.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={handleClose}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant={isApprove ? 'default' : 'destructive'}
            disabled={loading}
            onClick={handleConfirmClick}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            <span>{isApprove ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
