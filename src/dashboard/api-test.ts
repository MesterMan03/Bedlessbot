const PageSize = 25;

async function FetchPageTest(page: number) {
    // this is a test api, generate random data
    if (page >= 10 || !Number.isInteger(page) || page < 0) return null;

    const levels = Array.from({ length: PageSize }, (_, i) => ({
        pos: i + page * PageSize + 1,
        level: Math.floor(Math.random() * 100),
        xp: Math.floor(Math.random() * 1000),
        userid: Math.random().toString(36).substring(7),
        avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
        username: "unknown",
        progress: [Math.floor(Math.random() * 1000), Math.floor(Math.random() * 100)],
    }));

    return levels;
}