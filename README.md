<p align="center" style="padding: 5rem;">
  <img src="https://img.shields.io/badge/Status-Actively%20Developed-blue.svg?style=for-the-badge" alt="Project Status">&nbsp;&nbsp;
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js Version Requirement">&nbsp;&nbsp;
  <a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/TypeScript-007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript Official Website"></a>&nbsp;&nbsp;
  <a href="https://graphql.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/GraphQL-E10098.svg?style=for-the-badge&logo=graphql&logoColor=white" alt="GraphQL Official Website"></a>&nbsp;&nbsp;
  <a href="https://www.apollographql.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/GraphQL%20Server-Apollo%20Server-311C87.svg?style=for-the-badge&logo=apollographql&logoColor=white" alt="Apollo Server Official Website"></a>&nbsp;&nbsp;
  <a href="https://www.postgresql.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Database-PostgreSQL-316192.svg?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL Official Website"></a>&nbsp;&nbsp;
  <a href="https://www.prisma.io/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/ORM-Prisma-0C344B.svg?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma ORM Official Website"></a>&nbsp;&nbsp;
  <a href="https://www.docker.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Containerization-Docker-2496ED.svg?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Official Website"></a>&nbsp;&nbsp;
  <a href="https://pm2.keymetrics.io/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Process%20Manager-PM2-2B037A.svg?style=for-the-badge&logo=pm2&logoColor=white" alt="PM2 Official Website"></a>&nbsp;&nbsp;
  <a href="https://nginx.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Reverse%20Proxy-Nginx-009639.svg?style=for-the-badge&logo=nginx&logoColor=white" alt="Nginx Official Website"></a>&nbsp;&nbsp;
  <a href="https://github.com/husniabad/next-live/stargazers" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/github/stars/husniabad/next-live?style=for-the-badge&logo=github&color=yellow" alt="GitHub Stars"></a>&nbsp;&nbsp;
  <a href="https://github.com/husniabad/next-live/network/members" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/github/forks/husniabad/next-live?style=for-the-badge&logo=github&color=orange" alt="GitHub Forks"></a>&nbsp;&nbsp;
  <a href="https://github.com/husniabad/next-live/issues" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/github/issues/husniabad/next-live?style=for-the-badge&logo=github&color=red" alt="GitHub Open Issues"></a>&nbsp;&nbsp;
  <a href="https://github.com/husniabad/next-live/pulls" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge" alt="PRs Welcome"></a>
</p>
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
