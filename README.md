# TwitchSync

**TwitchSync** is a self-hosted Twitch VOD downloader and stream archiver built for your homelab. Define tasks once and let TwitchSync automatically monitor channels and game categories — downloading VODs the moment streams end, no manual intervention required.

> A modern, server-side alternative to Twitch Leecher. Runs 24/7 in Docker and saves VODs to local storage — point your media server at the output folder and your archive is ready to browse.

---

## 📸 Screenshots

### Dashboard

The main dashboard gives you an at-a-glance view of everything TwitchSync is doing. See active download tasks, which games are being watched, current download progress, and storage stats — all in one place.

![Dashboard](img/dashboard.png)

---

### Task Manager

The Task Manager is where you build your automation rules. Each task defines **which channels or games** to monitor, with fine-grained filters to control exactly what gets downloaded — by game, keyword, stream title, duration, or quality.

![Task Manager](img/task-manager.png)

**What you can configure per task:**
- 🎮 **Game filters** — only download VODs where the streamer was playing specific games
- 📺 **Channel targets** — watch specific Twitch channels
- 🔍 **Keyword rules** — include or exclude VODs by stream title keywords
- ⚙️ **Quality & duration** — set minimum stream length and preferred video quality

---

### Content Discovery

Content Discovery helps you find **new streamers to follow** based on what you're already watching. It analyzes the games and channels in your list and surfaces recommendations — so your archive grows with creators you'll actually care about.

![Content Discovery](img/content-discovery.png)

---

### Games

The Games page is your master list of Twitch game categories TwitchSync monitors.

![Games](img/games.png)

---

### Channels

The Channels page manages the specific Twitch streamers TwitchSync tracks.

![Channels](img/channels.png)

---

## 🔑 Step 1 — Register a Twitch Application

TwitchSync needs a Twitch Developer Application to authenticate users and access the Twitch API. You only need to do this once.

### 1.1 Create the Application

1. Go to [dev.twitch.tv/console](https://dev.twitch.tv/console) and log in with your Twitch account
2. Click **Register Your Application**
3. Fill in the form:
   - **Name:** Anything you like (e.g. `TwitchSync`)
   - **Category:** `Application Integration`
   - **Client Type:** `Confidential`

### 1.2 Set the OAuth Redirect URL

This is the most important part. The redirect URL tells Twitch where to send users after they log in. **It must match exactly what TwitchSync expects.**

| Scenario | Redirect URL to use |
|---|---|
| **Local dev** (browser & backend on same machine) | `http://localhost:2261/auth/twitch/callback` |
| **Docker homelab** (accessing by IP) | `http://YOUR_SERVER_IP:2261/auth/twitch/callback` |
| **Docker homelab** (with domain/reverse proxy) | `https://twitchsync.yourdomain.com/auth/twitch/callback` |

> ⚠️ **Common mistake:** Using `localhost` in your Twitch app while running TwitchSync in Docker on a homelab. The OAuth callback comes from Twitch's servers back to **your browser**, so the URL must be the actual IP or domain your browser can reach — not `localhost` unless you're running everything on the same PC you browse from.

You can register **multiple redirect URLs** in the Twitch console (up to 10) — add both your local and homelab URL if needed.

### 1.3 Get Your Credentials

After saving the application:
- Copy your **Client ID** (shown on the app page)
- Click **New Secret** to generate a **Client Secret** — copy it immediately, it won't show again

---

## 🚀 Step 2 — Deploy with Docker

### 2.1 Clone the Repo

```bash
git clone https://github.com/Vermino/TwitchSync.git
cd TwitchSync
```

### 2.2 Create Your `.env` File

Copy the example and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# Twitch API — from dev.twitch.tv/console
TWITCH_CLIENT_ID=your_client_id_here
TWITCH_CLIENT_SECRET=your_client_secret_here

# Must match the redirect URL registered in the Twitch console
# For homelab Docker: replace with your server IP or domain
TWITCH_REDIRECT_URI=http://YOUR_SERVER_IP:3501/auth/twitch/callback

# PostgreSQL
DB_USER=twitchsync
DB_PASSWORD=changeme
DB_HOST=db
DB_PORT=5432
DB_NAME=twitchsync

# JWT secret — generate a random string, e.g.: openssl rand -hex 32
JWT_SECRET=CHANGE_ME_TO_A_RANDOM_SECRET

# Where VODs are saved inside the container
# Map this to a host path in docker-compose.yml volumes
STORAGE_PATH=/data/vods
```

### 2.3 Configure Storage in `docker-compose.yml`

Edit the `backend` service volumes to point to wherever you want VODs stored on your host:

```yaml
backend:
  volumes:
    - /your/homelab/storage/vods:/data/vods   # VOD storage
    - ./backend:/app
    - /app/node_modules
```

For example, on a NAS or media server:
```yaml
    - /mnt/media/TwitchSync/VODs:/data/vods
```

### 2.4 Start the Services

```bash
docker-compose up -d
```

### 2.5 Access the App

| Service | URL |
|---|---|
| **Web UI + API** | `http://YOUR_SERVER_IP:2261` |

---

## 🗂 Storage Management

TwitchSync downloads VODs to the path configured in **Settings → Download Path**. In Docker, this should match the container-side path from your volume mount (e.g. `/data/vods`).

The download path is saved in the database, so changing it via the Settings UI takes effect immediately — a filesystem rescan runs automatically to update storage stats.

---

## 🛠 Technical Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express, PostgreSQL |
| **Frontend** | React (TypeScript), Tailwind CSS, Vite |
| **Scheduling** | Node-cron for automated task execution |
| **API** | Twitch Helix API via Axios |
| **Auth** | Twitch OAuth 2.0 + JWT |

---

## ⚖️ License

Licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. This ensures TwitchSync remains open source even when hosted as a service. See the [LICENSE](LICENSE) file for full details.
