FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
RUN npm install --omit=dev --workspace=server && npm install dotenv pg
COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
EXPOSE 8080
CMD ["node", "server/src/index.mjs"]
