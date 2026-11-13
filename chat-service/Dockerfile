FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build
ENV PORT=4200
EXPOSE 4200
CMD ["npx", "tsx", "server.ts"]
