package commands

import (
	"github.com/urfave/cli/v3"

	"github.com/EnvSync-Cloud/envsync/packages/envsync-cli/internal/features/handlers"
)

func AccessCommands(handler *handlers.AccessHandler) *cli.Command {
	return &cli.Command{
		Name:  "access",
		Usage: "Inspect and manage app access grants",
		Commands: []*cli.Command{
			{
				Name:  "app",
				Usage: "Manage app access",
				Commands: []*cli.Command{
					{
						Name:   "grant",
						Usage:  "Grant direct user or team app access",
						Action: handler.GrantApp,
						Flags:  accessGrantFlags(),
					},
					{
						Name:   "revoke",
						Usage:  "Revoke direct user or team app access",
						Action: handler.RevokeApp,
						Flags:  accessGrantFlags(),
					},
					{
						Name:   "grants",
						Usage:  "List direct app grants",
						Action: handler.GrantsApp,
						Flags: []cli.Flag{
							&cli.StringFlag{Name: "app-id", Usage: "Application ID", Required: true},
						},
					},
					{
						Name:   "effective",
						Usage:  "List effective user access including team inheritance",
						Action: handler.EffectiveApp,
						Flags: []cli.Flag{
							&cli.StringFlag{Name: "app-id", Usage: "Application ID", Required: true},
						},
					},
				},
			},
		},
	}
}

func accessGrantFlags() []cli.Flag {
	return []cli.Flag{
		&cli.StringFlag{Name: "app-id", Usage: "Application ID", Required: true},
		&cli.StringFlag{Name: "subject-id", Usage: "User or team ID", Required: true},
		&cli.StringFlag{Name: "subject-type", Usage: "user or team", Required: true},
		&cli.StringFlag{Name: "relation", Usage: "viewer, editor, or admin", Required: true},
	}
}
