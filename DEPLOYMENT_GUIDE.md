# ACEITEKA EBMIS Deployment Guide

This guide covers a production deployment for the ACEITEKA EBMIS stack: PostgreSQL, the Express API, and the Vite React frontend.

## 1. Requirements

- Node.js 20 LTS or newer
- PostgreSQL 16+ (managed or self-hosted)
- Linux/macOS/Windows server with outbound network access
- HTTPS certificate for the frontend domain
- A secure secret manager or shell environment for credentials

## 2. Environment variables

Create `server/.env` in production with values appropriate to your environment:

```env
DATABASE_URL="postgresql://aceiteka:<strong-password>@db.example.com:5432/aceiteka_ebmis?schema=public"
JWT_SECRET="replace-with-a-32-plus-character-random-string"
CLIENT_URL="https://ebmis.example.com"
PORT=4000
NODE_ENV="production"
UPLOAD_DIR="/var/lib/aceiteka/uploads"
```

Notes:
- `CLIENT_URL` must exactly match the frontend origin used by the browser.
- `JWT_SECRET` must be strong and unique per environment.
- Never commit `.env` files to source control.
- `UPLOAD_DIR` must point to a private, persistent directory outside the web server's public document root. If omitted, uploads are stored under `server/uploads`.
- Official entry-form photos use the bundled English Tesseract model and are processed locally; handwritten counts must be entered and cross-checked by a person before approval. Keep the application dependencies installed with `npm install` so the model package is available. The uploaded originals are stored in the private `UPLOAD_DIR`.

## 3. Database setup

1. Create a PostgreSQL database and user for ACEITEKA.
2. Grant privileges for the database to that user.
3. Apply schema migrations:

```bash
cd server
npx prisma migrate deploy
```

4. Seed only on a fresh environment or when you deliberately want the demo roles and accounts.

```bash
npm run db:seed
```

Important:
- In production, do not use the dev-only demo passwords from the local seed data.
- Create real administrator accounts after deployment and disable or remove demo accounts.

## 4. Install dependencies

From the repository root:

```bash
npm install
```

## 5. Build the frontend

```bash
npm run build -w client
```

This produces a production bundle in `client/dist`.

## 6. Run the backend

Start the API in production mode:

```bash
cd server
npm start
```

For a long-running production environment, run the app behind a process manager such as PM2 or systemd.

Example PM2 configuration:

```bash
npm install -g pm2
pm2 start server/src/index.js --name aceiteka-ebmis --env production
```

Set the `PORT` and environment variables before starting the service. It is best practice to run the API as a dedicated service account.

## 7. Serve the frontend

Use a web server such as Nginx or a static hosting provider to serve the contents of `client/dist`.

Example Nginx config:

```nginx
server {
  listen 80;
  server_name ebmis.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name ebmis.example.com;

  ssl_certificate /etc/letsencrypt/live/ebmis.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ebmis.example.com/privkey.pem;

  root /var/www/aceiteka-ebmis/client/dist;
  index index.html;

  location / {
    try_files $uri /index.html;
  }

  location /api {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 8. Security checklist

- Use HTTPS everywhere.
- Set `secure` and `httpOnly` cookie settings in the server environment when operating behind a TLS terminator.
- Restrict database access to the application host only.
- Keep `JWT_SECRET` and database credentials out of version control.
- Rotate credentials when changing environments.
- Limit admin accounts to trusted personnel only.
- Keep PostgreSQL backups and retention policies in place.
- Protect the private upload directory with restrictive filesystem permissions and include approved exam materials in secure backups. Do not serve this directory as static content.
- Treat original school entry-form photos and workbooks as confidential records. Access is permission-checked in the API; do not make the upload directory public or share it through a web-server alias.

## 9. Health checks

After deployment, validate both services:

```bash
curl -f https://ebmis.example.com/api/health
curl -f http://127.0.0.1:4000/api/health
```

Expected result:

```json
{ "ok": true }
```

## 10. Typical deployment flow

1. Pull the latest code.
2. Install dependencies.
3. Run Prisma migrations.
4. Build the frontend.
5. Restart the API process.
6. Reload the web server or CDN.
7. Confirm login, dashboard, and key staff screens work.

## 11. Production notes

- The embedded PostgreSQL used in development is not suitable for production.
- The production API is designed to run separately from the frontend static build.
- For larger deployments, add a managed PostgreSQL service, database backups, alerting, and log collection.
- Email sending is not yet wired in the app; reset links print to the server log in development.
