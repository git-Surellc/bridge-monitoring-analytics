FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Build frontend
RUN npm run build

EXPOSE 8888

CMD ["npm", "start"]
