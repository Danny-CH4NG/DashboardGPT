FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build
ENV NODE_ENV=production PORT=4100 DATA_FILE=/data/db.json
VOLUME /data
EXPOSE 4100
CMD ["npx", "tsx", "server/index.ts"]
