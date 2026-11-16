# OpenShift Deployment — MAS AI Assistant

Namespace: **`mas-salmai-assistant`**

---

## Prerequisites

- `oc` CLI installed and logged in to your OpenShift cluster
- Cluster permissions to create Projects, BuildConfigs, Deployments, Routes, and PVCs

---

## Step 1 — Set the target namespace

```bash
# If the project does not exist yet:
oc new-project mas-salmai-assistant

# If it already exists:
oc project mas-salmai-assistant
```

---

## Step 2 — Create the ImageStream and BuildConfig

```bash
oc apply -f openshift/imagestream.yaml
oc apply -f openshift/buildconfig.yaml
```

This registers the in-cluster image repository and configures the build pipeline to pull
from the public GitHub repo `https://github.com/JanWillemSteur65/mas-ai-assistant`.

---

## Step 3 — Populate and apply the Secret

Open `openshift/secret.yaml` and replace the placeholder values with your real credentials:

| Key | Description |
|---|---|
| `MAXIMO_URL` | Full API URL, e.g. `https://mymas.manage.apps.example.com/maximo/api` |
| `MAXIMO_AUTH_TYPE` | `apikey` or `basic` |
| `MAXIMO_API_KEY` | Your Maximo API key (if using apikey auth) |
| `MAXIMO_USER` / `MAXIMO_PASSWORD` | Your username/password (if using basic auth) |
| `MAXIMO_SITE` | Default site ID, e.g. `BEDFORD` |
| `MAXIMO_ORG` | Default org ID, e.g. `EAGLENA` |
| `WX_URL` / `WX_API_KEY` / `WX_PROJECT_ID` | watsonx.ai credentials (optional — enables Granite AI) |

> ⚠️ **Never commit `secret.yaml` with real credentials to Git.**

```bash
oc apply -f openshift/secret.yaml
```

---

## Step 4 — Apply remaining manifests

```bash
oc apply -f openshift/pvc.yaml
oc apply -f openshift/deployment.yaml
oc apply -f openshift/service.yaml
oc apply -f openshift/route.yaml
```

---

## Step 5 — Trigger the first build

```bash
oc start-build mas-assistant --follow
```

This builds the container image inside the cluster using the `Dockerfile` in the repo.
The build takes 2–5 minutes (UI compilation included). Watch the logs until you see
`Push successful`.

---

## Step 6 — Get the application URL

```bash
oc get route mas-assistant -o jsonpath='{.spec.host}'
```

Open `https://<host>` in your browser. The UI should load within a few seconds of the
Deployment becoming ready:

```bash
oc rollout status deployment/mas-assistant
```

---

## Updating credentials

```bash
# Edit the secret in-cluster
oc edit secret mas-assistant-secret

# Restart the pod to pick up the new values
oc rollout restart deployment/mas-assistant
```

---

## Rebuilding after code changes

Push your changes to the `main` branch of the GitHub repo, then:

```bash
oc start-build mas-assistant --follow
```

The Deployment will automatically roll out the new image once the build completes
(the `ImageChange` trigger is active).

---

## Architecture

```
GitHub repo (public)
       │
       ▼
  BuildConfig  ──builds──►  ImageStream (mas-assistant:latest)
                                    │
                                    ▼
                             Deployment (pod)
                             ├── Secret  → env vars (credentials)
                             └── PVC     → /app/data (.env persistence)
                                    │
                                    ▼
                              Service (port 80)
                                    │
                                    ▼
                           Route (HTTPS edge TLS)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails at `npm ci` | Check Node/npm version in `Dockerfile`; ensure `package-lock.json` is committed |
| Pod stuck in `Pending` | PVC not bound — check storage class: `oc get pvc` |
| `ImagePullBackOff` | Build not complete or failed — `oc get builds` / `oc logs build/mas-assistant-1` |
| `401 Unauthorized` from Maximo | Wrong `MAXIMO_API_KEY` — update Secret and restart |
| Route not accessible | Check TLS cert on the OpenShift router; try `oc get route` for the full hostname |
