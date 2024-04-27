import { fileURLToPath } from "bun";
import { join } from "path";

const endpoint = process.env.API_END!;

const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());
const secret = await Bun.file(join(__dirname, "..", "secret"))
    .text()
    .catch((err) => {
        console.warn(err);
        return null;
    });

interface APIPayloadRequest {
    text?: string;
}

async function SendRequest(payload: APIPayloadRequest) {
    if (!secret) return { status: 401, data: null };

    const response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
            "Content-Type": "application/json",
            Authorization: `${secret}`
        }
    });

    if (!response.ok) return { status: response.status, data: null };

    return { status: response.status, data: await response.json() };
}

export { SendRequest };
