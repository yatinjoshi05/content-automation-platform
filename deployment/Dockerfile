# Dockerfile for Content Automation Backend Services & Workers
# Uses official Node.js 24 LTS slim image with PostgreSQL client and FFmpeg installed
FROM node:24-bookworm-slim

# Install system utilities: PostgreSQL client, FFmpeg, FFprobe, and curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy application files
COPY package*.json ./
COPY server/ ./server/
COPY workers/ ./workers/
COPY scripts/ ./scripts/
COPY config/.env.example ./config/.env.example
COPY database/ ./database/
COPY deployment/ ./deployment/
COPY workflows/ ./workflows/

# Create work directories for QA and media processing
RUN mkdir -p /app/qa_work /app/scratch /app/logs

# Set default environment variables
ENV NODE_ENV=production
ENV FRONTEND_PORT=3001
ENV QA_WORKER_PORT=9100
ENV ORIGINAL_GENERATOR_PORT=9200
ENV QA_WORK_DIR=/app/qa_work
ENV PSQL_CMD=psql
ENV FFMPEG_CMD=ffmpeg
ENV FFPROBE_CMD=ffprobe

EXPOSE 3001 9100 9200

# Start Express server by default; can be overridden per service in docker-compose
CMD ["node", "server/index.js"]
