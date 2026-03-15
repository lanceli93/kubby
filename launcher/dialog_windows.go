//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

var (
	user32          = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW = user32.NewProc("MessageBoxW")
)

const (
	mbOK           = 0x00000000
	mbYesNo        = 0x00000004
	mbIconQuestion = 0x00000020
	mbIconInfo     = 0x00000040
	mbIconWarning  = 0x00000030
	idYes          = 6
)

// pickFolder opens a Windows folder picker dialog via PowerShell.
func pickFolder(title string) (string, bool) {
	safeTitle := strings.ReplaceAll(title, "'", "''")
	script := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '%s'
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }`, safeTitle)

	cmd := exec.Command("powershell", "-WindowStyle", "Hidden", "-NoProfile", "-Command", script)
	hideConsoleWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return "", false
	}
	result := strings.TrimSpace(string(out))
	if result == "" {
		return "", false
	}
	return result, true
}

// showInfo displays an informational message box.
func showInfo(title, message string) {
	winMessageBox(title, message, mbOK|mbIconInfo)
}

// confirmYesNo displays a Yes/No question dialog. Returns true if Yes.
func confirmYesNo(title, message string) bool {
	return winMessageBox(title, message, mbYesNo|mbIconQuestion) == idYes
}

func winMessageBox(title, message string, flags uint32) int {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	messagePtr, _ := syscall.UTF16PtrFromString(message)
	ret, _, _ := procMessageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(messagePtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		uintptr(flags),
	)
	return int(ret)
}
