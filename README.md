# meu-bot

## Overview

meu-bot is a Node.js application for managing AI-driven WhatsApp assistants. It is designed as a multi-tenant SaaS platform that integrates with Supabase for persistence, OpenAI for language processing and Redis for caching.

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root and configure the environment variables described below.

## Environment Variables

The server requires several environment variables to run correctly:

- `PORT` - Port for the HTTP server (defaults to `3000` if not set).
- `REDIS_URL` - Connection string for Redis.
- `WHATSAPP_TOKEN` - Token used to access the WhatsApp Cloud API.
- `WHATSAPP_PHONE_ID` - Phone number ID provided by WhatsApp.
- `VERIFY_TOKEN` - Token used by Meta to verify webhook requests.
- `WHATSAPP_APP_SECRET` - App secret for validating webhook signatures.
- `OPENAI_API_KEY` - API key for accessing OpenAI services.
- `SUPABASE_URL` - URL of your Supabase instance.
- `SUPABASE_API_KEY` - API key for Supabase.

## Usage

Start the development server with automatic restarts:

```bash
npm run dev
```

For production use:

```bash
npm start
```

