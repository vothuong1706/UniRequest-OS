import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { KeycloakUser } from '../types/request.js';

let cachedPemKey: string | null = null;
let lastKeyFetchTime = 0;
const KEY_CACHE_TTL = 1000 * 60 * 60; // Cache trong 1 giờ

/**
 * Lấy Public Key từ Keycloak Realm endpoint và định dạng chuẩn PEM
 */
export const getKeycloakPublicKey = async (): Promise<string> => {
  const now = Date.now();
  if (cachedPemKey && now - lastKeyFetchTime < KEY_CACHE_TTL) {
    return cachedPemKey;
  }

  try {
    const realmUrl = config.keycloak.realmUrl;
    const response = await fetch(realmUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Keycloak trả về mã lỗi HTTP: ${response.status}`);
    }

    const data = (await response.json()) as { public_key?: string };
    if (!data.public_key) {
      throw new Error('Không tìm thấy trường public_key trong phản hồi từ Keycloak realm');
    }

    cachedPemKey = `-----BEGIN PUBLIC KEY-----\n${data.public_key}\n-----END PUBLIC KEY-----`;
    lastKeyFetchTime = now;
    return cachedPemKey;
  } catch (error) {
    console.error('[Auth Middleware] Lỗi khi lấy Public Key từ Keycloak:', error);
    if (cachedPemKey) {
      console.warn('[Auth Middleware] Sử dụng lại Public Key đã cache trước đó.');
      return cachedPemKey;
    }
    throw error;
  }
};

/**
 * Xác minh chuỗi JWT RS256 từ Keycloak (tái sử dụng cho cả HTTP và Socket.IO)
 */
export const verifyKeycloakJwt = async (token: string): Promise<KeycloakUser> => {
  const pemKey = await getKeycloakPublicKey();
  const decoded = jwt.verify(token, pemKey, {
    algorithms: ['RS256'],
  }) as JwtPayload;

  const realmRoles = decoded.realm_access?.roles || [];
  const clientRoles = decoded.resource_access?.['unirequest-portal']?.roles || [];
  const combinedRoles = Array.from(new Set([...realmRoles, ...clientRoles]));

  const rawGroups = Array.isArray(decoded.groups) ? decoded.groups : [];
  const normalizedGroups = Array.from(
    new Set(
      rawGroups
        .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
        .map((g) => g.trim().replace(/^\/+/, ''))
    )
  );

  return {
    preferred_username: decoded.preferred_username || decoded.sub || 'unknown_user',
    email: decoded.email,
    roles: combinedRoles,
    groups: normalizedGroups,
    sub: decoded.sub,
    realm_access: decoded.realm_access,
    resource_access: decoded.resource_access,
  };
};

/**
 * Middleware xác thực Bearer JWT Token từ Keycloak
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Không tìm thấy token xác thực (Vui lòng đính kèm Bearer token trong header Authorization)',
    });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    req.user = await verifyKeycloakJwt(token);
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Token verification failed';
    res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn',
      error: errorMessage,
    });
  }
};
