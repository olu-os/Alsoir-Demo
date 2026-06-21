# docker compose up -d --build  

FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_FUNCTIONS_URL
ARG VITE_GROQ_MODEL
ARG VITE_OLLAMA_BASE_URL
ARG VITE_OLLAMA_CHAT_MODEL
ARG VITE_LLM_PROVIDER
ARG VITE_ETSY_CLIENT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_FUNCTIONS_URL=$VITE_SUPABASE_FUNCTIONS_URL
ENV VITE_OLLAMA_BASE_URL=$VITE_OLLAMA_BASE_URL
ENV VITE_OLLAMA_CHAT_MODEL=$VITE_OLLAMA_CHAT_MODEL
ENV VITE_ETSY_CLIENT_ID=$VITE_ETSY_CLIENT_ID

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
