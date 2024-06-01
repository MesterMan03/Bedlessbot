import type { User } from "discord-oauth2";
import { t } from "elysia";

interface DashboardAPIInterface {
    FetchLbPage: (page: number) => Promise<DashboardLbEntry[] | null>;
    CreateOAuth2Url: (state: string) => string;
    ProcessOAuth2Callback: (code: string) => Promise<User | null>;
    SubmitPackComment: (userid: string, packid: string, comment: string) => Promise<DashboardPackComment | null>;
    ManagePackComment: (commentid: string, action: "approve" | "deny" | "spam") => Promise<boolean>;
    FetchPackComments: (packid: string, page: number) => Promise<DashboardFinalPackComment[] | null>;
    GetUser: (userid: string) => Promise<DashboardUser | null>;
}

interface DashboardLbEntry {
    pos: number;
    level: number;
    xp: number;
    userid: string;
    avatar: string;
    username: string;
    progress: [number, number];
}

interface DashboardPackComment {
    id: string;
    packid: string;
    userid: string;
    comment: string;
    date: number;
}

interface DashboardFinalPackComment extends DashboardPackComment {
    username: string;
    avatar: string;
}

interface DashboardUser {
    username: string;
    avatar: string;
}

const DashboardLbEntrySchema = t.Object({
    pos: t.Numeric({ description: "The position of the user in the leaderboard" }),
    level: t.Numeric({ description: "The level of the user" }),
    xp: t.Numeric({ description: "The XP of the user" }),
    userid: t.String({ description: "The user ID of the user" }),
    avatar: t.String({ description: "Full Discord CDN link to the user's avatar" }),
    username: t.String({ description: "Username of the user" }),
    progress: t.Tuple([t.Numeric(), t.Numeric()], {
        description:
            "The progress of the user in the current level. First object is the required XP left before the next level, second object is the progress in percentage."
    })
});

const DashboardPackCommentSchema = t.Object(
    {
        id: t.String({ description: "The ID of the comment" }),
        packid: t.String({ description: "The pack ID this comment is written for" }),
        userid: t.String({ description: "The user ID of the author" }),
        comment: t.String({ description: "The comment body in Markdown format" }),
        date: t.Numeric({ description: "The date the comment was submitted in UNIX millisecond timestamp", default: Date.now() })
    },
    { description: "The pack comment object" }
);

const DashboardFinalPackCommentSchema = t.Object({
    ...DashboardPackCommentSchema.properties,
    username: t.String({ description: "Username of the author" }),
    avatar: t.String({ description: "Full Discord CDN link to the author's avatar" })
});

const DashboardUserSchema = t.Object(
    {
        username: t.String({ description: "Username of the user" }),
        avatar: t.String({ description: "Full Discord CDN link to the user's avatar" })
    },
    { description: "The user object" }
);

export { type DashboardAPIInterface, type DashboardLbEntry, type DashboardPackComment, type DashboardFinalPackComment, type DashboardUser };
export { DashboardUserSchema, DashboardPackCommentSchema, DashboardFinalPackCommentSchema, DashboardLbEntrySchema };
