# Dockerfile for Puppeteer Microservice

# Use a Node.js base image with a specific platform
FROM --platform=linux/amd64 node:18-slim

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -yq \
    libgbm-dev \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
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
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    --no-install-recommends

# Set the working directory
WORKDIR /usr/src/app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package.json and package-lock.json
COPY puppeteer-ms/package.json puppeteer-ms/package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY puppeteer-ms/ .

# Expose the port the app runs on
EXPOSE 5200

# Command to run the application
CMD ["node", "server.js"]
