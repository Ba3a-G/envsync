package commands

import (
	"github.com/urfave/cli/v3"

	"github.com/EnvSync-Cloud/envsync/packages/envsync-cli/internal/features/handlers"
)

func RequestCommands(handler *handlers.RequestHandler) *cli.Command {
	return &cli.Command{
		Name:  "request",
		Usage: "Create and review protected environment change requests",
		Commands: []*cli.Command{
			{
				Name:   "create-direct",
				Usage:  "Create a direct protected-environment change request",
				Action: handler.CreateDirect,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "app-id", Usage: "Application ID", Required: true},
					&cli.StringFlag{Name: "target-env-type-id", Usage: "Target environment type ID", Required: true},
					&cli.StringFlag{Name: "title", Usage: "Request title", Required: true},
					&cli.StringFlag{Name: "message", Usage: "Request message", Required: true},
					&cli.StringFlag{Name: "env-key", Usage: "Optional env key"},
					&cli.StringFlag{Name: "env-value", Usage: "Optional env value"},
					&cli.StringFlag{Name: "env-operation", Usage: "CREATE, UPDATE, or DELETE", Value: "CREATE"},
					&cli.StringFlag{Name: "secret-key", Usage: "Optional secret key"},
					&cli.StringFlag{Name: "secret-value", Usage: "Optional secret value"},
					&cli.StringFlag{Name: "secret-operation", Usage: "CREATE, UPDATE, or DELETE", Value: "CREATE"},
				},
			},
			{
				Name:   "create-promotion",
				Usage:  "Create a promotion request from one environment to another",
				Action: handler.CreatePromotion,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "app-id", Usage: "Application ID", Required: true},
					&cli.StringFlag{Name: "source-env-type-id", Usage: "Source environment type ID", Required: true},
					&cli.StringFlag{Name: "target-env-type-id", Usage: "Target environment type ID", Required: true},
					&cli.StringFlag{Name: "title", Usage: "Request title", Required: true},
					&cli.StringFlag{Name: "message", Usage: "Request message", Required: true},
				},
			},
			{Name: "list", Usage: "List change requests", Action: handler.List},
			{
				Name:   "get",
				Usage:  "Fetch a change request",
				Action: handler.Get,
				Flags:  []cli.Flag{&cli.StringFlag{Name: "id", Usage: "Change request ID", Required: true}},
			},
			{
				Name:   "approve",
				Usage:  "Approve and apply a change request",
				Action: handler.Approve,
				Flags:  []cli.Flag{&cli.StringFlag{Name: "id", Usage: "Change request ID", Required: true}},
			},
			{
				Name:   "reject",
				Usage:  "Reject a change request",
				Action: handler.Reject,
				Flags: []cli.Flag{
					&cli.StringFlag{Name: "id", Usage: "Change request ID", Required: true},
					&cli.StringFlag{Name: "reason", Usage: "Rejection reason", Required: true},
				},
			},
			{
				Name:   "cancel",
				Usage:  "Cancel your own pending request",
				Action: handler.Cancel,
				Flags:  []cli.Flag{&cli.StringFlag{Name: "id", Usage: "Change request ID", Required: true}},
			},
		},
	}
}
