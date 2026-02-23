package main

import (
	"os"
	"path/filepath"
)

// lockFilePath returns the path to the single-instance lock file.
func lockFilePath(dataDir string) string {
	return filepath.Join(dataDir, "kubby.lock")
}

// tryAcquireLock tries to create and exclusively lock a file.
// Returns the file handle (keep open to hold the lock) and whether the lock was acquired.
// On failure, another instance is already running.
func tryAcquireLock(dataDir string) (*os.File, bool) {
	lockPath := lockFilePath(dataDir)

	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return nil, false
	}

	if !lockFile(f) {
		f.Close()
		return nil, false
	}

	return f, true
}

// releaseLock releases the lock and removes the lock file.
func releaseLock(f *os.File, dataDir string) {
	if f != nil {
		unlockFile(f)
		f.Close()
		os.Remove(lockFilePath(dataDir))
	}
}
