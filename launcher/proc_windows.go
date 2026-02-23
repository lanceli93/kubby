//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// hideConsoleWindow sets Windows-specific process creation flags
// to prevent the Node.js child process from showing a console window.
func hideConsoleWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
