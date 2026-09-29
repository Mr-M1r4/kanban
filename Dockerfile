FROM node:20-alpine

# Prisma necesita OpenSSL en Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Dependencias primero (capa cacheable)
COPY package.json package-lock.json ./
RUN npm ci

# Codigo + build
COPY . .
RUN npx prisma generate && npm run build

# Borra las devDependencies del build final
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Aplica el schema y crea el primer tablero si la base esta vacia
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
