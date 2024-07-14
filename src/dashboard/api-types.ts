import type { User } from "discord-oauth2";
import { t } from "elysia";

interface DashboardAPIInterface {
    FetchLbPage: (pageOrId: number | string) => Promise<DashboardLbEntry[] | null>;
    CreateOAuth2Url: (state: string, origin: string) => string;
    ProcessOAuth2Callback: (code: string) => Promise<User | null>;
    SubmitPackComment: (userid: string, packid: string, comment: string, captcha: string) => Promise<DashboardPackComment | null>;
    ManagePackComment: (commentid: string, action: "approve" | "deny" | "spam") => Promise<boolean>;
    FetchPackComments: (packid: string, page: number) => Promise<DashboardFinalPackComment[] | null>;
    GetUser: (userid: string) => Promise<DashboardUser | null>;
    RegisterPushSubscription: (userid: string, subscription: PushSubscriptionData) => void;
    UnregisterPushSubscription: (userid: string, endpoint: string) => void;
    SendPushNotification: (userid: string, notification: NotificationData) => void;
    GetMaxCommentsPage: (packid: string) => number;
}

interface PushSubscriptionData {
    endpoint: string;
    expirationTime?: number | null;
    keys: Record<string, string>;
}

interface NotificationData {
    title: string;
    body: string;
    tag: string;
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

interface PackData {
    packs: {
        id: string;
        icon: string;
        variant?: string;
        short_name: string;
        friendly_name: string;
        description: string;
        downloads: {
            "1.8.9": string;
            "1.20.5"?: string;
            bedrock?: string;
        };
    }[];
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

const PackDataSchema = t.Object({
    packs: t.Array(
        t.Object({
            id: t.String({ description: "ID of the pack" }),
            icon: t.String({ description: "Name of the icon. The full path is CDN/icons/icon" }),
            variant: t.Optional(t.String({ description: "The pack ID this pack is a variant of - optional" })),
            short_name: t.String({ description: "Short name of the pack" }),
            friendly_name: t.String({ description: "Friendly name of the pack" }),
            description: t.String({ description: "Description of the pack in Markdown format" }),
            downloads: t.Object(
                {
                    "1.8.9": t.String({ description: "Download link for the 1.8.9 version" }),
                    "1.20.5": t.Optional(t.String({ description: "Download link for the 1.20.5 version - optional" })),
                    bedrock: t.Optional(t.String({ description: "Download link for Bedrock - optional" }))
                },
                { description: "Download links for the pack" }
            )
        })
    )
});

export {
    type DashboardAPIInterface,
    type DashboardLbEntry,
    type DashboardPackComment,
    type DashboardFinalPackComment,
    type DashboardUser,
    type PackData,
    type PushSubscriptionData,
    type NotificationData
};
export { DashboardUserSchema, DashboardPackCommentSchema, DashboardFinalPackCommentSchema, DashboardLbEntrySchema, PackDataSchema };
