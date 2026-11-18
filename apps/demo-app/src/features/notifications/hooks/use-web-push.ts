import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { pushApi } from '@/services/api-client';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush(enabled: boolean) {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext;

  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported || !enabled) return;
    let mounted = true;

    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((sub) => {
        if (mounted) {
          setSubscribed(Boolean(sub) && Notification.permission === 'granted');
        }
      })
      .catch(() => {
        // Ignore if SW not registered yet (e.g. Vite dev server)
      });

    return () => {
      mounted = false;
    };
  }, [supported, enabled]);

  const togglePush = useCallback(async () => {
    if (!supported) {
      toast.info('Trình duyệt hiện tại chưa hỗ trợ thông báo đẩy ngoài tab.');
      return;
    }

    setBusy(true);
    try {
      let reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await pushApi.unsubscribe(existing.endpoint).catch(() => {});
        await existing.unsubscribe();
        setSubscribed(false);
        toast.success('Đã tắt thông báo đẩy trên thiết bị này.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.warning(
          'Bạn chưa cấp quyền thông báo cho trình duyệt. Hãy bật lại trong cài đặt trình duyệt nếu cần.'
        );
        return;
      }

      const keyRes = await pushApi.getVapidPublicKey();
      const publicKey = keyRes.data?.publicKey;
      if (!publicKey) {
        throw new Error('Máy chủ chưa cấu hình khóa thông báo đẩy.');
      }

      const nextSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await pushApi.subscribe(nextSub.toJSON());
      setSubscribed(true);
      toast.success('Đã bật thông báo đẩy trên thiết bị này.');
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Không thể cập nhật trạng thái thông báo đẩy.'
      );
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return {
    supported,
    subscribed,
    busy,
    togglePush,
  };
}
