ARG NODE_BASE_IMAGE=node:22-bookworm-slim
FROM ${NODE_BASE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/message/package.json ./packages/message/package.json
COPY packages/source/package.json ./packages/source/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/web/package.json ./packages/web/package.json
COPY packages/world/package.json ./packages/world/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .

ARG YUIJU_BUILD_CONFIG_TEMPLATE=yuiju.config.docker.ts.example
RUN cp ${YUIJU_BUILD_CONFIG_TEMPLATE} yuiju.config.ts && pnpm run build:web

FROM base AS runner

ENV NODE_ENV=production

COPY --from=build /app /app

EXPOSE 3010

CMD ["pnpm", "exec", "pm2-runtime", "ecosystem.docker.config.js"]
