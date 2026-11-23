FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS runner

RUN apk add --no-cache tzdata

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist
COPY db ./db

RUN chown -R node:node /usr/src/app

ENV NODE_ENV=production
ENV PORT=4000

USER node

EXPOSE 4000

CMD ["node", "dist/index.js"]
