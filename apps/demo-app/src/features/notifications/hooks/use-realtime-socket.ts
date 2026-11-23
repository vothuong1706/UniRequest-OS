// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ensureFreshToken } from '@/auth/keycloak';
import type { NotificationItem, RequestCommentItem } from '@/features/requests/types';
import { API_BASE_URL } from '@/services/api-client';

interface UseRealtimeSocketOptions {
  enabled: boolean;
  onNotification: (item: NotificationItem) => void;
  onNotificationSync: () => void;
  onRequestUpdated: (payload: { requestId: string; action: string }) => void;
  onCommentAdded: (comment: RequestCommentItem) => void;
}

function resolveSocketOrigin(): string {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return window.location.origin;
  }
}

export function useRealtimeSocket({
  enabled,
  onNotification,
  onNotificationSync,
  onRequestUpdated,
  onCommentAdded,
}: UseRealtimeSocketOptions) {
  const [connected, setConnected] = useState(false);

  const onNotificationRef = useRef(onNotification);
  const onNotificationSyncRef = useRef(onNotificationSync);
  const onRequestUpdatedRef = useRef(onRequestUpdated);
  const onCommentAddedRef = useRef(onCommentAdded);

  useEffect(() => {
    onNotificationRef.current = onNotification;
    onNotificationSyncRef.current = onNotificationSync;
    onRequestUpdatedRef.current = onRequestUpdated;
    onCommentAddedRef.current = onCommentAdded;
  }, [onNotification, onNotificationSync, onRequestUpdated, onCommentAdded]);

  useEffect(() => {
    if (!enabled) return;

    let socket: Socket | null = null;
    let active = true;

    const connect = async () => {
      try {
        const token = await ensureFreshToken(30);
        if (!active || !token) return;

        socket = io(resolveSocketOrigin(), {
          path: '/api/socket.io',
          transports: ['websocket', 'polling'],
          auth: (cb) => {
            ensureFreshToken(30)
              .then((fresh) => cb({ token: fresh }))
              .catch(() => cb({ token }));
          },
          reconnection: true,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 15000,
        });

        socket.on('connect', () => {
          if (active) setConnected(true);
        });

        socket.on('disconnect', () => {
          if (active) setConnected(false);
        });

        socket.on('notification:new', (item: NotificationItem) => {
          onNotificationRef.current(item);
        });

        socket.on('notification:sync', () => {
          onNotificationSyncRef.current();
        });

        socket.on('request:updated', (payload: { requestId: string; action: string }) => {
          onRequestUpdatedRef.current(payload);
        });

        socket.on('comment:new', (comment: RequestCommentItem) => {
          onCommentAddedRef.current(comment);
        });
      } catch {
        // Non-fatal: REST polling/refresh still works seamlessly
      }
    };

    void connect();

    return () => {
      active = false;
      setConnected(false);
      socket?.disconnect();
    };
  }, [enabled]);

  return { connected };
}
