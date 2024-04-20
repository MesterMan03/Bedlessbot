export default process.env.NODE_ENV === "production"
    ? { // production config
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
              { level: 100, id: "1226269908619493407" },
          ],
          AllowedRolesCommand: [
              "706912080736944128", // German
              "692111773817503766", // Chinese
          ],
          NoXPRole: "709426191404368053",
          NoXPChannels: [
            "709584818010062868", // counting
          ]
      }
    : { // development config, useful for testing
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
              { level: 100, id: "1074393963995336753" },
          ],
          AllowedRolesCommand: [
              "1095817061697081454", // German
          ],
          NoXPRole: "0",
          NoXPChannels: [
            "0"
          ]
      };
