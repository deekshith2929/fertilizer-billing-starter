package com.example.fertilizer.location;

import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/location-captures")
@CrossOrigin(origins = "${FRONTEND_ORIGIN_LOCATION:http://127.0.0.1:5500}", allowCredentials = "true")
public class LocationCaptureController {
    private final LocationCaptureRepository repository;

    public LocationCaptureController(LocationCaptureRepository repository) {
        this.repository = repository;
    }

    @PostMapping
    public ResponseEntity<Long> create(@Valid @RequestBody LocationCaptureRequest request) {
        long id = repository.create(request);
        return ResponseEntity.created(URI.create("/api/location-captures/" + id)).body(id);
    }
}
