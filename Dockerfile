FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# 🔥 REMOVE .env so Cloud Run env vars are used
RUN rm -f .env

EXPOSE 8080
ENV PORT=8080

CMD ["npm", "start"]

