package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const (
	defaultMaxSize  = 10 * 1024 * 1024 // 10 MB
	defaultMaxFiles = 5
)

// RotatingWriter is an io.Writer that automatically rotates log files
// when they exceed maxSize. It keeps up to maxFiles old log files.
type RotatingWriter struct {
	dir      string
	filename string
	maxSize  int64
	maxFiles int

	mu   sync.Mutex
	file *os.File
	size int64
}

// NewRotatingWriter creates a rotating writer. It opens (or creates) the log
// file and records its current size so rotation is seamless across restarts.
func NewRotatingWriter(dir, filename string) (*RotatingWriter, error) {
	w := &RotatingWriter{
		dir:      dir,
		filename: filename,
		maxSize:  defaultMaxSize,
		maxFiles: defaultMaxFiles,
	}
	if err := w.openFile(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *RotatingWriter) logPath() string {
	return filepath.Join(w.dir, w.filename)
}

func (w *RotatingWriter) openFile() error {
	f, err := os.OpenFile(w.logPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("open log file: %w", err)
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return fmt.Errorf("stat log file: %w", err)
	}
	w.file = f
	w.size = info.Size()
	return nil
}

// Write implements io.Writer. It checks the size before writing and
// rotates if the file would exceed maxSize.
func (w *RotatingWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.size+int64(len(p)) > w.maxSize {
		if rotateErr := w.rotate(); rotateErr != nil {
			// If rotation fails, keep writing to the current file
			_ = rotateErr
		}
	}

	n, err = w.file.Write(p)
	w.size += int64(n)
	return
}

// rotate shifts existing log files and starts a new one.
//
//	kubby.log.4 -> deleted
//	kubby.log.3 -> kubby.log.4
//	kubby.log.2 -> kubby.log.3
//	kubby.log.1 -> kubby.log.2
//	kubby.log   -> kubby.log.1
//	(new empty)  -> kubby.log
func (w *RotatingWriter) rotate() error {
	if w.file != nil {
		w.file.Close()
	}

	base := w.logPath()

	// Remove the oldest file
	oldest := fmt.Sprintf("%s.%d", base, w.maxFiles)
	_ = os.Remove(oldest)

	// Shift existing rotated files
	for i := w.maxFiles - 1; i >= 1; i-- {
		src := fmt.Sprintf("%s.%d", base, i)
		dst := fmt.Sprintf("%s.%d", base, i+1)
		_ = os.Rename(src, dst)
	}

	// Rotate current log to .1
	_ = os.Rename(base, base+".1")

	return w.openFile()
}

// Close closes the underlying file.
func (w *RotatingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file != nil {
		return w.file.Close()
	}
	return nil
}
