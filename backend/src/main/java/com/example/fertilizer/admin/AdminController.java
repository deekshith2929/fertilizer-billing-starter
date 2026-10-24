package com.example.fertilizer.admin;

import com.example.fertilizer.auth.AuthRepository;
import com.example.fertilizer.auth.PasswordHasher;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class AdminController {
    private static final Logger log = LoggerFactory.getLogger(AdminController.class);
    private final AdminRepository repository;
    private final AuthRepository authRepository;
    private final PasswordHasher passwordHasher;

    public AdminController(AdminRepository repository, AuthRepository authRepository,
                           PasswordHasher passwordHasher) {
        this.repository = repository;
        this.authRepository = authRepository;
        this.passwordHasher = passwordHasher;
    }

    @GetMapping("/dealers")
    public List<AdminRepository.DealerSummary> getDealers(HttpSession session) {
        requireAdmin(session);
        return repository.findActiveDealers();
    }

    @PostMapping("/dealers")
    @Transactional
    public ResponseEntity<AdminRepository.DealerSummary> createDealer(
            @Valid @RequestBody CreateDealerRequest request, HttpSession session) {
        requireAdmin(session);
        long id = repository.createDealer(request);
        AdminRepository.DealerSummary created = repository.findActiveDealers().stream()
                .filter(dealer -> dealer.id() == id)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Created dealer was not returned."));
        log.info("Admin created dealer id={} code={}", id, created.dealerCode());
        return ResponseEntity.created(URI.create("/api/admin/dealers/" + id)).body(created);
    }

    @GetMapping("/users")
    public List<AdminRepository.UserSummary> getUsers(HttpSession session) {
        requireAdmin(session);
        return repository.findUsers();
    }

    @PostMapping("/users")
    @Transactional
    public ResponseEntity<AdminRepository.UserSummary> createUser(
            @Valid @RequestBody CreateUserRequest request, HttpSession session) {
        long adminId = requireAdmin(session);
        if (!repository.dealerExists(request.dealerId()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select an active dealer.");
        if (!repository.roleExists(request.roleCode()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a valid role.");
        long userId = repository.createUser(request, passwordHasher.hash(request.password()));
        AdminRepository.UserSummary created = repository.findUsers().stream()
                .filter(user -> user.id() == userId)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Created user was not returned."));
        log.info("Admin userId={} created userId={} username={}", adminId, userId, created.username());
        return ResponseEntity.created(URI.create("/api/admin/users/" + userId)).body(created);
    }

    @PutMapping("/users/{userId}/password")
    public ResponseEntity<Void> updatePassword(@PathVariable long userId,
                                               @Valid @RequestBody UpdatePasswordRequest request,
                                               HttpSession session) {
        requireAdmin(session);
        if (!repository.updatePassword(userId, passwordHasher.hash(request.password())))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active user was not found.");
        log.info("Admin updated password for userId={}", userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Void> deleteUser(@PathVariable long userId, HttpSession session) {
        long adminId = requireAdmin(session);
        if (adminId == userId)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot delete your own admin account.");
        if (!repository.deactivateUser(userId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active user was not found.");
        log.info("Admin deactivated userId={}", userId);
        return ResponseEntity.noContent().build();
    }

    private long requireAdmin(HttpSession session) {
        Object sessionUserId = session.getAttribute("userId");
        if (!(sessionUserId instanceof Long userId))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue.");
        if (!authRepository.isActiveAdmin(userId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin access is required.");
        return userId;
    }

    public record CreateDealerRequest(
            @NotBlank @Size(max = 40) String dealerCode,
            @NotBlank @Size(max = 200) String legalName,
            @NotBlank @Size(max = 200) String displayName,
            @NotBlank @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Size(max = 100) String stateName,
            @NotBlank @Pattern(regexp = "\\d{2}", message = "State code must be two digits") String stateCode,
            @Size(max = 10) String pincode,
            @Size(max = 15) String gstin,
            @Size(max = 20) String phone,
            @Size(max = 100) String aglNo,
            @Size(max = 100) String plNo) {}

    public record CreateUserRequest(
            @NotBlank @Size(max = 80) String username,
            @NotBlank @Size(min = 8, max = 256) String password,
            @NotBlank @Size(max = 200) String fullName,
            @NotBlank @Pattern(regexp = "ADMIN|DEALER|EMPLOYEE") String roleCode,
            @NotNull Long dealerId) {}

    public record UpdatePasswordRequest(@NotBlank @Size(min = 8, max = 256) String password) {}
}
