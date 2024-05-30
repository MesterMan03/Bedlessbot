import type { DashboardAPIInterface, DashboardLbEntry } from "./api";

const PageSize = 20;

function GenerateRandomName(): string {
    const minLength = 3;
    const maxLength = 32;
    const characters = "abcdefghijklmnopqrstuvwxyz0123456789_."; // Only lowercase letters, numbers, underscore, and period
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    let result = "";

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }

    return result;
}

async function FetchPageTest(page: number) {
    // this is a test api, generate random data
    if (page >= 10 || !Number.isInteger(page) || page < 0) {
        return null;
    }

    const levels = Array.from(
        { length: PageSize },
        (_, i) =>
            ({
                pos: i + page * PageSize + 1,
                level: Math.floor(Math.random() * 100),
                xp: Math.floor(Math.random() * 1000),
                userid: Math.random().toString(10).substring(2),
                avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
                // username is a random string between 3 and 32 characters
                username: GenerateRandomName(),
                progress: [Math.floor(Math.random() * 1000), Math.floor(Math.random() * 100)]
            }) satisfies DashboardLbEntry
    );

    return new Promise<typeof levels>((res) => {
        setTimeout(() => {
            res(levels);
        }, 1000); // add an artifical delay
    });
}

export default class DashboardAPITest implements DashboardAPIInterface {
    FetchLbPage = FetchPageTest;
}
