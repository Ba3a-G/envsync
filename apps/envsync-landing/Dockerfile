FROM oven/bun:1.3.9 AS build

WORKDIR /app

COPY . .

ARG VITE_API_BASE_URL=http://127.0.0.1:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN bun install
RUN bun run --cwd sdks/envsync-ts-sdk build
RUN bun run --cwd apps/envsync-landing build

FROM nginx:1.27-alpine

COPY apps/envsync-landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/envsync-landing/dist /usr/share/nginx/html

EXPOSE 80
