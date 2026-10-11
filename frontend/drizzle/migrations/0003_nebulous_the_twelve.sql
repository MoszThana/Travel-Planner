CREATE TABLE `trip_invites` (
	`token` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `trips` ADD `budget` real;--> statement-breakpoint
ALTER TABLE `trips` ADD `currency` text DEFAULT 'THB' NOT NULL;