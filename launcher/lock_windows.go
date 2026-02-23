//go:build windows

package main

import (
	"os"
	"syscall"
	"unsafe"
)

var (
	modkernel32      = syscall.NewLazyDLL("kernel32.dll")
	procLockFileEx   = modkernel32.NewProc("LockFileEx")
	procUnlockFileEx = modkernel32.NewProc("UnlockFileEx")
)

const (
	lockfileExclusiveLock = 0x02
	lockfileFailImmediately = 0x01
)

func lockFile(f *os.File) bool {
	var overlapped syscall.Overlapped
	r, _, _ := procLockFileEx.Call(
		f.Fd(),
		uintptr(lockfileExclusiveLock|lockfileFailImmediately),
		0,
		1, 0,
		uintptr(unsafe.Pointer(&overlapped)),
	)
	return r != 0
}

func unlockFile(f *os.File) {
	var overlapped syscall.Overlapped
	procUnlockFileEx.Call(
		f.Fd(),
		0,
		1, 0,
		uintptr(unsafe.Pointer(&overlapped)),
	)
}
