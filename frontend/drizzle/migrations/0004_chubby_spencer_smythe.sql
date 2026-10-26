CREATE TABLE `trip_events` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `created_by` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `updated_by` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `updated_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `reset_code_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `reset_expires` integer;