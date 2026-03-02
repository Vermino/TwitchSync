# TwitchSync

TwitchSync is an automated, self-hosted Twitch VOD downloader and stream archiver. It is designed to run as a background service, providing a "set-it-and-forget-it" alternative to manual desktop applications like Twitch Leecher.

## Core Functionality

TwitchSync automates the archiving of Twitch broadcasts. By defining persistent tasks, the application monitors specific channels and game categories to download VODs immediately after a stream concludes.

### Key Features
*   **Automated VOD Archiving:** Continuous monitoring of live channels with automatic download triggering.
*   **Game-Based Filtering:** Target specific games (e.g., Rimworld, Dota 2) to only download relevant content.
*   **Keyword Filtering:** Include or exclude VODs based on stream titles.
*   **Storage Management:** Integrated tools for organizing and cleaning up archived media.
*   **Web-Based Interface:** Centralized dashboard for managing tasks, monitoring download progress, and viewing storage statistics.
*   **Content Discovery:** Analytical tools to identify and track new content creators based on historical data.

## SEO Optimization & Use Cases

TwitchSync is optimized for users seeking a robust, server-side Twitch VOD downloader. It serves as a modern replacement for legacy tools, focused on automation and homelab integration.

*   **Twitch Leecher Alternative:** Moves the workflow from a manual desktop app to an automated server service.
*   **Twitch Archive Bot:** Functions as a personal archiver for stream preservation.
*   **Self-Hosted Stream Downloader:** Ideal for integration with media servers like Plex, Jellyfin, or Emby.

## Deployment with Docker

The recommended way to deploy TwitchSync is using Docker Compose. This ensures all services (Frontend, Backend, and PostgreSQL) are correctly configured and networked.

### Prerequisites
*   Docker and Docker Compose installed.
*   Twitch Developer Application (Client ID and Client Secret) from the [Twitch Dev Console](https://dev.twitch.tv/console).

### Setup Instructions

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Vermino/TwitchSync.git
    cd TwitchSync
    ```

2.  **Configure Environment Variables:**
    Create a `.env` file in the root directory:
    ```env
    DB_USER=your_db_user
    DB_PASSWORD=your_db_password
    TWITCH_CLIENT_ID=your_twitch_client_id
    TWITCH_CLIENT_SECRET=your_twitch_client_secret
    ```

3.  **Launch the Services:**
    ```bash
    docker-compose up -d
    ```

4.  **Access the Application:**
    *   **Web UI:** `http://localhost:3001`
    *   **API Backend:** `http://localhost:3000`

## Technical Stack

*   **Backend:** Node.js, Express, PostgreSQL
*   **Frontend:** React (TypeScript), Tailwind CSS, Vite
*   **Automation:** Node-cron for task scheduling and monitoring
*   **API Integration:** Twitch Helix API via Axios

## License

Licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. This license ensures that the software remains open source, even when hosted as a service. See the [LICENSE](LICENSE) file for the full text.
