FROM node:24-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev && chown -R node:node .next
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
