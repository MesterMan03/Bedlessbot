/**
 * Extract every Unicode-compatible emoji from the given emoji link.
 * It ignores emojis which are not marked as "fully-qualified" or which include a skin tone modifier.
 */

import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const EMOJI_URL = "https://unicode.org/Public/emoji/15.1/emoji-test.txt";
const OUTPUT_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "res", "emojis.json");

async function downloadEmojis(url: string): Promise<string> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    return await response.text();
}

function extractEmojis(data: string): string[] {
    const emojis: string[] = [];
    const lines = data.split("\n");

    for (const line of lines) {
        // Skip empty lines and comments
        if (line.startsWith("#") || !line.trim() || !line.includes(";")) {
            continue;
        }

        // ignore every emoji which isn't fully qualified or includes "skin tone"
        const [codePoints, qualification] = line.split(";");
        if (!qualification.includes("fully-qualified")) {
            continue;
        }
        if (qualification.includes("skin tone")) {
            continue;
        }

        // Extract the emoji by combining code points
        const emoji = codePoints
            .trim()
            .split(" ")
            .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
            .join("");

        emojis.push(emoji);
    }

    return emojis;
}

try {
    console.log("Downloading emoji-test.txt...");
    const data = await downloadEmojis(EMOJI_URL);

    console.log("Extracting emojis...");
    const emojis = extractEmojis(data);

    console.log(`Extracted ${emojis.length} emojis. Writing to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(emojis, null, 2), "utf-8");

    console.log("Emojis saved successfully!");
} catch (error) {
    console.error("An error occurred:", error);
}
