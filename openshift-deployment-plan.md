# OpenShift Deployment Plan — MAS AI Assistant

## Overview

Deploy the MAS AI Assistant (Node.js Express + pre-built React UI) to OpenShift using the
cluster's built-in build pipeline (BuildConfig / ImageStream). All credentials are managed
as an OpenShift Secret. A PersistentVolumeClaim is mounted at `/app/data` so that `.env`
changes made via the Settings modal (map location) survive pod restarts without shadowing
the application files baked into the image.

**Target namespace:** `mas-salmai-assistant`
**GitHub repo:** `https://github.com/JanWillemSteur65/mas-ai-assistant` (public — no pull secret needed)

**Scope:**
- Minimal code change: redirect `.env` path in `server.js` to `/app/data/.env`
- Add a `Dockerfile` with a multi-stage build (UI build + runtime)
- Add a `.dockerignore`
- Add OpenShift manifests: `ImageStream`, `BuildConfig`, `Secret`, `Deployment`,
  `Service`, `Route`, `PersistentVolumeClaim`
- Fix the non-root user requirement (OpenShift rejects root containers)

**Non-goals:**
- No other changes to application logic or the UI
- No CI/CD pipeline (GitHub Actions) — cluster BuildConfig is used instead
- No Helm chart or Kustomize overlay

---

## Sub-Task 1 — Patch `server.js` — redirect `.env` to `/app/data/.env`

**Status:** [x] done

### Intent
Move the `.env` file path from the application directory (`__dirname + '/.env'`) to a
dedicated data directory (`/app/data/.env`). This allows the PVC to be mounted at the
narrow `/app/data` path without shadowing `server.js` or `ui/dist/` from the image.

Only two lines in `server.js` need to change:
- Line 2 — the `dotenv.config()` call
- Line 29 — the `envPath` constant inside `updateEnv()`

The `/app/data` directory must be created in the Dockerfile so it exists even when the
PVC is not mounted (e.g. local development).

### Expected Outcomes
- `server.js` reads `.env` from `/app/data/.env` when `NODE_ENV=production`
- `updateEnv()` writes map settings back to `/app/data/.env`
- Local development still works (dotenv falls back gracefully when the file is absent)

### Todo List
1. In `server.js` line 2, change:
   ```js
   require('dotenv').config({ path: __dirname + '/.env' })
   ```
   to:
   ```js
   require('dotenv').config({ path: process.env.ENV_PATH || __dirname + '/.env' })
   ```
2. In `server.js` inside `updateEnv()` (line ~29), change:
   ```js
   const envPath = path.join(__dirname, '.env')
   ```
   to:
   ```js
   const envPath = process.env.ENV_PATH || path.join(__dirname, '.env')
   ```
3. In `Dockerfile` (Sub-Task 2), add `RUN mkdir -p /app/data && chown node:node /app/data`
4. In `deployment.yaml` (Sub-Task 3), set env var `ENV_PATH=/app/data/.env` and mount
   the PVC at `/app/data`

### Relevant Context
- [`server.js:2`](server.js:2) — `dotenv.config` call
- [`server.js:26`](server.js:26) — `updateEnv()` function; `envPath` constant at ~line 29
- Using `ENV_PATH` env var means local dev is unchanged (no `ENV_PATH` set → old path used)

---

## Sub-Task 2 — Add `Dockerfile` and `.dockerignore`

**Status:** [x] done

### Intent
Create a multi-stage `Dockerfile` that:
1. Builds the React UI (`ui/dist/`) inside the container using the official Node image
2. Produces a lean runtime image that runs as a non-root user (required by OpenShift)

The `.dockerignore` prevents `node_modules`, `ui/node_modules`, `ui/dist`, `.env`,
`*.log`, and `.git` from being copied into the build context, keeping the image small
and secrets-free.

### Expected Outcomes
- `docker build .` (or `podman build .`) succeeds locally
- The resulting image listens on port 3737 and serves the UI at `/`
- The image runs as the built-in `node` user (UID 1000), not root
- `.env` is not baked into the image

### Todo List
1. Create `Dockerfile` at repo root with two stages:
   - **Stage 1 (`ui-builder`):** `node:20-alpine`, copy `ui/`, run `npm ci` + `npm run build`
   - **Stage 2 (runtime):** `node:20-alpine`, `WORKDIR /app`, copy `package*.json`,
     run `npm ci --omit=dev`, copy `server.js`, copy `ui/dist` from stage 1
   - Add `RUN mkdir -p /app/data && chown -R node:node /app` before `USER node`
   - Set `EXPOSE 3737`, `USER node`, `CMD ["node", "server.js"]`
2. Create `.dockerignore` excluding: `node_modules`, `ui/node_modules`, `ui/dist`,
   `.env`, `*.log`, `server.log`, `.git`, `.DS_Store`, `docs/`, `openshift/`

### Relevant Context
- [`server.js:1505`](server.js:1505) — `app.listen(PORT, '0.0.0.0')` already binds to all interfaces
- [`server.js:1495`](server.js:1495) — serves `ui/dist/index.html` as SPA fallback
- [`package.json`](package.json) — `npm start` runs `node server.js`
- [`ui/vite.config.js`](ui/vite.config.js) — build outputs to `ui/dist`

---

## Sub-Task 3 — Add OpenShift manifests directory

**Status:** [x] done

### Intent
Create an `openshift/` directory containing all Kubernetes/OpenShift YAML manifests needed
to deploy the application from the cluster's internal registry. Files are ordered by
apply sequence. All resources target the `mas-salmai-assistant` namespace.

### Expected Outcomes
- Running `oc apply -f openshift/` deploys the full application to namespace `mas-salmai-assistant`
- The app is reachable via an HTTPS Route (TLS terminated at the OpenShift edge router)
- Credentials are stored in a Secret, never in the image
- Map location settings (`.env` on disk at `/app/data/.env`) survive pod restarts via PVC

### Todo List
Create the following files inside `openshift/`:

1. **`imagestream.yaml`** — `ImageStream` named `mas-assistant` in namespace `mas-salmai-assistant`;
   defines the in-cluster image repository that the BuildConfig will push to

2. **`buildconfig.yaml`** — `BuildConfig` in namespace `mas-salmai-assistant` that:
   - Sources from the **public** GitHub repo `https://github.com/JanWillemSteur65/mas-ai-assistant`
     (no pull secret needed)
   - Uses the `Dockerfile` strategy
   - Outputs to the `mas-assistant:latest` ImageStream tag

3. **`secret.yaml`** — `Secret` (type `Opaque`) named `mas-assistant-secret` in namespace
   `mas-salmai-assistant` with `stringData` placeholders for all 15 environment variables:
   `PORT`, `MAXIMO_URL`, `MAXIMO_AUTH_TYPE`, `MAXIMO_API_KEY`, `MAXIMO_USER`,
   `MAXIMO_PASSWORD`, `MAXIMO_SITE`, `MAXIMO_ORG`, `MAP_ADDRESS`, `MAP_LAT`,
   `MAP_LNG`, `WX_URL`, `WX_API_KEY`, `WX_PROJECT_ID`, `WX_MODEL`
   Also include `ENV_PATH=/app/data/.env` in the Secret.

4. **`pvc.yaml`** — `PersistentVolumeClaim` named `mas-assistant-pvc` in namespace
   `mas-salmai-assistant`, `accessModes: [ReadWriteOnce]`, `storage: 100Mi`

5. **`deployment.yaml`** — `Deployment` in namespace `mas-salmai-assistant` with:
   - Image from internal registry:
     `image-registry.openshift-image-registry.svc:5000/mas-salmai-assistant/mas-assistant:latest`
   - `envFrom.secretRef` pointing to `mas-assistant-secret`
   - Volume mount of `mas-assistant-pvc` at `/app/data` (narrow mount — does not shadow app files)
   - `readinessProbe` on `GET /api/settings` port 3737
   - `resources.requests` / `resources.limits`: 256Mi / 512Mi memory, 100m / 500m CPU

6. **`service.yaml`** — `Service` in namespace `mas-salmai-assistant` exposing port 80 → targetPort 3737

7. **`route.yaml`** — `Route` in namespace `mas-salmai-assistant` with `tls.termination: edge`
   and `insecureEdgeTerminationPolicy: Redirect`

### Relevant Context
- All 15 env vars identified in sub-agent research (see table below)
- PVC mounted at `/app/data` — only the data dir is writable, app files stay from image
- `ENV_PATH=/app/data/.env` passed via Secret tells `server.js` where to find/write `.env`
- [`server.js:26`](server.js:26) — `updateEnv()` uses `ENV_PATH` after Sub-Task 1 patch

#### Environment variable reference

| Variable | Required | Default |
|---|---|---|
| `PORT` | no | `3737` |
| `MAXIMO_URL` | **yes** | — |
| `MAXIMO_AUTH_TYPE` | no | `apikey` |
| `MAXIMO_API_KEY` | if apikey auth | — |
| `MAXIMO_USER` | if basic auth | — |
| `MAXIMO_PASSWORD` | if basic auth | — |
| `MAXIMO_SITE` | no | — |
| `MAXIMO_ORG` | no | — |
| `MAP_ADDRESS` | no | — |
| `MAP_LAT` | no | — |
| `MAP_LNG` | no | — |
| `WX_URL` | no | — |
| `WX_API_KEY` | no | — |
| `WX_PROJECT_ID` | no | — |
| `WX_MODEL` | no | `ibm/granite-4-h-small` |

---

## Sub-Task 4 — Add `openshift/README.md` deploy guide

**Status:** [x] done

### Intent
Write a concise step-by-step guide so any team member can deploy the app to OpenShift
without needing to read all the manifest files. It covers: login, namespace setup,
secret population, triggering the build, and verifying the Route.

### Expected Outcomes
- A developer unfamiliar with the app can deploy it end-to-end by following the README
- The guide explains how to update credentials (edit Secret → rollout restart)
- The guide explains how to trigger a rebuild (after code changes)

### Todo List
1. Create `openshift/README.md` with sections:
   - **Prerequisites** — `oc` CLI, cluster access, namespace `mas-salmai-assistant`
   - **Step 1** — `oc project mas-salmai-assistant` (create if needed: `oc new-project mas-salmai-assistant`)
   - **Step 2** — `oc apply -f openshift/imagestream.yaml -f openshift/buildconfig.yaml`
   - **Step 3** — Edit `openshift/secret.yaml` with real credentials, then `oc apply -f openshift/secret.yaml`
   - **Step 4** — `oc apply -f openshift/pvc.yaml -f openshift/deployment.yaml -f openshift/service.yaml -f openshift/route.yaml`
   - **Step 5** — Trigger the build: `oc start-build mas-assistant --follow`
   - **Step 6** — Get the Route URL: `oc get route mas-assistant -o jsonpath='{.spec.host}'`
   - **Updating credentials** — `oc edit secret mas-assistant-secret` → `oc rollout restart deployment/mas-assistant`
   - **Rebuilding after code changes** — `oc start-build mas-assistant --follow`

### Relevant Context
- Manifests in `openshift/` from Sub-Task 3
- OpenShift BuildConfig source is the public GitHub repo (no pull secret required)

---

## Apply Sequence

```bash
oc project mas-salmai-assistant   # or: oc new-project mas-salmai-assistant

oc apply -f openshift/imagestream.yaml
oc apply -f openshift/buildconfig.yaml
# Edit openshift/secret.yaml with real values first:
oc apply -f openshift/secret.yaml
oc apply -f openshift/pvc.yaml
oc apply -f openshift/deployment.yaml
oc apply -f openshift/service.yaml
oc apply -f openshift/route.yaml
oc start-build mas-assistant --follow
```

---

## Files to Create

| File | Sub-Task | Description |
|---|---|---|
| `server.js` | 1 | 2-line patch — `ENV_PATH` for `.env` location |
| `Dockerfile` | 2 | Multi-stage image build |
| `.dockerignore` | 2 | Excludes secrets, build artifacts, dev files |
| `openshift/imagestream.yaml` | 3 | In-cluster image repository |
| `openshift/buildconfig.yaml` | 3 | Cluster build from public GitHub source |
| `openshift/secret.yaml` | 3 | Credential placeholders (15 vars + ENV_PATH) |
| `openshift/pvc.yaml` | 3 | 100Mi volume mounted at /app/data |
| `openshift/deployment.yaml` | 3 | Pod spec with Secret + PVC at /app/data |
| `openshift/service.yaml` | 3 | Internal ClusterIP service |
| `openshift/route.yaml` | 3 | HTTPS edge-terminated Route |
| `openshift/README.md` | 4 | Step-by-step deploy guide |
