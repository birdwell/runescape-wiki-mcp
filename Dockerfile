FROM node:26-alpine AS build
WORKDIR /app
RUN npm install -g bun@1.4.3
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
RUN bun install --frozen-lockfile --ignore-scripts && bun run build

FROM node:26-alpine
LABEL io.modelcontextprotocol.server.name="io.github.birdwell/runescape-wiki-mcp"
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
RUN npm install -g bun@1.4.3 && npm cache clean --force
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/http.js"]
