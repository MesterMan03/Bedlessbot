import { Database } from "bun:sqlite";

function IGetMaxCommentsPage(packid: string, db: Database, pageSize: number) {
    const comments =
        db.query<{ row_count: number }, [string]>(`SELECT COUNT(*) AS row_count FROM pack_comments WHERE packid = ?`).get(packid)
            ?.row_count ?? 0;

    return Math.ceil(Math.max(comments, 1) / pageSize);
}

export { IGetMaxCommentsPage };
