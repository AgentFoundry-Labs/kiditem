FROM node:22-slim AS builder

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY prisma/schema.prisma ./prisma/
COPY apps/server/package.json ./
RUN npm install --include=dev
RUN npx prisma generate --schema=./prisma/schema.prisma

COPY apps/server/ ./
RUN npx nest build

FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY prisma/schema.prisma ./prisma/
COPY apps/server/package.json ./
RUN npm install --omit=dev
RUN npx prisma generate --schema=./prisma/schema.prisma

COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/main.js"]
