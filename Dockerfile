FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

RUN npm run build

ENV TRANSPORT=http
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.js"]
