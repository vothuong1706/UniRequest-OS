import { KeycloakUser } from './request.js';

declare global {
  namespace Express {
    interface Request {
      user?: KeycloakUser;
    }
  }
}

export {};
