const ApplyRoles = <const>[
    "dragclick",
    "16cps",
    "eagle",
    "witchly",
    "breezily",
    "goodpvp",
    "moonwalk",
    "god",
    "diagod",
    "telly",
    "0cpsgod"
];

type ApplyRole = (typeof ApplyRoles)[number];

function isApplyRole(role: string): role is ApplyRole {
    return ApplyRoles.includes(role as ApplyRole);
}

const prodConfig = {
    // production config
    LevelRoles: [
        { level: 10, id: "746063829892595792" },
        { level: 20, id: "746064036692492324" },
        { level: 30, id: "746064292880711760" },
        { level: 40, id: "746067154348015657" },
        { level: 50, id: "746067270819774486" },
        { level: 60, id: "773655087863824435" },
        { level: 70, id: "773657513254060064" },
        { level: 80, id: "773657670926336031" },
        { level: 90, id: "1226269833876996106" },
        { level: 100, id: "1226269908619493407" }
    ],
    AllowedRolesCommand: [
        "706912080736944128", // German
        "692111773817503766" // Chinese
    ],
    NoXPRole: "709426191404368053",
    NoXPChannels: [
        "709584818010062868" // counting
    ],
    QuickTimeChannels: [
        "692077134780432384" // English chat
    ],
    Channels: {
        Birthday: "692077134780432384",
        Levelup: "709235446298968114",
        Applications: "1223818111996661770",
        Guide: "692074640486563871",
        GuideMessage: "1223815275099717766",
        Outcome: "692075719726989312",
        ToReview: "771791897806766112",
        PackComments: "1246489783530684589"
    },
    Roles: {
        Birthday: "715495353159254018"
    },
    RoleToName: {
        dragclick: "Drag clicker",
        "16cps": "16+ CPS",
        eagle: "Eagle Bridger",
        witchly: "Witchly Bridger",
        breezily: "Breezily Bridger",
        goodpvp: "Good PvPer",
        moonwalk: "Moonwalker",
        god: "Godbridger",
        diagod: "Diagonal Godbridger",
        telly: "Telly Bridger",
        "0cpsgod": "0 CPS Godbridger"
    } as { [key in ApplyRole]: string },
    RoleToID: {
        dragclick: "1223797522523230290",
        "16cps": "1223797518626984088",
        eagle: "1223797538185019424",
        witchly: "1223797534200434759",
        breezily: "1223797530127499294",
        goodpvp: "1223797526336110714",
        moonwalk: "1223797542148640889",
        god: "1223797549933133866",
        diagod: "1223797545952874590",
        telly: "1223797553703944282",
        "0cpsgod": "1245099069064351827"
    } as { [key in ApplyRole]: string },
    OAuthRedirect: "/api/callback",
    DashOrigin: "https://bedless.mester.info"
};

// development config, useful for testing
const devConfig = {
    ...prodConfig,
    LevelRoles: [
        { level: 10, id: "1074393963626233943" },
        { level: 20, id: "1074393963626233944" },
        { level: 30, id: "1074393963626233945" },
        { level: 40, id: "1074393963995336744" },
        { level: 50, id: "1074393963995336745" },
        { level: 60, id: "1074393963995336746" },
        { level: 70, id: "1074393963995336747" },
        { level: 80, id: "1074393963995336749" },
        { level: 90, id: "1074393963995336751" },
        { level: 100, id: "1074393963995336753" }
    ],
    AllowedRolesCommand: [
        "1095817061697081454" // German
    ],
    Channels: {
        Birthday: "1074393964788060178",
        Levelup: "1074393964788060178",
        Applications: "1224111389321203834",
        Guide: "1224111389321203834",
        GuideMessage: "1225827434679504896",
        Outcome: "1074393964788060178",
        ToReview: "1074393964788060178",
        PackComments: "1246489938510352395"
    },
    Roles: {
        Birthday: "1074393964016324691"
    },
    RoleToID: {
        dragclick: "1074393964016324691",
        "16cps": "1074393964016324691",
        eagle: "1074393964016324691",
        witchly: "1074393964016324691",
        breezily: "1074393964016324691",
        goodpvp: "1074393964016324691",
        moonwalk: "1074393964016324691",
        god: "1074393964016324691",
        diagod: "1074393964016324691",
        telly: "1074393964016324691",
        "0cpsgod": "1074393964016324691"
    } as { [key in ApplyRole]: string },
    OAuthRedirect: "/api/callback",
    DashOrigin: "https://9h963rrm-8146.euw.devtunnels.ms/"
};

export default process.env.NODE_ENV === "production" ? prodConfig : devConfig;

export { type ApplyRole, isApplyRole };
