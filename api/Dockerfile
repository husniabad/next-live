# --- Build Stage ---
# Use a Node.js image with build tools
FROM node:18 AS builder

# Set the working directory inside the build stage
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock/pnpm-lock.yaml)
COPY package*.json ./

# Install dependencies including devDependencies for building
RUN npm install

# Copy the rest of your backend source code
COPY . .

# Build the TypeScript code
# This command runs your TypeScript compiler (e.g., tsc)
# NOTE: This step is effectively bypassed by the cloudbuild.yaml configuration below
RUN npm run build

# --- Production Stage ---
# Use a smaller, production-ready base image
FROM node:18-slim

# Set the working directory inside the final stage
WORKDIR /app

# Copy only production dependencies from the build stage
# This is more efficient than running npm install again
COPY --from=builder /app/node_modules ./node_modules

# Copy the compiled JavaScript output from the build stage
# NOTE: The 'dist' directory will be copied from the Cloud Build workspace in cloudbuild.yaml
# This COPY command is here for documentation but the actual copy happens in cloudbuild.yaml
COPY --from=builder /app/dist ./dist

# Copy other necessary files for runtime (like prisma schema, .env if used at runtime)
# Adjust these COPY commands based on what your application needs at runtime
# For example, if your app reads schema.prisma at runtime:
# COPY --from=builder /app/prisma ./prisma
# If your app reads a .env file at runtime (though Cloud Run env vars are preferred):
# COPY --from=builder /app/.env ./.env


# Expose the port your application listens on
# Cloud Run injects the PORT environment variable, your app must listen on it.
# The EXPOSE instruction is documentation, the runtime PORT variable is what matters.
EXPOSE 8080 # Common practice, but your app should use process.env.PORT

# Command to run the application
# This should point to your compiled entry file (e.js., dist/index.js)
CMD ["node", "dist/index.js"]
