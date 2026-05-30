# ESL Glove Backend Hosting Guide

This document summarizes the necessary steps, considerations, and required changes to successfully host the ESL Glove Node.js backend. You can use this guide as a checklist and a reference when working with other agents to deploy the system.

## 1. Required Code Changes Before Deployment

Before deploying to a production environment, a few minor adjustments are needed in the backend codebase:

### A. Add a Start Script
Most hosting platforms (like Render, Railway, or Heroku) look for a `start` script in `package.json` to launch the application.
**Action:** Add `"start": "node server.js"` to the `"scripts"` section of `package.json`.

```json
"scripts": {
  "start": "node server.js",
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

### B. Update CORS Policy for Production
Currently, `server.js` hardcodes the frontend origin to `http://localhost:3000`. This will block requests from a hosted frontend.
**Action:** Update the CORS settings in `server.js` to use an environment variable.

```javascript
// In server.js
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "DELETE"]
}));

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL, 
        methods: ["GET", "POST"]
    }
});
```

## 2. Environment Variables Checklist

The backend requires the following environment variables to be set in your hosting platform's dashboard:

| Variable | Description |
| :--- | :--- |
| `PORT` | The port the server will run on (Usually provided automatically by the hosting platform). |
| `DATABASE_URL` | Your PostgreSQL connection string. |
| `SUPABASE_URL` | The URL for your Supabase project instance. |
| `SUPABASE_STORAGE_URL` | The base URL for downloading files from Supabase storage. |
| `SERVICE_ROLE_KEY` | Supabase service role key (needed to bypass row-level security for certain operations). |
| `FRONTEND_URL` | (Recommended to add) The deployed URL of your frontend application to allow CORS. |

## 3. Recommended Hosting Platforms

Since the backend utilizes **Socket.IO** for real-time communication, it requires a long-lived server process. **Serverless environments (like Vercel or Netlify functions) are NOT recommended** as they drop WebSocket connections. 

Here are the best options:

### Option A: Platform as a Service (PaaS) - *Easiest & Recommended*
Platforms like **Render**, **Railway**, or **Heroku** abstract away the server configuration. They will automatically detect your Node.js app, install dependencies, and run it.

**Steps for PaaS (e.g., Render/Railway):**
1. Push your backend code to a GitHub repository.
2. Log into Render/Railway and create a new "Web Service".
3. Connect your GitHub repository.
4. The platform will auto-detect Node.js. Ensure the build command is `npm install` and the start command is `npm start` (or `node server.js`).
5. Input your Environment Variables in the platform's dashboard.
6. Deploy. The platform will provide you with a live HTTPS URL.

### Option B: Virtual Private Server (VPS) - *More Control & Cheaper at Scale*
Using a VPS provider like **DigitalOcean (Droplet)**, **AWS (EC2)**, or **Linode**.

**Steps for VPS:**
1. Provision a Linux server (e.g., Ubuntu).
2. SSH into the server and install Node.js and Git.
3. Clone your backend repository.
4. Run `npm install`.
5. Create a `.env` file with your production variables.
6. Install `pm2` (`npm install -g pm2`) to keep the Node.js process running in the background and restart it on crashes.
7. Start the app: `pm2 start server.js --name "esl-backend"`.
8. (Optional but recommended) Set up **Nginx** as a reverse proxy to route port 80/443 traffic to your Node.js port (e.g., 3001) and secure it with an SSL certificate using Let's Encrypt.

## 4. Special Considerations for Socket.IO

- **WebSockets Support:** Ensure the hosting provider explicitly supports WebSockets (Render, Railway, and VPS all do).
- **Scaling:** If you ever need to scale the backend to run on multiple instances (horizontal scaling), you will need to implement **Sticky Sessions** on your load balancer, or use a **Redis Adapter** for Socket.IO so that events broadcasted on one instance reach clients connected to another. For a single instance (which is usually fine to start), this is not required.

## 5. Security Measures

Even for a simple backend, implementing basic security practices is crucial to prevent abuse and data leaks:

### A. HTTP Security Headers (Helmet)
Install the `helmet` package (`npm install helmet`) and add it to your Express app to automatically set secure HTTP headers and protect against well-known web vulnerabilities.
```javascript
const helmet = require('helmet');
app.use(helmet());
```

### B. Rate Limiting
To prevent brute-force attacks or your API being flooded with requests (which could run up your database bills), implement a rate limiter using `express-rate-limit`.
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
});
app.use(limiter);
```

### C. Environment Variables (.env)
Double-check that your `.env` file is listed in your `.gitignore` file. Never commit sensitive keys (like `DATABASE_URL` or `SERVICE_ROLE_KEY`) to version control. 

### D. CORS and Socket.IO Origin Validation
As mentioned in the code changes, never use `*` (allow all) for your CORS origins in production. Always explicitly define your `FRONTEND_URL` so that malicious sites cannot make requests on behalf of your users.

## 6. Docker & CI/CD Strategy

### Should you start by Dockerizing?
**It depends on your hosting choice.** 
- **If using Render or Railway (PaaS):** You **do not** need to Dockerize right now. These platforms have excellent native Node.js support. They will detect your `package.json` and automatically build and deploy your app. Dockerizing adds unnecessary complexity for a simple app on these platforms.
- **If using a VPS (DigitalOcean/AWS):** Dockerizing is highly recommended. It ensures consistency across your local environment and the server, making deployments much cleaner.

**Simple Dockerfile Example (If you choose to Dockerize):**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### What about CI/CD?
Yes, having a basic CI/CD pipeline is a great idea, even for simple projects. 
- **PaaS Auto-Deploy:** If you use Render or Railway, basic CI/CD is built-in. Every time you push code to your `main` branch on GitHub, the platform automatically triggers a build and deploys the new version with zero downtime. This is the easiest form of CI/CD and is recommended to start with.
- **GitHub Actions (Optional addition):** You can add a simple GitHub Actions workflow (`.github/workflows/test.yml`) to automatically run code linting or basic tests before code is merged into `main`. This prevents broken code from being deployed.

## 7. Next Steps

1. Make the recommended `package.json`, CORS, and security code changes (`helmet`, `express-rate-limit`).
2. Commit and push the changes to GitHub (ensuring `.env` is ignored).
3. Choose a hosting platform (Render or Railway recommended for simplicity and built-in CI/CD).
4. Deploy the backend and obtain the live API URL.
5. Move on to deploying the frontend, plugging in the live backend API URL into the frontend's configuration.
