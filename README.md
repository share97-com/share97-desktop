# Share97 Worker: AI agent for social media automation on Windows

**Share97 Worker** is the Windows desktop app of [Share97](https://share97.com), a social media automation platform. Its AI agent schedules and auto-posts to **Instagram, TikTok, X (Twitter), LinkedIn, Facebook, YouTube, Pinterest, Threads and Reddit** from your own signed-in browsers, replies to comments, collects account data and runs your Share97 workflows on schedule.

[**Download for Windows (latest release)**](../../releases/latest) · [share97.com](https://share97.com) · [All releases](../../releases)

## Why a desktop worker

Most social media schedulers post only through official APIs, which leaves out platforms, account types and actions those APIs do not cover. Share97 Worker runs on your own computer: your social accounts stay signed in **in your own browsers on your machine**, and the AI agent works there the way you would. Your passwords never leave your computer and the agent never sees them.

## Features

- **AI agent for social media**: publishes posts, Reels, Shorts and pins, writes first comments, replies, follows and collects data (followers, post engagement) in the account's own browser.
- **Social media scheduler and auto posting**: workflows run on this computer on the days, hours or interval you choose (every N hours); every run is logged on share97.com with its result, and a skipped run says why.
- **AI agent workflows**: one click creates a ready workflow (auto posting, AI posting, auto reply, follow accounts, or your own agent task). The agent node does any instruction on your account on schedule.
- **Run it from chat**: write what you want ("share this on X", "reply to today's comments", "do this every 3 hours") and the agent does it in the right account, or sets it up as a workflow. Every workflow job opens as a chat you can watch live.
- **AI content generation**: when the queue runs dry, AI writes the caption and image for the next post, in up to 15 languages.
- **Multiple accounts and profiles**: add several profiles per platform, group them, and run each in its own isolated browser with its own cookies.
- **Chrome extension**: let the agent work in tabs of your everyday Google Chrome, where you are already signed in.
- **Runs in the background**: keeps working in the tray, can start with Windows, and can keep the computer awake for scheduled posts.
- **Backups**: one click saves every setting, browser and sign-in (cookies) into a compressed `.share97` file in Documents\Share97\Yedekler. Update it any time, show it in its folder, or restore it after a reinstall or on a new computer.
- **Every run on record**: each job is logged with its result and the post link, on this computer and on share97.com.

## Supported platforms

Instagram · TikTok · X (Twitter) · LinkedIn · Facebook · YouTube · Pinterest · Threads · Reddit

## Install

1. Download `share97-desktop-setup-<version>.exe` from the [latest release](../../releases/latest).
2. Run the installer and choose the install folder.
3. Open Share97 Worker and click **Sign in with Share97**. Approve in your browser; this computer becomes a worker of your Share97 account.
4. Add your social accounts and sign in on each platform's own page.

The installer is not code-signed yet, so Windows SmartScreen may show a warning the first time: choose **More info** and then **Run anyway**. The app updates itself from this repository's releases.

## Requirements

- Windows 10 or 11 (64-bit)
- A free [Share97 account](https://share97.com)

## FAQ

**Is it free?** The app is free. Share97 has a free plan; AI generation and extra accounts use Share97 credits.

**Where are my logins stored?** Only on your computer, in the app's own browser profiles. The Share97 server stores the account name and which device it belongs to, never your cookies or passwords.

**Does it work when my computer is off?** Jobs for accounts on this computer need the app running. Accounts connected through official APIs publish from the server.

**Can automation get an account limited?** Some platforms restrict automated activity. The agent stops at captchas, verification screens and automation warnings instead of trying to get around them.

## Links

- Website: https://share97.com
- Download page: https://share97.com/download
- Support: support@share97.com

Building from source: see [DEVELOPMENT.md](DEVELOPMENT.md).
