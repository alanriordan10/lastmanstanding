CREATE TABLE password_reset_tokens (
    id         BIGSERIAL    NOT NULL,
    user_id    BIGINT       NOT NULL,
    token      VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP    NOT NULL,
    used       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_prt_token UNIQUE (token),
    CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
