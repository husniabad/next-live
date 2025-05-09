# Use a Node.js base image
FROM node:18-slim

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock/pnpm-lock.yaml)
# to install dependencies. Use a wildcard to copy both if they exist.
COPY package*.json ./

# Install dependencies
RUN npm install --production 
# Install production dependencies

# Copy the rest of your backend source code
# Assuming your compiled JavaScript output is in a 'dist' directory
COPY . .

# Build the TypeScript code (if not already built in a previous stage/step)
# If you build locally before copying, you can remove this step.
# If you build inside the container, ensure dev dependencies are installed temporarily or use a multi-stage build.
# Example if building inside container (requires dev dependencies):
# COPY . .
# RUN npm install # Install all dependencies including dev for build
# RUN npm run build # Run your build command (e.g., tsc)
# Remove dev dependencies after build (optional but recommended for smaller image)
# RUN npm prune --production

# Expose the port your application listens on
# Cloud Run injects the PORT environment variable, your app must listen on it.
# The EXPOSE instruction is documentation, the runtime PORT variable is what matters.
EXPOSE 8080 
# Common practice, but your app should use process.env.PORT

# Command to run the application
# This should point to your compiled entry file (e.g., dist/index.js)
CMD ["node", "dist/index.js"]