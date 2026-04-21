# cosmdandy.dev

Personal landing page. Static HTML + CSS, deployed via GitHub Pages.

## Deploy

1. Go to repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `master`, folder: `/ (root)`
4. Save

## DNS

Point the apex domain to GitHub Pages. Option A — CNAME flattening (Cloudflare, etc.):

```
CNAME   @   cosmdandy.github.io
```

Option B — A records (if provider doesn't support CNAME flattening):

```
A     @   185.199.108.153
A     @   185.199.109.153
A     @   185.199.110.153
A     @   185.199.111.153
```

After DNS propagates, enable **Enforce HTTPS** in Settings → Pages.

## Local dev

```bash
python3 -m http.server 8080
```
