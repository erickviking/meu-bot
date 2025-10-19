# meu-bot

## Overview

This project is a WhatsApp assistant using the NEPQ methodology. It integrates OpenAI, Redis, Supabase and optional Google Calendar features to automate conversations.

## Prerequisites

- **Node.js** >= 18 (tested with Node 20)
- **npm** for package management
- **Docker** (optional) to build and run the project in a container

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Build the Docker image:
   ```bash
   docker build -t meu-bot .
   ```

## Configuration

Create a `.env` file in the project root with the following variables:

```
PORT=3000
REDIS_URL=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_API_KEY=
GOOGLE_CREDENTIALS_JSON=
CONTACT_PHONE=
```

Only `PORT` has a default value (3000). All others are required for the server to start correctly.

## Running the server

- **Development** with automatic reloads:
  ```bash
  npm run dev
  ```
- **Production**:
  ```bash
  npm start
  ```
- **Docker**:
  ```bash
  docker run -p 3000:3000 --env-file .env meu-bot
  ```

## Useful npm scripts

- `npm start` – start the server
- `npm run dev` – run with `nodemon` for development

