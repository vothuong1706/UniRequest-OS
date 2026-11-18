# ==============================================================================
# Stage 1: Build Vite React + Tailwind CSS v4 bundle
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Cài dependencies trước để tận dụng Docker layer cache
COPY package*.json ./
RUN npm ci

# Copy mã nguồn ứng dụng
COPY . .

# Truyền biến môi trường Vite tại thời điểm build (có giá trị mặc định khớp Kong Gateway)
ARG VITE_API_BASE_URL=http://localhost:8000/api
ARG VITE_KEYCLOAK_URL=http://localhost:8000/auth
ARG VITE_KEYCLOAK_REALM=unirequest
ARG VITE_KEYCLOAK_CLIENT_ID=unirequest-portal

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID

# Build bản production vào /app/dist
RUN npm run build

# ==============================================================================
# Stage 2: Serve static SPA bằng Nginx Alpine (~25MB)
# ==============================================================================
FROM nginx:alpine AS production

# Xóa cấu hình mặc định và nạp nginx.conf hỗ trợ SPA fallback
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy bản build tĩnh từ Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
