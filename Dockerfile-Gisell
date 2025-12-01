FROM node:22

# Set working directory
WORKDIR /app

# Install dependencies first
COPY package*.json ./
RUN npm install --omit=dev

# Copy everything else (including db.js)
COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "app.js"]
