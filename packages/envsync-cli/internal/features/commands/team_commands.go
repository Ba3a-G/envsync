package commands

import (
	"github.com/urfave/cli/v3"

	"github.com/EnvSync-Cloud/envsync/packages/envsync-cli/internal/features/handlers"
)

func TeamCommands(handler *handlers.TeamHandler) *cli.Command {
	return &cli.Command{
		Name:  "team",
		Usage: "Manage teams, membership, and team roles",
		Commands: []*cli.Command{
			{Name: "list", Usage: "List teams", Action: handler.List},
			{
				Name:   "create",
				Usage:  "Create a team",
				Action: handler.Create,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "name", Usage: "Team name", Required: true},
					&cli.StringFlag{Name: "description", Usage: "Team description"},
					&cli.StringFlag{Name: "color", Usage: "Team color", Value: "#8b5cf6"},
				},
			},
			{
				Name:   "update",
				Usage:  "Update a team",
				Action: handler.Update,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "id", Usage: "Team ID", Required: true},
					&cli.StringFlag{Name: "name", Usage: "Team name"},
					&cli.StringFlag{Name: "description", Usage: "Team description"},
					&cli.StringFlag{Name: "color", Usage: "Team color"},
				},
			},
			{
				Name:   "delete",
				Usage:  "Delete a team",
				Action: handler.Delete,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "id", Usage: "Team ID", Required: true},
				},
			},
			{
				Name:   "add-member",
				Usage:  "Add a user to a team",
				Action: handler.AddMember,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "id", Usage: "Team ID", Required: true},
					&cli.StringFlag{Name: "user-id", Usage: "User ID", Required: true},
				},
			},
			{
				Name:   "remove-member",
				Usage:  "Remove a user from a team",
				Action: handler.RemoveMember,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "id", Usage: "Team ID", Required: true},
					&cli.StringFlag{Name: "user-id", Usage: "User ID", Required: true},
				},
			},
			{
				Name:   "assign-role",
				Usage:  "Assign an org role to a team",
				Action: handler.AssignRole,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "id", Usage: "Team ID", Required: true},
					&cli.StringFlag{Name: "role-id", Usage: "Role ID", Required: true},
				},
			},
			{
				Name:   "unassign-role",
				Usage:  "Remove a team role",
				Action: handler.UnassignRole,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "id", Usage: "Team ID", Required: true},
				},
			},
		},
	}
}
