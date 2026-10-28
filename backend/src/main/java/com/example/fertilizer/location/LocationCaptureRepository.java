package com.example.fertilizer.location;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LocationCaptureRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public LocationCaptureRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public long create(LocationCaptureRequest request) {
        String comments;
        try {
            comments = objectMapper.writeValueAsString(request);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize location capture payload.", ex);
        }

        Long id = jdbc.queryForObject("""
                INSERT INTO location_captures
                    (latitude, longitude, accuracy_meters, captured_at, comments)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, request.latitude(), request.longitude(), request.accuracyMeters(),
                Timestamp.from(request.capturedAt()), comments);
        if (id == null) {
            throw new IllegalStateException("Location capture was not created.");
        }
        return id;
    }
}
