# Standalone dev instance. This file lives under dev/ so the JSR package
# does not include it. Build from the repository root:
#   docker build -f dev/Dockerfile -t astrogation .
FROM denoland/deno:2.7.12

WORKDIR /app

COPY --chown=deno:deno deno.json styles.css mod.ts ./
COPY --chown=deno:deno src ./src
COPY --chown=deno:deno dev/bundle.json dev/client.tsx dev/host.css dev/serve.ts dev/deno.lock ./dev/

USER root
RUN mkdir -p dev/.bundle dev/.sector-cache && chown -R deno:deno /app
USER deno

RUN deno cache --lock=dev/deno.lock --config=dev/bundle.json dev/client.tsx \
  && deno cache dev/serve.ts

ENV HOST=0.0.0.0
ENV PORT=8788
EXPOSE 8788

HEALTHCHECK --start-period=20s --interval=30s --timeout=5s --retries=3 \
  CMD deno eval "const response = await fetch('http://127.0.0.1:' + (Deno.env.get('PORT') ?? '8788') + '/'); if (!response.ok) Deno.exit(1)"

CMD ["deno", "task", "dev"]
