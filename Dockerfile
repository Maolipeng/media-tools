FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache \
    ffmpeg \
    imagemagick \
    sox \
    sox-dev \
    bash \
    curl \
    ca-certificates \
    tzdata \
    fontconfig \
    freetype \
    harfbuzz \
    ttf-dejavu \
    ghostscript
RUN mkdir -p /usr/share/fonts/opentype/noto \
    && curl -L -o /usr/share/fonts/opentype/noto/NotoSansSC-Regular.otf \
      https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansSC-Regular.otf \
    && fc-cache -f
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/data ./data
EXPOSE 3000
CMD ["npm", "run", "start"]
