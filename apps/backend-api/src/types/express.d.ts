// SPDX-License-Identifier: Apache-2.0
import { KeycloakUser } from './request.js';

declare global {
  namespace Express {
    interface Request {
      user?: KeycloakUser;
    }
  }
}

export {};
