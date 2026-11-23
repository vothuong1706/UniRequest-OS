// SPDX-License-Identifier: Apache-2.0
import crypto from 'node:crypto';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    env: {
      KESTRA_WEBHOOK_KEY:
        process.env.KESTRA_WEBHOOK_KEY || crypto.randomBytes(16).toString('hex'),
    },
  },
});
