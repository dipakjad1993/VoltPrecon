FROM node:20-slim AS web
WORKDIR /srv/voltprecon
COPY package.json ./
COPY apps/ apps/
COPY packages/ packages/
COPY tools/ tools/
COPY dist/ dist/
EXPOSE 8080
# Zero-dep: our own hardened static server (CSP/HSTS/ETag/dynamic /ev/* renderer).
CMD ["node", "infra/serve-static.js", "8080"]

# API stage (zero-dep): docker build --target api -t voltprecon-api .
FROM node:20-slim AS api
WORKDIR /srv/voltprecon
COPY package.json ./
COPY apps/web/data.bundle.json apps/web/data.bundle.json
COPY packages/engine/ packages/engine/
COPY packages/api/ packages/api/
COPY dist/ dist/
EXPOSE 3001
CMD ["node", "packages/api/src/server.js", "3001"]
