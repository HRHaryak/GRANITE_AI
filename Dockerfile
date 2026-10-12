# Railway builds from the repo root: this builds the React app in ./frontend.
FROM node:22-alpine
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
