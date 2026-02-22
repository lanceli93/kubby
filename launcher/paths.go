package main

import (
	"os"
	"path/filepath"
	"runtime"
)

// getDataDir returns the OS-standard data directory for Kubby.
//   - Windows:  %LOCALAPPDATA%\Kubby
//   - macOS:    ~/Library/Application Support/Kubby
//   - Linux:    $XDG_DATA_HOME/kubby or ~/.local/share/kubby
func getDataDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Kubby")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "Kubby")
	default: // linux
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			return filepath.Join(xdg, "kubby")
		}
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "kubby")
	}
}

// getExeDir returns the directory where the kubby executable lives.
func getExeDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(exe), nil
}

// ensureDir creates a directory (and parents) if it doesn't exist.
func ensureDir(dir string) error {
	return os.MkdirAll(dir, 0755)
}
