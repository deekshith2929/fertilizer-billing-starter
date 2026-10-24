package com.example.fertilizer.auth;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "http://localhost:5173")
public class AuthController {
    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> x) {
        if (!"admin".equals(x.get("username")) || !"admin123".equals(x.get("password")))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Invalid demo credentials");
        return Map.of("username", "admin", "fullName", "Demo Admin", "role", "ADMIN", "dealerId", 1, "dealerName", "NATARAJA FERTILIZERS");
    }
}
