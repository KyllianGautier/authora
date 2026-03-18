FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

ARG NPM_TOKEN

COPY package.json package-lock.json .npmrc* ./
RUN echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" >> .npmrc && \
    npm ci --omit=dev && \
    rm -f .npmrc

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/src/main"]
