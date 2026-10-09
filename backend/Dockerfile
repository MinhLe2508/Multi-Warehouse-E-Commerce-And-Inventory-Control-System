
FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Generate Prisma Client trước khi build NestJS
# URL giả chỉ dùng để tải Prisma config, không kết nối DB
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npx prisma generate

# Build NestJS, kiểm tra output và loại bỏ dev dependencies
RUN npm run build \
    && test -f dist/main.js \
    && npm prune --omit=dev

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]
