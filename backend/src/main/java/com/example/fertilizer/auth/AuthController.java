package com.example.fertilizer.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private final AuthRepository repository;
    private final PasswordHasher passwordHasher;

    public AuthController(AuthRepository repository, PasswordHasher passwordHasher) {
        this.repository = repository;
        this.passwordHasher = passwordHasher;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest,
                               HttpSession session) {
        String normalizedUsername = request.username().trim();
        log.info("Login attempt received for username={}", normalizedUsername);
        AuthRepository.AuthenticatedUser user = repository.findActiveUser(normalizedUsername)
                .orElseThrow(() -> invalidCredentials(normalizedUsername));
        if (!passwordHasher.matches(request.password(), user.passwordHash()))
            throw invalidCredentials(normalizedUsername);
        servletRequest.changeSessionId();
        session.setAttribute("userId", user.id());
        log.info("Database login successful for username={}", normalizedUsername);
        return new LoginResponse(user.id(), user.username(), user.fullName(), user.role(),
                user.dealerId(), user.dealerName(), user.stateCode(), user.aglNo(), user.plNo(),
                user.permissions());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.noContent().build();
    }

    private ResponseStatusException invalidCredentials(String username) {
        log.warn("Login rejected for username={}", username);
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
    }
}
