package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config holds user-configurable settings persisted in config.json.
type Config struct {
	Port    int    `json:"port"`
	DataDir string `json:"dataDir,omitempty"`
}

const defaultPort = 8665

// loadConfig reads config.json from the default data directory (fixed location).
// Config always lives at the OS-default location even if data is stored elsewhere.
func loadConfig() (*Config, error) {
	cfgPath := filepath.Join(getDataDir(), "config.json")

	data, err := os.ReadFile(cfgPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := &Config{Port: defaultPort}
			return cfg, saveConfig(cfg)
		}
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		// Corrupted config — reset to defaults
		cfg = Config{Port: defaultPort}
		return &cfg, saveConfig(&cfg)
	}

	if cfg.Port == 0 {
		cfg.Port = defaultPort
	}
	return &cfg, nil
}

// saveConfig writes config.json to the default data directory (fixed location).
func saveConfig(cfg *Config) error {
	configDir := getDataDir()
	if err := ensureDir(configDir); err != nil {
		return err
	}
	cfgPath := filepath.Join(configDir, "config.json")
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cfgPath, data, 0644)
}
