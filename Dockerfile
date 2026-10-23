# Packages the dragonfruit control plane, not user applications.
FROM denoland/deno:2.9.5 AS build
WORKDIR /app
COPY . .
RUN deno install --frozen && deno task build

FROM denoland/deno:2.9.5
WORKDIR /app
COPY --from=build --chown=deno:deno /app /app
USER deno
EXPOSE 8000
CMD ["serve", "--host", "0.0.0.0", "--port", "8000", "--allow-env", "--allow-net", "--allow-read", "_fresh/server.js"]
