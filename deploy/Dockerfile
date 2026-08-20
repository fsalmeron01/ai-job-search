# Portable dev container for ai-job-search.
#
# This image bundles the TOOLING this repo's workflow needs (Claude Code,
# Bun, Python, TinyTeX, git, gh) so you can run the workflow from a
# Kubernetes pod or a Coolify-deployed container instead of your laptop.
#
# It does NOT bake your fork, your profile data, or any secrets into the
# image — the image is safe to build and push to a registry. Your fork is
# cloned into a persistent volume at container start (see entrypoint.sh),
# so personal data only ever lives in that volume, never in an image layer.
FROM debian:bookworm-slim

ENV HOME=/root \
    DEBIAN_FRONTEND=noninteractive \
    PATH="/root/.local/bin:/root/.bun/bin:/root/.TinyTeX/bin/x86_64-linux:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates git gnupg unzip openssh-client \
      python3 python3-pip poppler-utils perl fontconfig \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI - used by the repo's fork/upstream-update workflow (SETUP.md
# section 8) and by /add-portal's optional PR steps. Not required for the
# core /scrape -> /apply -> /interview loop, but cheap to include.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Bun - runs every portal-search CLI under .agents/skills/*/cli
RUN curl -fsSL https://bun.sh/install | bash

# Claude Code - native installer, self-contained binary (no Node.js needed
# at runtime). See https://code.claude.com/docs/en/setup.
RUN curl -fsSL https://claude.ai/install.sh | bash

# TinyTeX - lualatex compiles the CV, xelatex compiles the cover letter.
# Package list matches SETUP.md's "Minimal TeX install" section exactly, so
# this image compiles the same templates the same way a laptop install does.
RUN curl -fsSL https://yihui.org/tinytex/install-bin-unix.sh | sh \
    && /root/.TinyTeX/bin/x86_64-linux/tlmgr install \
         moderncv fontawesome5 fontawesome6 academicons import luatexbase pgf \
         titlesec textpos xltxtra xunicode cite realscripts needspace

WORKDIR /workspace

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# Idle by default - you exec in and drive it interactively (kubectl exec,
# docker exec, or Coolify's built-in terminal). Not a service with a port.
CMD ["sleep", "infinity"]
