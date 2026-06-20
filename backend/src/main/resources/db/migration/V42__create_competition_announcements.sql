CREATE TABLE competition_announcements (
    id BIGSERIAL PRIMARY KEY,
    competition_id BIGINT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(120) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_competition_announcements_comp_created
    ON competition_announcements (competition_id, created_at DESC);

CREATE TABLE competition_announcement_reads (
    announcement_id BIGINT NOT NULL REFERENCES competition_announcements(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX idx_announcement_reads_user
    ON competition_announcement_reads (user_id, read_at DESC);
