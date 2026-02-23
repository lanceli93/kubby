package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config holds user-configurable settings persisted in config.json.
type Config struct {
	Port              int  `json:"port"`
	AllowRemoteAccess bool `json:"allowRemoteAccess"`
}

const defaultPort = 3000

// loadConfig reads config.json from dataDir, creating it with defaults if missing.
func loadConfig(dataDir string) (*Config, error) {
	cfgPath := filepath.Join(dataDir, "config.json")

	data, err := os.ReadFile(cfgPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := &Config{Port: defaultPort}
			return cfg, saveConfig(dataDir, cfg)
		}
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		// Corrupted config — reset to defaults
		cfg = Config{Port: defaultPort}
		return &cfg, saveConfig(dataDir, &cfg)
	}

	if cfg.Port == 0 {
		cfg.Port = defaultPort
	}
	return &cfg, nil
}

// saveConfig writes config.json to dataDir.
func saveConfig(dataDir string, cfg *Config) error {
	cfgPath := filepath.Join(dataDir, "config.json")
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cfgPath, data, 0644)
}
