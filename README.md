# Bedlessbot

## Installation

Bedlessbot uses Bun and is incompatible with Node. Therefore you first have to install Bun.

Follow the instructions at https://bun.sh/docs/installation

1. **Clone the repository**:

```bash
git clone https://github.com/MesterMan03/Bedlessbot.git
cd Bedlessbot
```

2. **Install dependencies**:

```bash
bun install
```

3. **Set up the database**:

```bash
bun run tools/setup_db.ts
```

This will create an empty `data.db` SQLite database file in the root directory with the correct tables set up.

4. **Set up .env**:

Create a `.env` file by following `.env.example`.

5. **Set up config**:
 
Finally, set up `src/config.ts`. The file already exists, so you just need to fill in the values.

6. **Set up secret**:

If you want to use the [machine-learning API](https://github.com/MesterMan03/Bedlessbot-API), you must provide the secret you generated for the API. Create a `secret` file in the root directory and paste the secret in it (it should be a hexadecimal string).

7. (optional) Set up test.localhost domain:

For hCaptcha to work, you cannot use localhost. Therefore, you can set up a domain in your hosts file. Add the following line to your hosts file:

```
127.0.0.1 test.localhost
```

Then you can access the dashboard at `http://test.localhost:8146`. You might also want to mark this origin as a secure origin, so features like Service Workers work using the Chrome flag chrome://flags/#unsafely-treat-insecure-origin-as-secure.

## Usage

### Package scripts

1. `bun start` - Start the bot in production mode.
2. `bun dev` - Start the bot in development mode.
3. `bun biome` - Run biome (equivalent to `biome`).
4. `bun lint` - Run biome linter (equivalent to `biome lint .`).
5. `bun format` - Run biome formatter (equivalent to `biome format .`).
6. `bun check` - Run full biome check (linter + formatter), (equivalent to `biome check .`).
7. `bun devdash` - Run the dashboard in dev API mode (no connection to Discord bot, can be ran without secrets).

For the development API to work, you only need the following environment variables:
- `JWT_SECRET` - You can set this to any base64-encoded string.
- (optional) `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` and `VAPID_SUBJECT` - If you want push notifications to work, you can set these variables to a valid VAPID private key, public key and subject (mailto: or https:// link) respectively. You can generate valid VAPID keys using `bunx web-push generate-vapid-keys`.