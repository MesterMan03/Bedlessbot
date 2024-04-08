# Bedlessbot

## Installation

Bedlessbot uses Bun and is incompatible with Node. Therefore you first have to install Bun.

Follow the instructions at https://bun.sh/docs/installation

To clone the repository:

```
git clone https://github.com/MesterMan03/Bedlessbot.git
cd Bedlessbot
```

To install dependencies:

```bash
bun install
```

First time setup:

```bash
bun run setup_db.ts
```

This will create an empty `data.db` SQLite database file in the root directory with the correct tables set up.

Then set up .env by following the instructions in `.env.example`.

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.0.33. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
