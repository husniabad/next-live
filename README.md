# Next Live

A platform for building, deploying, and hosting web applications, inspired by platforms like Vercel. Next Live aims to simplify the process of getting your code from repository to live URL.

## Features

* Connect with Git providers (currently GitHub).
* Automatically detect and build applications using Docker.
* Support for custom Dockerfiles.
* Asynchronous deployment processing with concurrency limits.
* Dynamic Nginx proxy configuration for deployed applications.
* Status tracking for deployments via API.

## Technology Stack

* **Backend:** Node.js, TypeScript, GraphQL (Apollo Server)
* **Database:** PostgreSQL (with Prisma ORM)
* **Build & Containerization:** Docker
* **Process Management:** PM2
* **Reverse Proxy:** Nginx
* **Authentication:** JWT, OAuth (GitHub)
* **Utilities:** Custom in-memory queue

## Requirements

* **Operating System:** Linux or Windows Subsystem for Linux (WSL 2). The backend is designed to run in a Linux environment.
* **Node.js:** Version 18 or higher.
* **npm or Yarn or pnpm:** A Node.js package manager.
* **Docker:** Docker Engine must be installed and running. The user running the backend process must have permissions to interact with the Docker daemon (e.g., be in the `docker` group).
* **PostgreSQL:** A running PostgreSQL database instance.
* **PM2:** PM2 must be installed globally and running as a daemon. The user running the backend process must have permissions to manage PM2 processes.
* **Nginx:** Nginx must be installed and running. The user running the backend process must have `NOPASSWD` `sudo` permissions configured for specific Nginx commands (`nginx -s reload`, `tee`, `ln -sf`) to allow dynamic configuration updates.
* **Git:** Git must be installed.

## Installation (API Backend)

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd next-live/api # Or wherever your API code is located
    ```
    **Note:** If using WSL 2, it is highly recommended to clone the repository into your native WSL 2 filesystem (e.g., `/home/youruser/next-live/api`) rather than a mounted Windows drive (`/mnt/c/`, `/mnt/d/`) to avoid permission issues with tools like Git and Prisma.

2.  **Install dependencies:**
    ```bash
    npm install # or yarn install or pnpm install
    ```

3.  **Set up the database:**
    * Ensure your PostgreSQL database is running.
    * Configure your database connection URL in a `.env` file in the `api` directory. Example:
        ```env
        DATABASE_URL="postgresql://user:password@host:port/database?schema=public"
        ```
    * Run Prisma migrations to create the database schema:
        ```bash
        npx prisma migrate dev --name initial_setup
        ```

4.  **Configure environment variables:**
    * Create a `.env` file in the `api` directory.
    * Add your database URL (as above).
    * Add your JWT secret and GitHub OAuth credentials:
        ```env
        JWT_SECRET="your_super_secret_jwt_key"
        GITHUB_CLIENT_ID="your_github_client_id"
        GITHUB_CLIENT_SECRET="your_github_client_secret"
        # Add any other necessary environment variables
        ```

5.  **Configure User Permissions (Crucial for Linux/WSL 2):**
    * Ensure the user running your Node.js backend process (e.g., `deploy_user`) is added to the `docker` group:
        ```bash
        sudo usermod -aG docker your_backend_user
        ```
        (Replace `your_backend_user` with the actual username. You may need to log out and back in to WSL 2 for this to take effect).
    * Configure `NOPASSWD` sudo access for the backend user in `/etc/sudoers` for Nginx commands. Use `sudo visudo` and add lines like:
        ```
        your_backend_user ALL=NOPASSWD: /usr/sbin/nginx -s reload
        your_backend_user ALL=NOPASSWD: /usr/bin/tee /etc/nginx/sites-available/deploy-*.conf
        your_backend_user ALL=NOPASSWD: /usr/bin/ln -sf /etc/nginx/sites-available/deploy-*.conf /etc/nginx/sites-enabled/deploy-*.conf
        ```
        (Confirm the exact paths to `nginx`, `tee`, and `ln` using `which <command>`).

6.  **Build the TypeScript code:**
    ```bash
    npm run build # or your build command
    ```

7.  **Run the API:**
    ```bash
    npm run dev # For development with ts-node
    # or for production:
    # pm2 start dist/index.js --name next-live-api
    ```
    Ensure PM2 is running if using the production command (`pm2 status`).

## Installation (Web Frontend)

1.  Navigate to the Web directory: `cd ../web` (or wherever your Web code is).
2.  Install dependencies: `npm install`
3.  Configure environment variables (e.g., API endpoint URL).
4.  Run the Web: `npm run dev`

## Usage

* **Create a new project:** Use the Web or GraphQL mutation `createProject` to add a project with a Git repository URL.
* **Deploy a project:** Use the Web or GraphQL mutation `deployProject` with the project ID. The API will return a pending deployment record, and the deployment process will run in the background.
* **Monitor Deployment Status:** Use the GraphQL query `deploymentStatus(id: Int!)` to fetch the current status and details of a deployment.
* **Manage Domains:** (Future Feature)

## Future Features

* **S3 Storage:** Store build artifacts in an S3 bucket instead of the local filesystem for better scalability and durability.
* **Enhanced Dockerfile Support:** Improve detection and handling of user-provided Dockerfiles for various application types.
* **Automated Next.js Configuration:** Automatically detect Next.js projects and potentially inject/modify `next.config.js` to ensure `output: "standalone"` is enabled for optimized builds (requires careful implementation).
* **Custom Domains:** Allow users to link their own domain names to deployed applications.
* **Environment Variable Management:** Provide a secure way for users to manage environment variables for their deployed applications.
* **Build Logs Streaming:** Stream build and deployment logs back to the Web interface in real-time.
* **Deployment Rollbacks:** Implement functionality to revert to a previous successful deployment version.
* **Support for Other Frameworks/Languages:** Extend support beyond Next.js to other popular frameworks (React, Vue, Angular) and languages (Python, Go, Ruby) with appropriate build and serving strategies.
* **Monitoring and Alerting:** Add monitoring for deployed applications and the platform infrastructure.

## License

[MIT License]
