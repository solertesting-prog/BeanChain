# Imagen de la API. Construir desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile -t beanchain-api .
FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @beanchain/contracts build && pnpm --filter @beanchain/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
RUN addgroup -S app && adduser -S app -G app && mkdir -p uploads && chown app:app uploads
USER app
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
