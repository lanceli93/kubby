//go:build !windows

package main

import (
	"os"
	"syscall"
)

func lockFile(f *os.File) bool {
	err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	return err == nil
}

func unlockFile(f *os.File) {
	syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
}
