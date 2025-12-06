FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000

RUN mkdir -p /app/skills/public /app/skills/private /app/data

EXPOSE 3000

CMD ["node", "dist/src/server/index.jt"]
