FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package.json LICENSE ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

RUN mkdir -p /app/.data && chown -R node:node /app

USER node
ENV WEBHOOKDOCK_HOST=0.0.0.0 \
    WEBHOOKDOCK_PORT=4400 \
    WEBHOOKDOCK_DATA_PATH=/app/.data/webhookdock.json

EXPOSE 4400
VOLUME ["/app/.data"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4400/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.mjs"]
