FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    SKILLS_DIRECTORIES=/app/skills

RUN mkdir -p /app/skills/public /app/skills/private /app/data

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
