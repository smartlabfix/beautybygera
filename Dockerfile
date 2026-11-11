FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server.mjs ./
COPY public ./public
COPY data/seed.json ./data/seed.json
EXPOSE 8080
CMD ["node", "server.mjs"]
