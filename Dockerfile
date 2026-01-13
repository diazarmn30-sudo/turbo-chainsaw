# Node LTS biar stabil
FROM node:20-bullseye-slim

WORKDIR /app

# Copy file dependency dulu biar cache build kepake
COPY package*.json ./

# Install deps (pakai legacy-peer-deps biar ga kejedot peer conflict)
RUN npm config set legacy-peer-deps true \
  && npm config set fund false \
  && npm config set audit false \
  && npm install --omit=dev

# Copy sisa source
COPY . .

# (opsional) pastikan folder db ada
RUN mkdir -p /app/db

# Jalankan bot
CMD ["node", "index.js"]
