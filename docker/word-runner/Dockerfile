# word-runner: per-job Docker image for Word generation
# build: bash docker/word-runner/build.sh

ARG BASE_REGISTRY=docker.m.daocloud.io/library
FROM ${BASE_REGISTRY}/python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg \
    nodejs npm \
    git \
    poppler-utils \
    chromium \
    libreoffice-writer \
    python3-uno \
    fonts-noto-cjk fonts-noto-cjk-extra fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Claude CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# OfficeCLI
RUN curl -fsSL https://d.officecli.ai/install.sh | bash

# word-master plugin
COPY word-master/ /opt/word-master/

ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
RUN pip install --no-cache-dir --index-url "${PIP_INDEX_URL}" \
    pypdf>=4.0 \
    pdfplumber>=0.11 \
    requests>=2.31 \
    lxml>=5.0

COPY docker/word-runner/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN useradd --create-home --uid 1000 --shell /bin/bash claude \
    && mkdir -p /home/claude/.local \
    && cp -r /root/.local/share /home/claude/.local/ 2>/dev/null || true \
    && cp -r /root/.local/bin /home/claude/.local/ \
    && chown -R claude:claude /home/claude/.local \
    && rm -rf /root/.local \
    && find /home/claude/.local/bin -type l -exec sh -c 'target=$(readlink "$1"); case "$target" in /root/*) ln -sf "/home/claude${target#/root}" "$1";; esac' _ {} \;
ENV PATH="/home/claude/.local/bin:${PATH}"

WORKDIR /opt/word-master
USER claude
ENTRYPOINT ["/entrypoint.sh"]
HEALTHCHECK NONE
