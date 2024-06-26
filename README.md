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

## Usage

To run:

```bash
bun run src/index.ts
```
