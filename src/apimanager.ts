import { fileURLToPath } from "bun";
import { join } from "path";

const endpoint = process.env.API_END!;

const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());
const secret = await Bun.file(join(__dirname, "..", "secret"))
    .arrayBuffer()
    .then((buffer) => {
        // convert to hex string
        return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
    });

interface APIPayloadRequest {
    text?: string;
}

async function SendRequest(payload: APIPayloadRequest) {
    const response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
            "Content-Type": "application/json",
            Authorization: `${secret}`
        }
    });

    return { status: response.status, data: await response.json() };
}

export { SendRequest };
