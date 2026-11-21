import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyKeycloakJwt } from '../middlewares/auth-middleware.js';
import { keycloakGroupService } from '../services/keycloak-group-service.js';
import { resolveRequestAccessScope } from '../services/request-service.js';
import { KeycloakUser } from '../types/request.js';

let ioInstance: SocketIOServer | null = null;

const ALL_STAFF_ROOM = 'role:staff:all';

function getDepartmentRoomName(departmentPath: string): string {
  return `dept:${departmentPath}`;
}

function getTargetStaffRooms(targetDepartment?: string | null): string[] {
  const rooms = [ALL_STAFF_ROOM];
  const clean = targetDepartment?.trim().replace(/^\/+/, '');
  if (!clean) return rooms;

  const segments = clean.split('/').filter(Boolean);
  let prefix = '';
  for (const segment of segments) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    rooms.push(getDepartmentRoomName(prefix));
  }
  return Array.from(new Set(rooms));
}

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

  io.on('connection', async (socket) => {
    const user = socket.data.user as KeycloakUser | undefined;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const resolvedGroups = await keycloakGroupService
      .resolveUserGroupPaths(user.groups)
      .catch(() => user.groups);
    const scope = resolveRequestAccessScope({ ...user, groups: resolvedGroups });

    const userRoom = `user:${user.preferred_username}`;
    void socket.join(userRoom);

    if (scope.type === 'ALL') {
      void socket.join(ALL_STAFF_ROOM);
    } else if (scope.type === 'DEPARTMENT') {
      for (const dept of scope.departments) {
        void socket.join(getDepartmentRoomName(dept));
      }
    }

    socket.emit('realtime:ready', {
      username: user.preferred_username,
      staff: scope.type !== 'PERSONAL',
      scope: scope.type,
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

export const emitToStaff = (
  event: string,
  payload: unknown,
  targetDepartment?: string | null
): void => {
  if (!ioInstance) return;
  const rooms = getTargetStaffRooms(targetDepartment);
  ioInstance.to(rooms).emit(event, payload);
};

export const emitRequestUpdated = (
  requestId: string,
  ownerUsername: string,
  action: 'CREATED' | 'STATUS_CHANGED' | 'COMMENT_ADDED' | 'DELETED',
  targetDepartment?: string | null
): void => {
  const payload = { requestId, action, timestamp: new Date().toISOString() };
  emitToUser(ownerUsername, 'request:updated', payload);
  emitToStaff('request:updated', payload, targetDepartment);
};
