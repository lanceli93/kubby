package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
)

// iconData is a generated 32x32 tray icon PNG.
// Replace this with an actual icon by updating assets/ and re-embedding.
var iconData = generateIcon()

func generateIcon() []byte {
	const size = 32
	img := image.NewRGBA(image.Rect(0, 0, size, size))

	// Kubby blue background with rounded feel
	bg := color.RGBA{R: 0x64, G: 0x6C, B: 0xFF, A: 255}  // Indigo-ish
	fg := color.RGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: 255}   // White

	// Fill background circle (approximate)
	cx, cy := float64(size)/2, float64(size)/2
	r := float64(size)/2 - 1
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			dx := float64(x) - cx + 0.5
			dy := float64(y) - cy + 0.5
			if dx*dx+dy*dy <= r*r {
				img.Set(x, y, bg)
			}
		}
	}

	// Draw a simple "K" letter
	// Vertical bar: x=10, y=8..24
	for y := 8; y <= 24; y++ {
		for x := 10; x <= 12; x++ {
			img.Set(x, y, fg)
		}
	}
	// Upper diagonal: from (13,16) to (21,8)
	for i := 0; i <= 8; i++ {
		x := 13 + i
		y := 16 - i
		if x < size && y >= 0 {
			img.Set(x, y, fg)
			img.Set(x, y+1, fg)
		}
	}
	// Lower diagonal: from (13,16) to (21,24)
	for i := 0; i <= 8; i++ {
		x := 13 + i
		y := 16 + i
		if x < size && y < size {
			img.Set(x, y, fg)
			img.Set(x, y-1, fg)
		}
	}

	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}
