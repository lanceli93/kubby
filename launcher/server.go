package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// Server manages the Node.js child process running Next.js standalone.
type Server struct {
	cmd     *exec.Cmd
	mu      sync.Mutex
	stopped bool
}

// StartServer launches the Node.js process with the appropriate environment.
func StartServer(exeDir, dataDir string, port int, authSecret string) (*Server, error) {
	// Resolve paths to bundled Node.js and server.js
	nodeBin := resolveNodeBin(exeDir)
	serverJS := filepath.Join(exeDir, "server", "server.js")
	ffprobeBin := resolveFfprobeBin(exeDir)

	// Ensure log directory exists
	logDir := filepath.Join(dataDir, "logs")
	if err := ensureDir(logDir); err != nil {
		return nil, fmt.Errorf("create log dir: %w", err)
	}

	logFile, err := os.OpenFile(
		filepath.Join(logDir, "kubby.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND,
		0644,
	)
	if err != nil {
		return nil, fmt.Errorf("open log file: %w", err)
	}

	cmd := exec.Command(nodeBin, serverJS)
	cmd.Dir = filepath.Join(exeDir, "server")
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("PORT=%d", port),
		fmt.Sprintf("HOSTNAME=%s", "0.0.0.0"),
		fmt.Sprintf("KUBBY_DATA_DIR=%s", dataDir),
		fmt.Sprintf("FFPROBE_PATH=%s", ffprobeBin),
		fmt.Sprintf("AUTH_SECRET=%s", authSecret),
		"AUTH_TRUST_HOST=true",
		"NODE_ENV=production",
	)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	// On Windows: hide the Node.js console window
	hideConsoleWindow(cmd)

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("start node: %w", err)
	}

	log.Printf("Node.js server started (PID %d) on port %d", cmd.Process.Pid, port)

	s := &Server{cmd: cmd}

	// Monitor process exit in background
	go func() {
		_ = cmd.Wait()
		logFile.Close()
		s.mu.Lock()
		s.stopped = true
		s.mu.Unlock()
		log.Println("Node.js process exited")
	}()

	return s, nil
}

// WaitReady polls the server until it responds or the timeout is reached.
func WaitReady(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://localhost:%d/api/setup/status", port)

	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
		resp, err := http.DefaultClient.Do(req)
		cancel()

		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				log.Println("Server is ready")
				return nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("server did not become ready within %s", timeout)
}

// Stop gracefully shuts down the Node.js process.
func (s *Server) Stop() {
	s.mu.Lock()
	if s.stopped {
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()

	log.Println("Stopping Node.js server...")

	if s.cmd.Process == nil {
		return
	}

	// Try graceful shutdown first
	if runtime.GOOS == "windows" {
		// Windows: taskkill /T kills the entire process tree (node + workers)
		_ = exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", s.cmd.Process.Pid)).Run()
	} else {
		_ = s.cmd.Process.Signal(os.Interrupt)
	}

	// Wait up to 5 seconds for graceful exit
	done := make(chan struct{})
	go func() {
		for i := 0; i < 50; i++ {
			s.mu.Lock()
			stopped := s.stopped
			s.mu.Unlock()
			if stopped {
				close(done)
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
		close(done)
	}()

	<-done

	s.mu.Lock()
	if !s.stopped {
		s.mu.Unlock()
		log.Println("Force killing Node.js process")
		_ = s.cmd.Process.Kill()
	} else {
		s.mu.Unlock()
	}
}

// IsPortAvailable checks if a TCP port is free.
func IsPortAvailable(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return false
	}
	ln.Close()
	return true
}

// resolveNodeBin returns the path to the bundled node binary.
func resolveNodeBin(exeDir string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(exeDir, "node", "node.exe")
	}
	return filepath.Join(exeDir, "node", "bin", "node")
}

// resolveFfprobeBin returns the path to the bundled ffprobe binary.
func resolveFfprobeBin(exeDir string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(exeDir, "bin", "ffprobe.exe")
	}
	return filepath.Join(exeDir, "bin", "ffprobe")
}
