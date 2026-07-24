CREATE TYPE "public"."affiliation" AS ENUM('rostered', 'dfa', 'free_agent', 'released', 'departed');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('statsapi', 'manual');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'live', 'final', 'postponed', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."handedness" AS ENUM('L', 'R', 'S');--> statement-breakpoint
CREATE TYPE "public"."health" AS ENUM('active', 'il');--> statement-breakpoint
CREATE TYPE "public"."player_lifecycle" AS ENUM('tracked', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recent_form_pattern" AS ENUM('career_high', 'season_high', 'streak', 'single_game', 'recent_agg', 'status_fallback');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('morning', 'evening', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."team_level" AS ENUM('mlb', 'aaa', 'aa', 'a_plus', 'a', 'rookie');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('sign', 'call_up', 'send_down', 'trade', 'dfa', 'release', 'il_on', 'il_off', 'depart', 'other');--> statement-breakpoint
CREATE TABLE "players" (
	"mlb_player_id" integer PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text,
	"primary_position" text,
	"bats" "handedness",
	"throws" "handedness",
	"birthdate" date,
	"lifecycle" "player_lifecycle" DEFAULT 'tracked' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"mlb_team_id" integer PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text,
	"abbrev" text,
	"level" "team_level" NOT NULL,
	"parent_org_team_id" integer
);
--> statement-breakpoint
CREATE TABLE "player_current_status" (
	"player_id" integer PRIMARY KEY NOT NULL,
	"affiliation" "affiliation" NOT NULL,
	"team_id" integer,
	"level" "team_level",
	"health" "health" NOT NULL,
	"il_detail" text,
	"as_of_event_id" bigint,
	"projected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_tx_id" text,
	"player_id" integer NOT NULL,
	"type" "transaction_type" NOT NULL,
	"effective_date" date NOT NULL,
	"announced_at" timestamp with time zone,
	"from_team_id" integer,
	"to_team_id" integer,
	"il_detail" text,
	"description" text,
	"source" "event_source" NOT NULL,
	CONSTRAINT "transaction_events_source_tx_id_unique" UNIQUE("source_tx_id")
);
--> statement-breakpoint
CREATE TABLE "game_batting_lines" (
	"player_id" integer NOT NULL,
	"game_pk" integer NOT NULL,
	"team_id" integer,
	"level" "team_level" NOT NULL,
	"pa" integer DEFAULT 0 NOT NULL,
	"ab" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"doubles" integer DEFAULT 0 NOT NULL,
	"triples" integer DEFAULT 0 NOT NULL,
	"hr" integer DEFAULT 0 NOT NULL,
	"rbi" integer DEFAULT 0 NOT NULL,
	"r" integer DEFAULT 0 NOT NULL,
	"bb" integer DEFAULT 0 NOT NULL,
	"so" integer DEFAULT 0 NOT NULL,
	"sb" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "game_batting_lines_player_id_game_pk_pk" PRIMARY KEY("player_id","game_pk")
);
--> statement-breakpoint
CREATE TABLE "game_pitching_lines" (
	"player_id" integer NOT NULL,
	"game_pk" integer NOT NULL,
	"team_id" integer,
	"level" "team_level" NOT NULL,
	"started" boolean DEFAULT false NOT NULL,
	"ip_outs" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"r" integer DEFAULT 0 NOT NULL,
	"er" integer DEFAULT 0 NOT NULL,
	"bb" integer DEFAULT 0 NOT NULL,
	"so" integer DEFAULT 0 NOT NULL,
	"hr" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "game_pitching_lines_player_id_game_pk_pk" PRIMARY KEY("player_id","game_pk")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"game_pk" integer PRIMARY KEY NOT NULL,
	"level" "team_level" NOT NULL,
	"game_date_us" date NOT NULL,
	"start_time_utc" timestamp with time zone,
	"home_team_id" integer,
	"away_team_id" integer,
	"venue_name" text,
	"status" "game_status" NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"game_number" integer,
	"games_in_series" integer,
	"series_game_number" integer,
	"probable_home_pitcher_id" integer,
	"probable_away_pitcher_id" integer
);
--> statement-breakpoint
CREATE TABLE "season_batting_stats" (
	"player_id" integer NOT NULL,
	"season" integer NOT NULL,
	"level" "team_level" NOT NULL,
	"team_id" integer NOT NULL,
	"g" integer DEFAULT 0 NOT NULL,
	"pa" integer DEFAULT 0 NOT NULL,
	"ab" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"doubles" integer DEFAULT 0 NOT NULL,
	"triples" integer DEFAULT 0 NOT NULL,
	"hr" integer DEFAULT 0 NOT NULL,
	"rbi" integer DEFAULT 0 NOT NULL,
	"r" integer DEFAULT 0 NOT NULL,
	"sb" integer DEFAULT 0 NOT NULL,
	"cs" integer DEFAULT 0 NOT NULL,
	"bb" integer DEFAULT 0 NOT NULL,
	"so" integer DEFAULT 0 NOT NULL,
	"hbp" integer DEFAULT 0 NOT NULL,
	"sf" integer DEFAULT 0 NOT NULL,
	"woba" real,
	"xwoba" real,
	"wrc_plus" real,
	"war" real,
	"source_updated_at" timestamp with time zone,
	CONSTRAINT "season_batting_stats_player_id_season_level_team_id_pk" PRIMARY KEY("player_id","season","level","team_id")
);
--> statement-breakpoint
CREATE TABLE "season_pitching_stats" (
	"player_id" integer NOT NULL,
	"season" integer NOT NULL,
	"level" "team_level" NOT NULL,
	"team_id" integer NOT NULL,
	"g" integer DEFAULT 0 NOT NULL,
	"gs" integer DEFAULT 0 NOT NULL,
	"ip_outs" integer DEFAULT 0 NOT NULL,
	"bf" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"r" integer DEFAULT 0 NOT NULL,
	"er" integer DEFAULT 0 NOT NULL,
	"hr" integer DEFAULT 0 NOT NULL,
	"bb" integer DEFAULT 0 NOT NULL,
	"so" integer DEFAULT 0 NOT NULL,
	"w" integer DEFAULT 0 NOT NULL,
	"l" integer DEFAULT 0 NOT NULL,
	"sv" integer DEFAULT 0 NOT NULL,
	"hld" integer DEFAULT 0 NOT NULL,
	"fip" real,
	"lob_pct" real,
	"war" real,
	"source_updated_at" timestamp with time zone,
	CONSTRAINT "season_pitching_stats_player_id_season_level_team_id_pk" PRIMARY KEY("player_id","season","level","team_id")
);
--> statement-breakpoint
CREATE TABLE "player_recent_form" (
	"player_id" integer PRIMARY KEY NOT NULL,
	"sentence_zh" text NOT NULL,
	"pattern" "recent_form_pattern" NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"endpoint" text,
	"params" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sync_status" NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_parent_org_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("parent_org_team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_current_status" ADD CONSTRAINT "player_current_status_player_id_players_mlb_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("mlb_player_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_current_status" ADD CONSTRAINT "player_current_status_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_current_status" ADD CONSTRAINT "player_current_status_as_of_event_id_transaction_events_id_fk" FOREIGN KEY ("as_of_event_id") REFERENCES "public"."transaction_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_player_id_players_mlb_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("mlb_player_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_from_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("from_team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_to_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("to_team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_batting_lines" ADD CONSTRAINT "game_batting_lines_player_id_players_mlb_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("mlb_player_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_batting_lines" ADD CONSTRAINT "game_batting_lines_game_pk_games_game_pk_fk" FOREIGN KEY ("game_pk") REFERENCES "public"."games"("game_pk") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_batting_lines" ADD CONSTRAINT "game_batting_lines_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_pitching_lines" ADD CONSTRAINT "game_pitching_lines_player_id_players_mlb_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("mlb_player_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_pitching_lines" ADD CONSTRAINT "game_pitching_lines_game_pk_games_game_pk_fk" FOREIGN KEY ("game_pk") REFERENCES "public"."games"("game_pk") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_pitching_lines" ADD CONSTRAINT "game_pitching_lines_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_batting_stats" ADD CONSTRAINT "season_batting_stats_player_id_players_mlb_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("mlb_player_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_batting_stats" ADD CONSTRAINT "season_batting_stats_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_pitching_stats" ADD CONSTRAINT "season_pitching_stats_player_id_players_mlb_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("mlb_player_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_pitching_stats" ADD CONSTRAINT "season_pitching_stats_team_id_teams_mlb_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("mlb_team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_recent_form" ADD CONSTRAINT "player_recent_form_player_id_players_mlb_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("mlb_player_id") ON DELETE no action ON UPDATE no action;