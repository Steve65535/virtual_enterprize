FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV OPENCLAW_HOME=/opt/openclaw

# ── System packages ───────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    curl wget git sudo unzip zip \
    nano vim jq \
    python3 python3-pip \
    ca-certificates gnupg \
    libreoffice libreoffice-calc libreoffice-impress libreoffice-writer \
    poppler-utils ghostscript pandoc \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim tesseract-ocr-chi-tra \
    imagemagick \
    fonts-noto-cjk fonts-noto-cjk-extra \
    && rm -rf /var/lib/apt/lists/*

# ── Python office libraries ───────────────────────────────────────────────────
RUN pip3 install --no-cache-dir --break-system-packages \
    python-docx openpyxl python-pptx pypdf reportlab \
    pillow weasyprint requests beautifulsoup4 pandas

# ── OpenClaw runtime ──────────────────────────────────────────────────────────
COPY openclaw-pkg/ /opt/openclaw-runtime/
RUN cd /opt/openclaw-runtime && npm install --omit=dev --legacy-peer-deps
RUN printf '#!/bin/sh\nexec node /opt/openclaw-runtime/openclaw.mjs "$@"\n' > /usr/local/bin/openclaw \
    && chmod +x /usr/local/bin/openclaw \
    && openclaw --version

# ── OpenClaw config template (baked-in fallback) ─────────────────────────────
WORKDIR /opt/openclaw
COPY template/ /opt/openclaw/
RUN find /opt/openclaw -name "*.sh" -exec chmod +x {} \; \
    && chmod +x /opt/openclaw/claw_msg 2>/dev/null || true

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
CMD ["tail", "-f", "/dev/null"]
