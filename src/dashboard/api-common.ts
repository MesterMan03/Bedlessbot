import { Database } from "bun:sqlite";

function IGetMaxCommentsPage(packid: string, db: Database, pageSize: number) {
    const comments =
        db.query<{ row_count: number }, [string]>(`SELECT COUNT(*) AS row_count FROM pack_comments WHERE packid = ?`).get(packid)
            ?.row_count ?? 0;

    return Math.ceil(Math.max(comments, 1) / pageSize);
}

function GetLeaderboardPos(userid: string, db: Database) {
    const pos = db
        .query<{ pos: number }, [string]>(`SELECT COUNT(*) as pos FROM levels WHERE xp > (SELECT xp FROM levels WHERE userid = ?)`)
        .get(userid)?.pos;
    return pos ? pos + 1 : 1;
}

const CONSTANTS = {
    LbPageSize: 20,
    CommentsPageSize: 10
};

export { IGetMaxCommentsPage, GetLeaderboardPos, CONSTANTS };
