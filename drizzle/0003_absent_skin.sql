ALTER TABLE "game_batting_lines" ADD COLUMN "game_date_us" date;--> statement-breakpoint
ALTER TABLE "game_batting_lines" ADD COLUMN "opponent_team_id" integer;--> statement-breakpoint
ALTER TABLE "game_batting_lines" ADD COLUMN "is_home" boolean;--> statement-breakpoint
ALTER TABLE "game_pitching_lines" ADD COLUMN "game_date_us" date;--> statement-breakpoint
ALTER TABLE "game_pitching_lines" ADD COLUMN "opponent_team_id" integer;--> statement-breakpoint
ALTER TABLE "game_pitching_lines" ADD COLUMN "is_home" boolean;--> statement-breakpoint
UPDATE "game_batting_lines" AS line
SET game_date_us = game.game_date_us,
    opponent_team_id = CASE
      WHEN line.team_id = game.home_team_id THEN game.away_team_id
      WHEN line.team_id = game.away_team_id THEN game.home_team_id
      ELSE NULL
    END,
    is_home = CASE
      WHEN line.team_id = game.home_team_id THEN true
      WHEN line.team_id = game.away_team_id THEN false
      ELSE NULL
    END
FROM "games" AS game
WHERE game.game_pk = line.game_pk;--> statement-breakpoint
UPDATE "game_pitching_lines" AS line
SET game_date_us = game.game_date_us,
    opponent_team_id = CASE
      WHEN line.team_id = game.home_team_id THEN game.away_team_id
      WHEN line.team_id = game.away_team_id THEN game.home_team_id
      ELSE NULL
    END,
    is_home = CASE
      WHEN line.team_id = game.home_team_id THEN true
      WHEN line.team_id = game.away_team_id THEN false
      ELSE NULL
    END
FROM "games" AS game
WHERE game.game_pk = line.game_pk;--> statement-breakpoint
ALTER TABLE "game_batting_lines" ALTER COLUMN "game_date_us" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_pitching_lines" ALTER COLUMN "game_date_us" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_batting_lines" DROP CONSTRAINT "game_batting_lines_game_pk_games_game_pk_fk";--> statement-breakpoint
ALTER TABLE "game_pitching_lines" DROP CONSTRAINT "game_pitching_lines_game_pk_games_game_pk_fk";--> statement-breakpoint
ALTER TABLE "game_batting_lines" ADD CONSTRAINT "game_batting_lines_opponent_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_pitching_lines" ADD CONSTRAINT "game_pitching_lines_opponent_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;
