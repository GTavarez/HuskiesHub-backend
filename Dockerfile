FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ARG CACHEBUST=1

ENV PORT=8080
EXPOSE 8080
CMD ["node", "app.js"]
