package handlers

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"
)

func TestPrepareBrandingAssetValidatesSemanticShape(t *testing.T) {
	var square bytes.Buffer
	if err := png.Encode(&square, image.NewRGBA(image.Rect(0, 0, 128, 128))); err != nil {
		t.Fatal(err)
	}
	if _, _, err := prepareBrandingAsset(square.Bytes(), "mark.png", "mark-on-dark"); err != nil {
		t.Fatalf("valid square mark rejected: %v", err)
	}
	if _, _, err := prepareBrandingAsset(square.Bytes(), "side.png", "horizontal-on-dark"); err == nil {
		t.Fatal("square image accepted as horizontal lockup")
	}

	wide := image.NewRGBA(image.Rect(0, 0, 400, 100))
	wide.Set(0, 0, color.Black)
	var horizontal bytes.Buffer
	if err := png.Encode(&horizontal, wide); err != nil {
		t.Fatal(err)
	}
	if _, _, err := prepareBrandingAsset(horizontal.Bytes(), "side.png", "horizontal-on-light"); err != nil {
		t.Fatalf("valid horizontal lockup rejected: %v", err)
	}
}

func TestPrepareBrandingAssetSanitizesSVG(t *testing.T) {
	unsafe := []byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><path d="M0 0h1"/></a></svg>`)
	clean, ext, err := prepareBrandingAsset(unsafe, "mark.svg", "favicon")
	if err != nil {
		t.Fatal(err)
	}
	if ext != ".svg" {
		t.Fatalf("unexpected extension %q", ext)
	}
	output := strings.ToLower(string(clean))
	for _, forbidden := range []string{"<script", "onload", "javascript:"} {
		if strings.Contains(output, forbidden) {
			t.Fatalf("sanitizer retained %q in %s", forbidden, output)
		}
	}
}
