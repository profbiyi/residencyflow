# Railway Deployment Guide

Your code is now on GitHub: **https://github.com/profbiyi/residencyflow**

Railway Project: **https://railway.com/project/1a5d6588-0a93-4e9d-a3f4-b072ac896090**

## Step-by-Step Deployment

### 1. Add GitHub Integration to Railway

1. Go to your Railway dashboard: https://railway.com/project/1a5d6588-0a93-4e9d-a3f4-b072ac896090
2. Click **"+ New"** button
3. Select **"GitHub Repo"**
4. Authorize Railway to access your GitHub (if prompted)
5. Select: `profbiyi/residencyflow`

This will auto-deploy your code on every push!

### 2. Add Backend API Service

**From dashboard:**
- Click **"+ New"** → **"GitHub Repo"** → Select `profbiyi/residencyflow`
- Railway will detect `backend/Dockerfile`
- Set **Root Directory**: `backend`
- Set **Service Name**: `api`

**Environment Variables for API:**
```bash
DATABASE_URL=${Postgres.DATABASE_URL}  # Railway will auto-fill this
SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
CORS_ORIGINS=*
```

**Generate a domain:**
- Go to API service → Settings → Generate Domain
- Copy the domain (e.g., `api-production-xxxx.up.railway.app`)

### 3. Add Worker Service

**From dashboard:**
- Click **"+ New"** → **"GitHub Repo"** → Select `profbiyi/residencyflow`
- Set **Root Directory**: `backend`
- Set **Service Name**: `worker`
- Set **Start Command**: `python worker.py`

**Environment Variables for Worker:**
```bash
DATABASE_URL=${Postgres.DATABASE_URL}
```

### 4. Add Frontend Service

**From dashboard:**
- Click **"+ New"** → **"GitHub Repo"** → Select `profbiyi/residencyflow`
- Set **Root Directory**: `frontend`
- Set **Service Name**: `frontend`

**Environment Variables for Frontend:**
```bash
VITE_API_URL=https://api-production-xxxx.up.railway.app  # Use domain from step 2
```

**Generate a domain:**
- Go to Frontend service → Settings → Generate Domain
- Copy the domain (e.g., `frontend-production-yyyy.up.railway.app`)
- **This is your live app URL!** 🎉

### 5. Update CORS in Backend

Once you have the frontend domain, update the API's `CORS_ORIGINS`:

```bash
CORS_ORIGINS=https://frontend-production-yyyy.up.railway.app
```

### 6. Create SuperAdmin Account

Once API is deployed, run this locally to create admin on production DB:

```bash
# Get production DATABASE_URL from Railway dashboard (Postgres service → Variables)
export DATABASE_URL="postgresql://postgres:xxx@xxx.railway.app:5432/railway"

# Create admin
python backend/manage_admin.py create super@residencyflow.com --password your-secure-password
```

---

## Alternative: Quick Deploy via CLI

If you prefer CLI over dashboard, you can also deploy like this:

```bash
# Deploy API
railway service create api --source profbiyi/residencyflow --root-directory backend
railway variables set DATABASE_URL='${{Postgres.DATABASE_URL}}' SECRET_KEY='your-secret-key' CORS_ORIGINS='*'

# Deploy Worker
railway service create worker --source profbiyi/residencyflow --root-directory backend
railway variables set DATABASE_URL='${{Postgres.DATABASE_URL}}'

# Deploy Frontend
railway service create frontend --source profbiyi/residencyflow --root-directory frontend
railway variables set VITE_API_URL='https://your-api-domain.up.railway.app'
```

---

## Verify Deployment

1. **Check API**: `https://api-production-xxxx.up.railway.app/docs`
2. **Check Frontend**: `https://frontend-production-yyyy.up.railway.app`
3. **Check Logs**: Railway dashboard → Each service → View logs

---

## Troubleshooting

**If builds fail:**
- Check logs in Railway dashboard
- Ensure `Dockerfile` paths are correct
- Verify environment variables are set

**If API can't connect to DB:**
- Verify `DATABASE_URL` is set to `${Postgres.DATABASE_URL}` (Railway reference syntax)

**If Frontend can't reach API:**
- Verify `VITE_API_URL` points to correct API domain
- Update CORS_ORIGINS in API to include frontend domain

---

## Cost Estimate (Hobby Plan)

- **PostgreSQL**: ~$5/month
- **API**: ~$5/month
- **Worker**: ~$5/month
- **Frontend**: ~$5/month

**Total**: ~$20/month (first $5 free with Hobby plan)

Upgrade to Pro ($20 base + usage) when you have real customers!

---

## Next Steps After Deployment

1. ✅ Create SuperAdmin account on production
2. Test invite flow end-to-end
3. Add monitoring (Sentry, Prometheus)
4. Set up custom domain (if needed)
5. Add SSL/TLS (Railway provides free SSL)
6. Set up CI/CD for automated testing before deploy

🚀 **You're deploying to production!**
