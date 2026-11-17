FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js openapi.json ./
COPY database/ ./database/
USER node
EXPOSE 3000
CMD ["npm", "start"]
