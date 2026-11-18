import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyKeycloakJwt } from '../middlewares/auth-middleware.js';
import { hasElevatedRole } from '../services/request-service.js';
import { KeycloakUser } from '../types/request.js';

let ioInstance: SocketIOServer | null = null;

export const initSocketServer = (httpServer: http.Server): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    path: '/api/socket.io',
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Zero-Trust JWT RS256 authentication on Socket.IO handshake
  io.use(async (socket, next) => {
    try {
      const authToken =
        (typeof socket.handshake.auth?.token === 'string'
          ? socket.handshake.auth.token
          : undefined) ||
        (typeof socket.handshake.headers.authorization === 'string' &&
        socket.handshake.headers.authorization.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.substring(7).trim()
          : undefined);

      if (!authToken) {
        next(new Error('UNAUTHORIZED'));
        return;
      }

      const user = await verifyKeycloakJwt(authToken);
      socket.data.user = user;
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as KeycloakUser | undefined;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const userRoom = `user:${user.preferred_username}`;
    void socket.join(userRoom);

    if (hasElevatedRole(user.roles)) {
      void socket.join('role:staff');
    }

    socket.emit('realtime:ready', {
      username: user.preferred_username,
      staff: hasElevatedRole(user.roles),
    });
  });

  ioInstance = io;
  console.log('⚡ [Socket.IO] Realtime server đã sẵn sàng tại path /api/socket.io');
  return io;
};

export const emitToUser = (username: string, event: string, payload: unknown): void => {
  if (!ioInstance || !username) return;
  ioInstance.to(`user:${username}`).emit(event, payload);
};

export const emitToStaff = (event: string, payload: unknown): void => {
  if (!ioInstance) return;
  ioInstance.to('role:staff').emit(event, payload);
};

export const emitRequestUpdated = (
  requestId: string,
  ownerUsername: string,
  action: 'CREATED' | 'STATUS_CHANGED' | 'COMMENT_ADDED'
): void => {
  const payload = { requestId, action, timestamp: new Date().toISOString() };
  emitToUser(ownerUsername, 'request:updated', payload);
  emitToStaff('request:updated', payload);
};
