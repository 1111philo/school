---
description: Deploy app to GitHub Pages
---

# Deploy to GitHub Pages

This workflow sets up automatic deployment to GitHub Pages. Every push to `main` will trigger a new deployment.

## Initial Setup (One-time only)

### 1. Wait for the GitHub Action to complete
- Go to https://github.com/1111philo/school/actions
- You should see a workflow run called "Deploy to GitHub Pages"
- Wait for it to show a green checkmark (✓)
- This creates a `gh-pages` branch with your built app

### 2. Enable GitHub Pages
- Go to https://github.com/1111philo/school/settings/pages
- Under "Build and deployment" → "Branch"
- Select **`gh-pages`** from the dropdown (instead of `None` or `main`)
- Keep the folder as `/ (root)`
- Click **Save**

### 3. Wait for deployment
- GitHub will take 1-2 minutes to deploy
- Your app will be live at: https://1111philo.github.io/school/

## Future Updates

After the initial setup, deployment is automatic:

1. Make changes to your code
2. Commit and push to `main`:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. GitHub Actions automatically builds and deploys
4. Your live site updates in 1-2 minutes

## Troubleshooting

### If the Action fails:
- Check the Actions tab for error messages
- Ensure `package.json` has all dependencies
- Verify `npm run build` works locally

### If the site shows a blank page:
- Check browser console for errors
- Verify the `base` path in `vite.config.ts` is `/school/`
- Clear browser cache and hard reload (Cmd+Shift+R)

### If the site doesn't update:
- Check that the Action completed successfully
- Wait a few minutes (GitHub Pages can be slow)
- Try clearing your browser cache
