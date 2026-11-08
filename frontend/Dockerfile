# Cantus web app: build with Node, serve with nginx.
# (On Render the frontend is deployed as a Static Site instead — see render.yaml.)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional: point the app at an API on another origin (default: same-origin /api/v1).
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:1.27-alpine
# Where nginx forwards /api/ (overridable at runtime).
ENV API_UPSTREAM=http://api:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
