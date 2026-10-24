package com.example.fertilizer.auth;

public record LoginResponse(String username, String fullName, String role,
                            Long dealerId, String dealerName, String stateCode,
                            String aglNo, String plNo) {}
