package handlers

import (
	"net/http/httptest"
	"testing"

	"coresdashboard/internal/config"
)

func TestSafeReturnURL(t *testing.T) {
	handler := &AuthHandler{cfg: &config.Config{
		RentalPublicURL:    "https://rent.example.com",
		WarehousePublicURL: "https://warehouse.example.com",
	}}
	request := httptest.NewRequest("GET", "https://cores.example.com/login", nil)

	tests := map[string]string{
		"":                                       "/",
		"/warehousecore/jobs?open=1":             "/warehousecore/jobs?open=1",
		"https://cores.example.com/rentalcore/":  "https://cores.example.com/rentalcore/",
		"https://warehouse.example.com/products": "https://warehouse.example.com/products",
		"https://attacker.example/phish":         "/",
		"//attacker.example/phish":               "/",
		"/\\attacker.example/phish":              "/",
		"javascript:alert(1)":                    "/",
	}
	for input, want := range tests {
		if got := handler.safeReturnURL(request, input); got != want {
			t.Errorf("safeReturnURL(%q) = %q, want %q", input, got, want)
		}
	}
}
