// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';

export function PwaStatusBanner() {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
    };
    const handleOnline = () => {
      setIsOffline(false);
      toast.success('Đã khôi phục kết nối mạng.');
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100 flex items-center justify-center gap-2 border-b border-amber-200 px-4 py-2 text-xs font-medium dark:border-amber-800/60"
    >
      <WifiOff className="size-3.5 shrink-0" />
      <span>
        Đang ngoại tuyến - Một số chức năng gửi và đồng bộ yêu cầu sẽ hoạt động lại khi có
        mạng.
      </span>
    </div>
  );
}
