package com.example.fertilizer.auth;

import java.util.List;

public record LoginResponse(Long userId, String username, String fullName, String role,
                            Long dealerId, String dealerName, String stateCode,
                            String aglNo, String plNo, List<String> permissions) {}
