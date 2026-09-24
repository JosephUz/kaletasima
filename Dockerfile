FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
ENV HOST=0.0.0.0 PORT=5185 NODE_ENV=production
USER node
EXPOSE 5185
HEALTHCHECK --interval=20s --timeout=3s CMD node -e "fetch('http://127.0.0.1:5185/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
