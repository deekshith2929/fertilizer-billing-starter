CREATE TABLE location_captures (
    id BIGSERIAL PRIMARY KEY,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy_meters NUMERIC(12, 3) NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    comments TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
