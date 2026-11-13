FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .

# Các biến NEXT_PUBLIC_* được Next.js đưa vào JavaScript khi build
# Docker Compose truyền giá trị qua build.args cho bước này
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# GIAI ĐOẠN 2: RUNTIME
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# next.config.ts đã cấu hình output: 'standalone'.
# Chỉ sao chép các file cần thiết để chạy ứng dụng.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# Không chạy server bằng root.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
