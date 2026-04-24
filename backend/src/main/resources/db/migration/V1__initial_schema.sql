-- =============================================================================
-- V1__initial_schema.sql
-- Last Man Standing - Premier League Survival Game
-- Initial database schema (PostgreSQL)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            BIGSERIAL     NOT NULL,
    email         VARCHAR(255)  NOT NULL,
    username      VARCHAR(100)  NOT NULL,
    password_hash VARCHAR(255)  NOT NULL,
    role          VARCHAR(20)   NOT NULL DEFAULT 'USER',
    created_at    TIMESTAMP     NOT NULL,
    updated_at    TIMESTAMP     NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_users_email    UNIQUE (email),
    CONSTRAINT uk_users_username UNIQUE (username),
    CONSTRAINT chk_users_role CHECK (role IN ('USER', 'ADMIN'))
);

-- ---------------------------------------------------------------------------
-- 2. teams
-- ---------------------------------------------------------------------------
CREATE TABLE teams (
    id               BIGSERIAL    NOT NULL,
    name             VARCHAR(100) NOT NULL,
    short_name       VARCHAR(10)  NULL,
    external_team_id VARCHAR(100) NULL,
    logo_url         VARCHAR(500) NULL,
    created_at       TIMESTAMP    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_teams_name UNIQUE (name)
);
CREATE INDEX idx_teams_external_team_id ON teams (external_team_id);

-- ---------------------------------------------------------------------------
-- 3. competitions
-- ---------------------------------------------------------------------------
CREATE TABLE competitions (
    id                      BIGSERIAL     NOT NULL,
    name                    VARCHAR(255)  NOT NULL,
    description             TEXT          NULL,
    entry_fee               DECIMAL(10,2) NOT NULL DEFAULT 0,
    status                  VARCHAR(20)   NOT NULL DEFAULT 'UPCOMING',
    missed_pick_mode        VARCHAR(20)   NOT NULL DEFAULT 'ELIMINATE',
    postponed_consumes_team BOOLEAN       NOT NULL DEFAULT TRUE,
    start_date              DATE          NOT NULL,
    created_by              BIGINT        NOT NULL,
    created_at              TIMESTAMP     NOT NULL,
    updated_at              TIMESTAMP     NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_competitions_status CHECK (status IN ('UPCOMING', 'ACTIVE', 'COMPLETED')),
    CONSTRAINT chk_competitions_missed_pick_mode CHECK (missed_pick_mode IN ('AUTO_ASSIGN', 'ELIMINATE')),
    CONSTRAINT fk_competitions_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);
CREATE INDEX idx_competitions_status     ON competitions (status);
CREATE INDEX idx_competitions_start_date ON competitions (start_date);
CREATE INDEX idx_competitions_created_by ON competitions (created_by);

-- ---------------------------------------------------------------------------
-- 4. competition_participants
-- ---------------------------------------------------------------------------
CREATE TABLE competition_participants (
    id              BIGSERIAL   NOT NULL,
    competition_id  BIGINT      NOT NULL,
    user_id         BIGINT      NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    eliminated_week INT         NULL,
    joined_at       TIMESTAMP   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_comp_participant UNIQUE (competition_id, user_id),
    CONSTRAINT chk_cp_status CHECK (status IN ('ACTIVE', 'ELIMINATED', 'WINNER')),
    CONSTRAINT fk_comp_participants_competition FOREIGN KEY (competition_id) REFERENCES competitions (id),
    CONSTRAINT fk_comp_participants_user        FOREIGN KEY (user_id)        REFERENCES users (id)
);
CREATE INDEX idx_comp_participants_user_id ON competition_participants (user_id);
CREATE INDEX idx_comp_participants_status  ON competition_participants (competition_id, status);

-- ---------------------------------------------------------------------------
-- 5. gameweeks
-- ---------------------------------------------------------------------------
CREATE TABLE gameweeks (
    id             BIGSERIAL   NOT NULL,
    competition_id BIGINT      NOT NULL,
    week_number    INT         NOT NULL,
    lock_at        TIMESTAMP   NOT NULL,
    starts_at      TIMESTAMP   NOT NULL,
    ends_at        TIMESTAMP   NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'UPCOMING',
    PRIMARY KEY (id),
    CONSTRAINT uk_gameweek UNIQUE (competition_id, week_number),
    CONSTRAINT chk_gameweeks_status CHECK (status IN ('UPCOMING', 'LOCKED', 'IN_PROGRESS', 'COMPLETED')),
    CONSTRAINT fk_gameweeks_competition FOREIGN KEY (competition_id) REFERENCES competitions (id)
);
CREATE INDEX idx_gameweeks_status ON gameweeks (status);

-- ---------------------------------------------------------------------------
-- 6. fixtures
-- ---------------------------------------------------------------------------
CREATE TABLE fixtures (
    id                     BIGSERIAL    NOT NULL,
    gameweek_id            BIGINT       NOT NULL,
    external_fixture_id    VARCHAR(100) NULL,

    imported_home_team_id  BIGINT       NULL,
    imported_away_team_id  BIGINT       NULL,
    imported_kickoff_at    TIMESTAMP    NULL,
    imported_status        VARCHAR(20)  NOT NULL DEFAULT 'SCHEDULED',
    imported_score_home    INT          NULL,
    imported_score_away    INT          NULL,

    override_home_team_id  BIGINT       NULL,
    override_away_team_id  BIGINT       NULL,
    override_kickoff_at    TIMESTAMP    NULL,
    override_status        VARCHAR(20)  NULL,
    override_score_home    INT          NULL,
    override_score_away    INT          NULL,

    last_synced_at         TIMESTAMP    NULL,
    created_at             TIMESTAMP    NOT NULL,
    updated_at             TIMESTAMP    NULL,

    PRIMARY KEY (id),
    CONSTRAINT chk_fixtures_imported_status CHECK (imported_status IN ('SCHEDULED', 'IN_PLAY', 'FINISHED', 'POSTPONED', 'CANCELLED')),
    CONSTRAINT chk_fixtures_override_status CHECK (override_status IN ('SCHEDULED', 'IN_PLAY', 'FINISHED', 'POSTPONED', 'CANCELLED')),
    CONSTRAINT fk_fixtures_gameweek            FOREIGN KEY (gameweek_id)           REFERENCES gameweeks (id),
    CONSTRAINT fk_fixtures_imported_home_team  FOREIGN KEY (imported_home_team_id) REFERENCES teams (id),
    CONSTRAINT fk_fixtures_imported_away_team  FOREIGN KEY (imported_away_team_id) REFERENCES teams (id),
    CONSTRAINT fk_fixtures_override_home_team  FOREIGN KEY (override_home_team_id) REFERENCES teams (id),
    CONSTRAINT fk_fixtures_override_away_team  FOREIGN KEY (override_away_team_id) REFERENCES teams (id)
);
CREATE INDEX idx_fixtures_gameweek_id         ON fixtures (gameweek_id);
CREATE INDEX idx_fixtures_external_fixture_id ON fixtures (external_fixture_id);
CREATE INDEX idx_fixtures_imported_home_team  ON fixtures (imported_home_team_id);
CREATE INDEX idx_fixtures_imported_away_team  ON fixtures (imported_away_team_id);
CREATE INDEX idx_fixtures_override_home_team  ON fixtures (override_home_team_id);
CREATE INDEX idx_fixtures_override_away_team  ON fixtures (override_away_team_id);
CREATE INDEX idx_fixtures_imported_status     ON fixtures (imported_status);

-- ---------------------------------------------------------------------------
-- 7. picks
-- ---------------------------------------------------------------------------
CREATE TABLE picks (
    id             BIGSERIAL   NOT NULL,
    competition_id BIGINT      NOT NULL,
    user_id        BIGINT      NOT NULL,
    gameweek_id    BIGINT      NOT NULL,
    team_id        BIGINT      NOT NULL,
    picked_at      TIMESTAMP   NOT NULL,
    source         VARCHAR(10) NOT NULL DEFAULT 'USER',
    locked         BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT uk_pick_per_week  UNIQUE (competition_id, user_id, gameweek_id),
    CONSTRAINT uk_pick_team_once UNIQUE (competition_id, user_id, team_id),
    CONSTRAINT chk_picks_source CHECK (source IN ('USER', 'AUTO')),
    CONSTRAINT fk_picks_competition FOREIGN KEY (competition_id) REFERENCES competitions (id),
    CONSTRAINT fk_picks_user        FOREIGN KEY (user_id)        REFERENCES users (id),
    CONSTRAINT fk_picks_gameweek    FOREIGN KEY (gameweek_id)    REFERENCES gameweeks (id),
    CONSTRAINT fk_picks_team        FOREIGN KEY (team_id)        REFERENCES teams (id)
);
CREATE INDEX idx_picks_user_id     ON picks (user_id);
CREATE INDEX idx_picks_gameweek_id ON picks (gameweek_id);
CREATE INDEX idx_picks_team_id     ON picks (team_id);

-- ---------------------------------------------------------------------------
-- 8. pick_results
-- ---------------------------------------------------------------------------
CREATE TABLE pick_results (
    id          BIGSERIAL   NOT NULL,
    pick_id     BIGINT      NOT NULL,
    outcome     VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    resolved_at TIMESTAMP   NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_pick_results_pick_id UNIQUE (pick_id),
    CONSTRAINT chk_pick_results_outcome CHECK (outcome IN ('PENDING', 'ADVANCE', 'ELIMINATED', 'POSTPONED_ADVANCE')),
    CONSTRAINT fk_pick_results_pick FOREIGN KEY (pick_id) REFERENCES picks (id)
);

-- ---------------------------------------------------------------------------
-- 9. audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id          BIGSERIAL    NOT NULL,
    user_id     BIGINT       NULL,
    entity_type VARCHAR(50)  NOT NULL,
    entity_id   BIGINT       NOT NULL,
    field_name  VARCHAR(100) NULL,
    old_value   TEXT         NULL,
    new_value   TEXT         NULL,
    action      VARCHAR(50)  NOT NULL,
    created_at  TIMESTAMP    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE INDEX idx_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity     ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_action     ON audit_logs (action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
