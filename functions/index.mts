import app from "../src/dashboard"

export default async(req: Request) => {
    return app.handle(req);
}