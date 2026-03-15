package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// migrateData copies data files from src to dst, skipping config/lock/logs.
func migrateData(src, dst string) error {
	if err := ensureDir(dst); err != nil {
		return fmt.Errorf("create destination: %w", err)
	}

	skipFiles := map[string]bool{
		"config.json": true,
		"kubby.lock":  true,
	}
	skipDirs := map[string]bool{
		"logs": true,
	}

	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if relPath == "." {
			return nil
		}

		// Skip config, lock files
		if skipFiles[filepath.Base(relPath)] {
			return nil
		}

		// Skip logs directory
		topDir := strings.SplitN(relPath, string(filepath.Separator), 2)[0]
		if skipDirs[topDir] {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		dstPath := filepath.Join(dst, relPath)

		if info.IsDir() {
			return ensureDir(dstPath)
		}

		log.Printf("Migrating: %s", relPath)
		return copyFile(path, dstPath)
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}

	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
