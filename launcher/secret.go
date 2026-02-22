package main

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
)

// loadOrCreateSecret reads AUTH_SECRET from {dataDir}/auth-secret,
// generating a new one if the file doesn't exist.
func loadOrCreateSecret(dataDir string) (string, error) {
	secretPath := filepath.Join(dataDir, "auth-secret")

	data, err := os.ReadFile(secretPath)
	if err == nil {
		secret := strings.TrimSpace(string(data))
		if len(secret) >= 32 {
			return secret, nil
		}
		// Too short — regenerate
	}

	// Generate 32 random bytes → 64 hex chars
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	secret := hex.EncodeToString(buf)

	if err := os.WriteFile(secretPath, []byte(secret+"\n"), 0600); err != nil {
		return "", err
	}
	return secret, nil
}
