package handlers

import (
	"reflect"
	"testing"

	"coresdashboard/internal/config"
)

func TestPublicServiceURLs(t *testing.T) {
	publicURLs := map[string]string{
		"rentalUrl":      "https://rent.example.com",
		"warehouseUrl":   "https://warehouse.example.com",
		"plannerUrl":     "https://planner.example.com",
		"procurementUrl": "https://procurement.example.com",
	}
	tests := []struct {
		name string
		mode string
		want map[string]string
	}{
		{name: "paths", mode: "paths", want: map[string]string{
			"rentalUrl": "/rentalcore/", "warehouseUrl": "/warehousecore/",
			"plannerUrl": "/plannercore/", "procurementUrl": "/procurementcore/",
		}},
		{name: "subdomains", mode: "subdomains", want: publicURLs},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &config.Config{
				RoutingMode: tt.mode, RentalPublicURL: publicURLs["rentalUrl"],
				WarehousePublicURL: publicURLs["warehouseUrl"], PlannercorePublicURL: publicURLs["plannerUrl"],
				ProcurementPublicURL: publicURLs["procurementUrl"],
			}
			if got := publicServiceURLs(cfg); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("publicServiceURLs() = %#v, want %#v", got, tt.want)
			}
		})
	}
}
