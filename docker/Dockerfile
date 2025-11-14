# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS base
RUN apk add --no-cache git
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS production-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/.well-known ./.well-known
RUN mkdir -p /app/skills/public /app/skills/private /app/.data
EXPOSE 3000
CMD ["node", "./dist/server/index.js"]
