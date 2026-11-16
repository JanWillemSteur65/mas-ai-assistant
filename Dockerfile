# Stage 1 — Build the React UI
FROM node:20-alpine AS ui-builder
WORKDIR /ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# Stage 2 — Runtime
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY --from=ui-builder /ui/dist ./ui/dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3737
CMD ["node", "server.js"]
