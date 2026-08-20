# Deploying the workflow to Kubernetes or Coolify

This turns `ai-job-search` from "an app you run on your laptop" into "an app
you exec into." The container image bundles the *tooling* the workflow
needs - Claude Code, Bun, Python, TinyTeX, git, gh - it does not bundle your
fork, your profile, or any secret. Those live in one persistent volume that
survives restarts; the image itself is safe to build and push to a public
registry.

It is **not** a background job runner: `/scrape`, `/apply`, `/interview` etc.
still require your judgment calls (see CLAUDE.md's evaluate-fit-first
workflow), so the container just sits idle (`sleep infinity`) until you exec
in and drive it interactively, exactly like running `claude` locally.

## What's in here

```
deploy/
├── Dockerfile           # the tooling image
├── entrypoint.sh         # clones your fork + installs CLI deps on first start
├── docker-compose.yml    # for Coolify, or plain `docker compose`
├── .env.example          # copy to .env for the compose path
└── k8s/
    ├── pvc.yaml
    ├── deployment.yaml
    └── secret.example.yaml   # copy to secret.yaml for the k8s path
```

## Option A: Coolify

1. In Coolify, create a new resource from your fork's git repo, type
   **Docker Compose**.
2. Set the **base directory** to `deploy/` so Coolify uses
   `deploy/docker-compose.yml` and only ever sends the `deploy/` folder as
   build context - nothing elsewhere in your repo (profile data, `.env` at
   the repo root, generated CVs) is part of the image.
3. Copy `deploy/.env.example` to `deploy/.env` locally, fill in `REPO_URL`
   at minimum, and set the same keys as Coolify environment variables for
   the resource (Coolify doesn't read a `.env` file sitting in git - the
   `.env.example` is a reference for which keys to add in its UI).
4. Deploy. Coolify creates the named `workspace` volume automatically.
5. Once running, use Coolify's built-in terminal (or `docker exec -it
   <container> bash`) to get a shell, then:
   ```bash
   cd /workspace/ai-job-search
   claude
   ```

## Option B: Kubernetes

```bash
# 1. Build and push the image to a registry your cluster can pull from
docker build -t <registry>/ai-job-search-devcontainer:latest deploy/
docker push <registry>/ai-job-search-devcontainer:latest

# 2. Fill in the secret
cp deploy/k8s/secret.example.yaml deploy/k8s/secret.yaml
# edit deploy/k8s/secret.yaml - at minimum set REPO_URL

# 3. Apply
kubectl apply -f deploy/k8s/pvc.yaml
kubectl apply -f deploy/k8s/secret.yaml
kubectl apply -f deploy/k8s/deployment.yaml
# edit deployment.yaml's `image:` field to match what you pushed in step 1 first

# 4. Exec in once the pod is Running
kubectl exec -it deploy/ai-job-search -- bash
cd /workspace/ai-job-search
claude
```

## First run, either platform

`entrypoint.sh` runs automatically on every container start:
1. Clones `REPO_URL` into `/workspace/ai-job-search` if it isn't already
   checked out there (skips this on every restart after the first).
2. Sets `git config --global user.name/user.email` from env vars, if set.
3. Runs `bun install` in every `.agents/skills/*/cli` directory, so all
   portal-search CLIs (including any you add later with `/add-portal`) are
   ready without a manual step.

Then exec in and run `claude` inside `/workspace/ai-job-search`. First run
prompts an interactive browser login (persisted afterward at
`/workspace/home/.claude*` - the container sets `$HOME` there, inside the
persistent volume, specifically so this survives restarts) unless you set
`ANTHROPIC_API_KEY`, which uses Console/API billing instead of your
Pro/Max/Team session - see
[Claude Code's authentication docs](https://code.claude.com/docs/en/authentication)
for the tradeoff. From there it's the same `/setup` → `/scrape` → `/apply`
→ `/interview` workflow as running locally.

## Private fork

The repo's own README recommends a **private** repo (with this project as
`upstream`) rather than a public fork, since `/setup` writes personal data
into tracked files. Two ways to clone a private repo into the container:

- **HTTPS token** (simpler): set `REPO_URL` to
  `https://<token>@github.com/<you>/ai-job-search.git`.
- **SSH deploy key**: set `REPO_URL` to the `git@github.com:...` form, mount
  your private key as a secret, and point `SSH_PRIVATE_KEY_FILE` at it -
  see the commented-out lines in `docker-compose.yml` and
  `k8s/deployment.yaml`.

## What's deliberately not automated

CV/cover-letter compilation still needs `lualatex`/`xelatex` run by hand (or
by Claude Code via the `/apply` workflow) - the image has TinyTeX installed
with the exact package set `SETUP.md` documents, but nothing auto-compiles
on a schedule. Same for `/scrape`: nothing cron-triggers it in this setup.
If you want unattended scheduled runs later, that's a different, bigger
piece of work (a headless agent with API billing) - this container is
scoped to "your workflow, off your laptop," not "your workflow, on
autopilot."
