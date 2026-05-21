CREATE TABLE IF NOT EXISTS mobile_push_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mobile_push_token UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user_id ON mobile_push_tokens(user_id);
