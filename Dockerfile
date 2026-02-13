# schlankes Node-Image
FROM node:18-alpine

# app dir
WORKDIR /app

# nur package files für schnellen Cache
COPY package*.json ./

# Prod-Install
RUN npm ci --omit=dev

# Rest der Quellen
COPY . .

# kein Port nötig (Worker!)
# Startkommando – nutzt dein "start"-Script aus package.json
CMD ["npm", "start"]
