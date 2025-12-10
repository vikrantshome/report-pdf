# Use a Node.js 20 base image for better performance and security
FROM --platform=linux/amd64 node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies required for @sparticuz/chromium
# This is a more minimal set of dependencies
RUN apt-get update && apt-get install -yq \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy the rest of your application code
COPY . .

# The server listens on the PORT environment variable, which Cloud Run provides.
# Exposing 8080 is good practice for Cloud Run.
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]