# Deploy ResidencyFlow Online - Quick Start Guide

## 🚀 Fastest Options (5-30 minutes)

### **Option 1: Railway.app** ⚡ EASIEST (5 min)
**Cost:** $5/month  
**Best for:** Quick demo, MVP testing

```bash
# 1. Install Railway CLI
brew install railway

# 2. Login
railway login

# 3. Initialize project
railway init

# 4. Add PostgreSQL
railway add --database postgres

# 5. Deploy
railway up

# Railway will:
# - Build your Docker images automatically
# - Provide public URLs for frontend & API
# - Handle SSL certificates
# - Auto-deploy on git push
```

**Post-deployment:**
```bash
# Set environment variables
railway variables set SECRET_KEY=$(openssl rand -hex 32)
railway variables set DATABASE_URL=${{Postgres.DATABASE_URL}}

# Get your URL
railway domain
# Example: https://residencyflow-production.up.railway.app
```

---

### **Option 2: Render.com** 🎯 RECOMMENDED (15 min)
**Cost:** $7/month (web) + $7/month (DB) = $14/month  
**Best for:** Production-ready, auto-scaling

**Steps:**
1. **Go to:** https://render.com
2. **New → Blueprint**
3. **Connect GitHub repo**
4. **Create `render.yaml`:**

```yaml
# render.yaml
services:
  # Frontend
  - type: web
    name: residencyflow-frontend
    env: docker
    dockerfilePath: ./frontend/Dockerfile
    envVars:
      - key: VITE_API_URL
        fromService:
          name: residencyflow-api
          type: web
          property: host

  # Backend API
  - type: web
    name: residencyflow-api
    env: docker
    dockerfilePath: ./backend/Dockerfile
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: residencyflow-db
          property: connectionString
      - key: SECRET_KEY
        generateValue: true
      - key: PORT
        value: 8000

  # Worker
  - type: worker
    name: residencyflow-worker
    env: docker
    dockerfilePath: ./backend/Dockerfile
    dockerCommand: python worker.py
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: residencyflow-db
          property: connectionString

databases:
  - name: residencyflow-db
    databaseName: residencyflow
    user: admin
```

4. **Push to GitHub** → Render auto-deploys
5. **Create SuperAdmin:**
```bash
# SSH into API service
render ssh residencyflow-api
python manage_admin.py create admin@residencyflow.com yourpassword
```

**Your URLs:**
- Frontend: `https://residencyflow-frontend.onrender.com`
- API: `https://residencyflow-api.onrender.com`

---

### **Option 3: Heroku** 🟣 TRADITIONAL (20 min)
**Cost:** $7/month (Eco Dyno) + $5/month (Mini Postgres) = $12/month  
**Best for:** Familiar platform, good documentation

```bash
# 1. Install Heroku CLI
brew tap heroku/brew && brew install heroku

# 2. Login
heroku login

# 3. Create apps
heroku create residencyflow-api
heroku create residencyflow-frontend
heroku create residencyflow-worker

# 4. Add PostgreSQL
heroku addons:create heroku-postgresql:mini -a residencyflow-api

# 5. Deploy API
cd backend
heroku container:push web -a residencyflow-api
heroku container:release web -a residencyflow-api

# 6. Deploy Worker
heroku container:push worker -a residencyflow-worker
heroku container:release worker -a residencyflow-worker

# 7. Deploy Frontend
cd ../frontend
heroku container:push web -a residencyflow-frontend
heroku container:release web -a residencyflow-frontend

# 8. Set config
heroku config:set SECRET_KEY=$(openssl rand -hex 32) -a residencyflow-api
heroku config:set VITE_API_URL=https://residencyflow-api.herokuapp.com -a residencyflow-frontend

# 9. Create SuperAdmin
heroku run python manage_admin.py create admin@yourdomain.com password123 -a residencyflow-api
```

---

### **Option 4: DigitalOcean App Platform** 🌊 (25 min)
**Cost:** $12/month (Basic) + $7/month (DB) = $19/month  
**Best for:** Better performance, predictable pricing

1. **Go to:** https://cloud.digitalocean.com/apps
2. **Create App → Docker Hub or GitHub**
3. **Add 3 components:**
   - Frontend (Port 80)
   - API (Port 8000)
   - Worker (Background)
4. **Add Database:** Managed PostgreSQL
5. **Set Environment Variables**
6. **Deploy**

---

## 🏢 Production-Ready Options (2-4 hours)

### **Option 5: AWS (ECS + RDS)** 💪
**Cost:** ~$50-100/month  
**Best for:** Enterprise customers, full control

**Quick Start with CDK/Terraform:**
```bash
# Coming in Week 3 - Terraform modules
# Will deploy:
# - ECS Fargate (API + Worker)
# - RDS PostgreSQL
# - ALB with SSL
# - CloudWatch logs
```

### **Option 6: Google Cloud Run** ☁️
**Cost:** Pay per request (~$10-30/month for small traffic)  
**Best for:** Auto-scaling, serverless

```bash
gcloud run deploy residencyflow-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

## 📋 Pre-Deployment Checklist

Before deploying, make sure you have:

### 1. **Environment Variables Ready**
```bash
# Required
SECRET_KEY=<generate-with-openssl-rand-hex-32>
DATABASE_URL=<provided-by-hosting-platform>

# Optional
GEMINI_API_KEY=<your-key-for-AI-insights>
SENTRY_DSN=<for-error-tracking>
```

### 2. **Update CORS Origins**
```python
# backend/main.py - Line 26
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://yourdomain.com",  # Your frontend URL
        "http://localhost:3000"     # Keep for local dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 3. **Update Frontend API URL**
```typescript
// frontend/src/services/api.ts - Line 7
const API_URL = process.env.VITE_API_URL || 'https://your-api.com';
```

### 4. **Change Default Passwords**
```bash
# After deployment, immediately:
docker exec <container> python manage_admin.py create admin@yourdomain.com STRONG_PASSWORD
```

---

## 🎯 My Recommendation

**For getting online TODAY:**
👉 **Use Render.com** - It's the sweet spot of:
- Easy deployment (push to GitHub)
- Auto SSL
- Reasonable price ($14/month)
- Good for demos + production
- Built-in monitoring

**Step-by-step for Render:**

1. **Push your code to GitHub:**
```bash
cd /Users/profbiyi/Desktop/residencyflow
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/residencyflow.git
git push -u origin main
```

2. **Create the `render.yaml` file** (I'll do this for you below)

3. **Go to Render.com** → New → Blueprint

4. **Connect GitHub repo** → Auto-deploys!

5. **Get your URL** → Test it

6. **Create SuperAdmin** via Render Shell

---

## 🚀 Let's Deploy NOW!

Want me to:
1. Create the `render.yaml` for you
2. Set up the Docker configs for Render
3. Give you the exact commands to push to GitHub

Say **"yes"** and we'll have you online in 15 minutes! 🔥

---

## 💡 Free Tier Options (For Testing)

- **Render:** Free tier available (auto-sleeps after inactivity)
- **Railway:** $5 free credit
- **Fly.io:** Free allowance for small apps
- **Vercel (Frontend only):** Free for frontend, need separate backend

---

## 🛡️ Security Notes

Before going live:
- [ ] Change all default passwords
- [ ] Set strong SECRET_KEY
- [ ] Enable HTTPS (most platforms do this automatically)
- [ ] Restrict CORS origins
- [ ] Set up database backups
- [ ] Add monitoring (Sentry)

---

## 📞 Need Help?

Issues after deployment? Check:
1. Container logs: `render logs` or `heroku logs --tail`
2. Database connection: `pg:info` or check dashboard
3. Environment variables: Are they set correctly?
4. Build logs: Did Docker build succeed?

Drop me a message and I'll help debug! 🚀
